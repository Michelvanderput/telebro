const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { scan, sidecarSubs } = require('./library');
const media = require('./media');
const { srtToVtt } = require('./subs');
const { createServer, lanIp } = require('./server');
const { CastController } = require('./cast');

const PORT = 8765;
const cast = new CastController();
let win;
let items = [];
const byId = new Map();
const probes = new Map();
const sessions = new Map(); // sessionId -> { dir, proc }
let current = null;

const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
const loadCfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch { return { folders: [], lastDevice: null }; } };
const saveCfg = (c) => fs.writeFileSync(cfgFile(), JSON.stringify(c, null, 2));
let cfg = { folders: [], lastDevice: null };

function refreshLibrary() {
  items = scan(cfg.folders);
  byId.clear();
  items.forEach((i) => byId.set(i.id, i));
  return items;
}

async function getProbe(id) {
  if (!probes.has(id)) probes.set(id, await media.probe(byId.get(id).file));
  return probes.get(id);
}

// Ondertitel: "s<n>" = ingebed in het bestand, "x<n>" = los .srt/.vtt naast de film
async function subtitleVtt(id, key) {
  const item = byId.get(id);
  if (!item) throw new Error('onbekend item');
  if (key[0] === 'x') {
    const sc = item.sidecars[+key.slice(1)];
    const raw = fs.readFileSync(sc.file, 'utf8');
    return /\.vtt$/i.test(sc.file) ? raw : srtToVtt(raw);
  }
  return media.extractSubtitle(item.file, +key.slice(1));
}

function stopSessions() {
  for (const s of sessions.values()) {
    try { s.proc && s.proc.kill('SIGKILL'); } catch {}
    fs.rm(s.dir, { recursive: true, force: true }, () => {});
  }
  sessions.clear();
}

const server = createServer({
  file: (id) => (byId.get(id) || {}).file || null,
  sub: subtitleVtt,
  hlsDir: (sid) => (sessions.get(sid) || {}).dir || null,
});

async function waitFor(file, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (fs.readFileSync(file, 'utf8').includes('.m4s')) return; } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('ffmpeg leverde geen stream op');
}

async function playOnTv({ id, host, audioIndex = 0, subKey = null, start = 0 }) {
  const item = byId.get(id);
  const info = await getProbe(id);
  const plan = media.plan(info, audioIndex);
  const base = `http://${lanIp(host)}:${PORT}`;
  await cast.connect(host);
  stopSessions();
  let url; let contentType; let streamType = 'BUFFERED'; let startAt = 0;
  if (plan.mode === 'direct') {
    url = `${base}/file/${id}`; contentType = 'video/mp4'; startAt = start;
  } else {
    const sid = crypto.randomBytes(6).toString('hex');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'telebro-'));
    const proc = media.startHls({ file: item.file, plan, audioIndex, start, outDir: dir });
    sessions.set(sid, { dir, proc });
    await waitFor(path.join(dir, 'index.m3u8'));
    url = `${base}/hls/${sid}/index.m3u8`; contentType = 'application/x-mpegurl';
  }
  const tracks = [
    ...item.sidecars.map((s, i) => ({ key: `x${i}`, url: `${base}/sub/${id}/x${i}.vtt`, name: `Los (${s.language})`, language: s.language })),
    ...info.subs.filter((s) => s.text).map((s) => ({ key: `s${s.index}`, url: `${base}/sub/${id}/s${s.index}.vtt`, name: s.title || s.language, language: s.language })),
  ];
  const active = tracks.findIndex((t) => t.key === subKey) + 1; // 0 = geen
  await cast.load({ url, contentType, streamType, startAt, duration: info.duration, title: item.title, tracks, activeTrack: active || 0 });
  current = { id, host, audioIndex, subKey, offset: plan.mode === 'direct' ? 0 : start, duration: info.duration, tracks, plan };
  cfg.lastDevice = host; saveCfg(cfg);
  return { plan, offset: current.offset, tracks: tracks.map((t) => ({ key: t.key, name: t.name })) };
}

function wire() {
  ipcMain.handle('library:get', () => ({ items, folders: cfg.folders, lastDevice: cfg.lastDevice }));
  ipcMain.handle('library:addFolder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (r.canceled) return { items, folders: cfg.folders };
    cfg.folders = [...new Set([...cfg.folders, ...r.filePaths])]; saveCfg(cfg);
    return { items: refreshLibrary(), folders: cfg.folders };
  });
  ipcMain.handle('library:removeFolder', (_e, f) => {
    cfg.folders = cfg.folders.filter((x) => x !== f); saveCfg(cfg);
    return { items: refreshLibrary(), folders: cfg.folders };
  });
  ipcMain.handle('media:info', async (_e, id) => {
    const info = await getProbe(id);
    const item = byId.get(id);
    return { audio: info.audio, subs: info.subs, sidecars: item.sidecars.map((s, i) => ({ key: `x${i}`, language: s.language })),
      duration: info.duration, plan: media.plan(info, 0), video: info.video && { codec: info.video.codec_name, w: info.video.width, h: info.video.height } };
  });
  ipcMain.handle('cast:devices', () => { cast.discover(); return cast.list(); });
  ipcMain.handle('cast:play', (_e, o) => playOnTv(o));
  ipcMain.handle('cast:pause', () => cast.pause());
  ipcMain.handle('cast:resume', () => cast.play());
  ipcMain.handle('cast:stop', async () => { await cast.stop().catch(() => {}); stopSessions(); current = null; });
  ipcMain.handle('cast:volume', (_e, v) => cast.setVolume(v));
  ipcMain.handle('cast:seek', async (_e, t) => {
    if (!current) return;
    if (current.plan.mode === 'direct') return cast.seek(t);
    // HLS: binnen wat al klaar staat gewoon spoelen, anders opnieuw starten op de nieuwe positie
    return playOnTv({ id: current.id, host: current.host, audioIndex: current.audioIndex, subKey: current.subKey, start: t });
  });
  ipcMain.handle('cast:subtitle', (_e, key) => {
    if (!current) return;
    current.subKey = key;
    const idx = current.tracks.findIndex((t) => t.key === key) + 1;
    return cast.setSubtitle(idx || 0);
  });
  cast.on('devices', (d) => win && win.webContents.send('devices', d));
  cast.on('status', (s) => win && win.webContents.send('status', {
    state: s.playerState, time: (s.currentTime || 0) + (current ? current.offset : 0), duration: current ? current.duration : 0,
    volume: s.volume && s.volume.level }));
  cast.on('error', (e) => win && win.webContents.send('error', String(e.message || e)));
}

app.whenReady().then(() => {
  cfg = loadCfg();
  refreshLibrary();
  server.listen(PORT, '0.0.0.0');
  wire();
  win = new BrowserWindow({
    width: 1280, height: 820, backgroundColor: '#0b0b0f', titleBarStyle: 'hiddenInset',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  cast.discover();
});
app.on('before-quit', () => { stopSessions(); cast.disconnect(); });
app.on('window-all-closed', () => app.quit());

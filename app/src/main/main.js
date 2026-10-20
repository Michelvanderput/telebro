const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { scan } = require('./library');
const media = require('./media');
const { srtToVtt } = require('./subs');
const { createServer, lanIp } = require('./server');
const { CastController } = require('./cast');
const { TorrentManager } = require('./torrents');
const { fillMissing } = require('./meta');
const lib = require('../renderer/lib.js');

const PORT = 8765;
const DEFAULTS = { folders: [], lastDevice: null, downloadDir: null, tmdbKey: '', positions: {}, watched: {}, torrents: [], meta: {} };
const cast = new CastController();
let win;
let cfg = { ...DEFAULTS };
let items = [];
const byId = new Map();
const probes = new Map();
const sessions = new Map(); // sessionId -> { dir, proc }
let current = null;
let torrents = null;
let lastSave = 0;

const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
const loadCfg = () => { try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) }; } catch { return { ...DEFAULTS }; } };
let saveTimer;
const saveCfg = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => {
  try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)); } catch (e) { console.error('config opslaan mislukt', e.message); } }, 300); };
const send = (ch, d) => { if (win && !win.isDestroyed()) win.webContents.send(ch, d); };

function refreshLibrary() {
  items = scan([...cfg.folders, cfg.downloadDir]);
  byId.clear();
  items.forEach((i) => byId.set(i.id, i));
  return items;
}
const snapshot = () => ({
  items, folders: cfg.folders, lastDevice: cfg.lastDevice, positions: cfg.positions, watched: cfg.watched, meta: cfg.meta,
  settings: { downloadDir: cfg.downloadDir, hasTmdb: !!cfg.tmdbKey },
});

let metaBusy = false;
async function refreshMeta() {
  if (!cfg.tmdbKey || metaBusy) return;
  metaBusy = true;
  try {
    await fillMissing(items, cfg.meta, cfg.tmdbKey, lib.metaKey, { onProgress: () => send('meta', cfg.meta) });
    saveCfg(); send('meta', cfg.meta);
  } catch (e) { send('error', `Metadata: ${e.message}`); } finally { metaBusy = false; }
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
  if (!item) throw new Error('Bestand niet meer gevonden. Is de map nog beschikbaar?');
  const info = await getProbe(id);
  const plan = media.plan(info, audioIndex);
  const base = `http://${lanIp(host)}:${PORT}`;
  await cast.connect(host);
  stopSessions();
  let url; let contentType; let startAt = 0;
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
  const meta = cfg.meta[lib.metaKey(item)] || {};
  await cast.load({ url, contentType, startAt, duration: info.duration, title: item.type === 'series' ? `${item.title} ${lib.epCode(item)}` : item.title, tracks, activeTrack: active || 0 });
  current = { id, host, audioIndex, subKey, offset: plan.mode === 'direct' ? 0 : start, duration: info.duration, tracks, plan, finishing: false };
  cfg.lastDevice = host; saveCfg();
  return { plan, id, title: item.title, ep: item.type === 'series' ? lib.epCode(item) : null, poster: meta.poster || null,
    duration: info.duration, offset: current.offset, tracks: tracks.map((t) => ({ key: t.key, name: t.name })), subKey };
}

function onCastStatus(s) {
  if (!current) return;
  const time = (s.currentTime || 0) + current.offset;
  send('status', { state: s.playerState, time, duration: current.duration, volume: s.volume && s.volume.level });
  const now = Date.now();
  if (s.playerState === 'PLAYING' || s.playerState === 'PAUSED') {
    if (now - lastSave > 8000 && time > 20) {
      lastSave = now;
      if (current.duration && time / current.duration > 0.93) { cfg.watched[current.id] = true; delete cfg.positions[current.id]; }
      else cfg.positions[current.id] = { t: Math.floor(time), d: Math.floor(current.duration), at: now };
      saveCfg(); send('progress', { positions: cfg.positions, watched: cfg.watched });
    }
  } else if (s.playerState === 'IDLE' && s.idleReason === 'FINISHED' && !current.finishing) {
    current.finishing = true;
    const done = byId.get(current.id); const host = current.host;
    cfg.watched[current.id] = true; delete cfg.positions[current.id]; saveCfg();
    send('progress', { positions: cfg.positions, watched: cfg.watched });
    const next = lib.nextEpisode(items, done);
    if (next) {
      send('toast', `Volgende aflevering: ${lib.epCode(next)}`);
      playOnTv({ id: next.id, host, start: (cfg.positions[next.id] || {}).t || 0 })
        .then((r) => send('nowplaying', r)).catch((e) => send('error', e.message));
    } else send('ended', {});
  }
}

function wire() {
  const h = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => fn(...a));
  h('library:get', () => snapshot());
  h('library:addFolder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (!r.canceled) { cfg.folders = [...new Set([...cfg.folders, ...r.filePaths])]; saveCfg(); refreshLibrary(); refreshMeta(); }
    return snapshot();
  });
  h('library:removeFolder', (f) => { cfg.folders = cfg.folders.filter((x) => x !== f); saveCfg(); refreshLibrary(); return snapshot(); });
  h('library:rescan', () => { refreshLibrary(); refreshMeta(); return snapshot(); });
  h('library:markWatched', (id, v) => { if (v) { cfg.watched[id] = true; delete cfg.positions[id]; } else delete cfg.watched[id]; saveCfg(); return snapshot(); });

  h('settings:setTmdb', (key) => { cfg.tmdbKey = String(key || '').trim(); if (cfg.tmdbKey) { for (const k of Object.keys(cfg.meta)) if (cfg.meta[k].none) delete cfg.meta[k]; } saveCfg(); refreshMeta(); return snapshot(); });
  h('settings:chooseDownloadDir', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    if (!r.canceled) { cfg.downloadDir = r.filePaths[0]; torrents.dir = cfg.downloadDir; saveCfg(); refreshLibrary(); }
    return snapshot();
  });

  h('media:info', async (id) => {
    const info = await getProbe(id);
    const item = byId.get(id);
    return { audio: info.audio, subs: info.subs, sidecars: item.sidecars.map((s, i) => ({ key: `x${i}`, language: s.language })),
      duration: info.duration, plan: media.plan(info, 0), video: info.video && { codec: info.video.codec_name, w: info.video.width, h: info.video.height } };
  });

  h('cast:devices', () => { cast.discover(); return cast.list(); });
  h('cast:play', (o) => playOnTv(o));
  h('cast:pause', () => cast.pause());
  h('cast:resume', () => cast.play());
  h('cast:stop', async () => { await cast.stop().catch(() => {}); stopSessions(); current = null; });
  h('cast:volume', (v) => cast.setVolume(v));
  h('cast:seek', async (t) => {
    if (!current) return;
    if (current.plan.mode === 'direct') return cast.seek(t);
    return playOnTv({ id: current.id, host: current.host, audioIndex: current.audioIndex, subKey: current.subKey, start: t });
  });
  h('cast:subtitle', (key) => {
    if (!current) return;
    current.subKey = key;
    return cast.setSubtitle(current.tracks.findIndex((t) => t.key === key) + 1);
  });
  h('cast:next', async () => {
    if (!current) return;
    const next = lib.nextEpisode(items, byId.get(current.id));
    if (!next) throw new Error('Geen volgende aflevering');
    return playOnTv({ id: next.id, host: current.host, start: (cfg.positions[next.id] || {}).t || 0 });
  });

  h('dl:add', (magnet) => torrents.add(magnet));
  h('dl:addFile', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Torrent', extensions: ['torrent'] }] });
    return r.canceled ? null : torrents.addFile(r.filePaths[0]);
  });
  h('dl:addData', (bytes) => torrents.add(Buffer.from(bytes)));
  h('dl:list', () => torrents.list());
  h('dl:pause', (id) => torrents.pause(id));
  h('dl:resume', (id) => torrents.resume(id));
  h('dl:remove', async (id, del) => { await torrents.remove(id, !!del); cfg.torrents = torrents.persist(); saveCfg(); refreshLibrary(); return snapshot(); });
  h('dl:reveal', (id) => { const t = torrents.list().find((x) => x.id === id); if (t && t.path) shell.showItemInFolder(t.path); });

  cast.on('devices', (d) => send('devices', d));
  cast.on('status', onCastStatus);
  cast.on('error', (e) => send('error', String(e.message || e)));
}

async function startTorrents() {
  if (!cfg.downloadDir) cfg.downloadDir = path.join(app.getPath('home'), 'Movies', 'Telebro');
  fs.mkdirSync(cfg.downloadDir, { recursive: true });
  torrents = new TorrentManager({
    dir: cfg.downloadDir, saved: cfg.torrents,
    onDone: (e) => { cfg.torrents = torrents.persist(); saveCfg(); refreshLibrary(); send('library', snapshot()); send('toast', `Download klaar: ${e.name}`); refreshMeta(); },
  });
  try { await torrents.init(); } catch (e) { send('error', `Downloaden niet beschikbaar: ${e.message}`); }
  setInterval(() => { if (torrents.client) { send('downloads', torrents.list()); cfg.torrents = torrents.persist(); saveCfg(); } }, 1000);
}

app.whenReady().then(async () => {
  cfg = loadCfg();
  if (!cfg.downloadDir) cfg.downloadDir = path.join(app.getPath('home'), 'Movies', 'Telebro');
  fs.mkdirSync(cfg.downloadDir, { recursive: true });
  refreshLibrary();
  server.listen(PORT, '0.0.0.0');
  wire();
  win = new BrowserWindow({
    width: 1360, height: 880, minWidth: 980, minHeight: 640, backgroundColor: '#0b0b10', titleBarStyle: 'hiddenInset',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  cast.discover();
  startTorrents().then(refreshMeta);
});
app.on('before-quit', () => {
  stopSessions(); cast.disconnect();
  if (torrents && torrents.client) cfg.torrents = torrents.persist();
  try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)); } catch {}
});
app.on('window-all-closed', () => app.quit());

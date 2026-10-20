const fs = require('fs');

const MAGNET = /^magnet:\?(?:.*&)?xt=urn:btih:[a-z0-9]{32,40}/i;

// Dunne laag om WebTorrent (ESM) heen. Geen zoekfunctie: je geeft zelf een magnet-link of .torrent-bestand.
// Na afloop stopt het delen (seeden) standaard, de bestanden blijven staan.
class TorrentManager {
  constructor({ dir, saved = [], onDone = () => {}, options = {} }) {
    this.dir = dir;
    this.saved = saved;       // [{ id, name, magnet, done, path }]
    this.onDone = onDone;
    this.options = options;
    this.client = null;
    this.paused = new Set();
  }

  async init() {
    const { default: WebTorrent } = await import('webtorrent');
    this.client = new WebTorrent(this.options);
    this.client.on('error', (e) => console.error('[torrent]', e.message));
    fs.mkdirSync(this.dir, { recursive: true });
    for (const s of this.saved.filter((x) => !x.done && x.magnet)) this._add(s.magnet).catch(() => {});
  }

  _add(input) {
    return new Promise((resolve, reject) => {
      try {
        const existing = this.client.torrents.find((t) => input.startsWith && t.magnetURI && t.infoHash && input.toLowerCase().includes(t.infoHash));
        if (existing) return resolve(existing);
        const t = this.client.add(input, { path: this.dir });
        t.once('error', reject);
        t.once('ready', () => resolve(t));
        t.on('done', () => this._finish(t));
        if (t.ready) resolve(t);
        // metadata kan lang duren bij magnets; geef meteen een handvat terug
        if (typeof input === 'string') resolve(t);
      } catch (e) { reject(e); }
    });
  }

  async add(input) {
    if (typeof input === 'string') {
      input = input.trim();
      if (!MAGNET.test(input)) throw new Error('Dit is geen geldige magnet-link.');
    } else if (!Buffer.isBuffer(input)) throw new Error('Onbekend invoertype.');
    const t = await this._add(input);
    return t.infoHash;
  }

  async addFile(file) {
    if (!/\.torrent$/i.test(file)) throw new Error('Kies een .torrent-bestand.');
    return this.add(fs.readFileSync(file));
  }

  _finish(t) {
    const entry = { id: t.infoHash, name: t.name, magnet: t.magnetURI, done: true, path: `${t.path}/${t.name}`, length: t.length };
    this.saved = [entry, ...this.saved.filter((s) => s.id !== t.infoHash)];
    // stopt seeden, bestanden blijven; pas daarna melden zodat list() en persist() kloppen
    this.client.remove(t.infoHash, { destroyStore: false }, () => this.onDone(entry));
  }

  list() {
    const live = this.client ? this.client.torrents.map((t) => ({
      id: t.infoHash, name: t.name || t.infoHash, progress: t.progress, done: false, paused: this.paused.has(t.infoHash),
      down: t.downloadSpeed, up: t.uploadSpeed, peers: t.numPeers, length: t.length, downloaded: t.downloaded,
      eta: Number.isFinite(t.timeRemaining) ? t.timeRemaining : null, hasMeta: !!t.files && t.files.length > 0 })) : [];
    const ids = new Set(live.map((l) => l.id));
    const done = this.saved.filter((s) => s.done && !ids.has(s.id)).map((s) => ({
      id: s.id, name: s.name, progress: 1, done: true, length: s.length, path: s.path }));
    return [...live, ...done];
  }

  pause(id) { const t = this.client.torrents.find((x) => x.infoHash === id); if (t) { t.pause(); this.paused.add(id); } }
  resume(id) { const t = this.client.torrents.find((x) => x.infoHash === id); if (t) { t.resume(); this.paused.delete(id); } }

  remove(id, deleteFiles = false) {
    return new Promise((resolve) => {
      const s = this.saved.find((x) => x.id === id);
      this.saved = this.saved.filter((x) => x.id !== id);
      this.paused.delete(id);
      const t = this.client.torrents.find((x) => x.infoHash === id);
      if (!t) {
        if (deleteFiles && s && s.path) fs.rm(s.path, { recursive: true, force: true }, () => resolve());
        else resolve();
        return;
      }
      this.client.remove(id, { destroyStore: deleteFiles }, () => resolve());
    });
  }

  persist() {
    const live = this.client ? this.client.torrents.map((t) => ({ id: t.infoHash, name: t.name, magnet: t.magnetURI, done: false })) : [];
    return [...live, ...this.saved.filter((s) => s.done)];
  }

  async destroy() { if (this.client) await new Promise((r) => this.client.destroy(r)); }
}

module.exports = { TorrentManager, MAGNET };

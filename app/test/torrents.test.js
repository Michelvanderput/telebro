// Twee lokale WebTorrent-clients zonder internet: A deelt een bestand, B downloadt het via TorrentManager.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TorrentManager, MAGNET } = require('../src/main/torrents');

test('magnet-validatie', () => {
  assert.ok(MAGNET.test('magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a&dn=x'));
  assert.ok(!MAGNET.test('http://example.com'));
  assert.ok(!MAGNET.test('magnet:?dn=zonder-hash'));
});

test('add weigert rommel', async () => {
  const m = new TorrentManager({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'dl-')), options: { dht: false, lsd: false, tracker: false } });
  await m.init();
  await assert.rejects(() => m.add('hallo'), /magnet/i);
  await assert.rejects(() => m.addFile('/x/film.mkv'), /torrent/i);
  await m.destroy();
});

test('download tussen twee lokale clients', { timeout: 60000 }, async () => {
  const { default: WebTorrent } = await import('webtorrent');
  const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-'));
  const file = path.join(seedDir, 'Open.Film.2010.mp4');
  fs.writeFileSync(file, Buffer.alloc(3 * 1024 * 1024, 7));
  const opts = { dht: false, lsd: false, tracker: false, utp: false };
  const seeder = new WebTorrent(opts);
  let m;
  try {
  const seeded = await new Promise((r) => seeder.seed(file, { announce: [] }, r));
  const torrentFile = path.join(seedDir, 'x.torrent');
  fs.writeFileSync(torrentFile, seeded.torrentFile);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-'));
  let finished;
  const done = new Promise((r) => { finished = r; });
  m = new TorrentManager({ dir, options: opts, onDone: finished });
  await m.init();
  const id = await m.addFile(torrentFile);
  assert.strictEqual(id, seeded.infoHash);
  m.client.torrents[0].addPeer(`127.0.0.1:${seeder.torrentPort}`);
  const entry = await done;
  assert.strictEqual(entry.name, 'Open.Film.2010.mp4');
  assert.strictEqual(fs.statSync(path.join(dir, 'Open.Film.2010.mp4')).size, 3 * 1024 * 1024);
  assert.strictEqual(m.client.torrents.length, 0, 'seeden stopt na afloop');
  assert.ok(m.list().some((t) => t.done && t.name === 'Open.Film.2010.mp4'));
  assert.ok(m.persist().some((t) => t.done));
  await m.remove(id, false);
  assert.strictEqual(m.list().length, 0);
  } finally {
    if (m) await m.destroy();
    await new Promise((r) => seeder.destroy(r));
  }
});

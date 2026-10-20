const fs = require('fs');
const path = require('path');
const { VIDEO_EXT } = require('./names');
const lib = require('../renderer/lib.js');

const inside = (dir, file) => { const r = path.resolve(file); const d = path.resolve(dir) + path.sep; return r.startsWith(d) && r !== d; };
const hasVideo = (dir) => {
  try { return fs.readdirSync(dir, { withFileTypes: true }).some((e) => (e.isDirectory() ? hasVideo(path.join(dir, e.name)) : VIDEO_EXT.has(path.extname(e.name).toLowerCase()))); }
  catch { return false; }
};

// Ruimt gekeken downloads op na N dagen. Alleen bestanden in de downloadmap, nooit je eigen bibliotheekmappen,
// nooit iets met "Bewaren", en via de prullenbak (trash) zodat je het kunt terughalen.
async function runCleanup({ items, watched, keep, cleanup, downloadDir, trash, now = Date.now() }) {
  const removed = [];
  for (const item of items) {
    const left = lib.daysLeft(item, watched, keep, cleanup, now);
    if (left == null || left > 0 || !inside(downloadDir, item.file)) continue;
    try {
      const stems = [item.file, ...(item.sidecars || []).map((s) => s.file)].filter((f) => fs.existsSync(f) && inside(downloadDir, f));
      for (const f of stems) await trash(f);
      removed.push({ id: item.id, file: item.file, title: item.title });
      // map van de torrent opruimen zodra er geen video meer in zit (en alleen onder de downloadmap)
      let dir = path.dirname(item.file);
      while (inside(downloadDir, dir) && fs.existsSync(dir) && !hasVideo(dir)) { await trash(dir); dir = path.dirname(dir); }
    } catch (e) { console.error('[cleanup]', item.file, e.message); }
  }
  return removed;
}

module.exports = { runCleanup, inside };

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseName, VIDEO_EXT } = require('./names');

const idOf = (file) => crypto.createHash('sha1').update(file).digest('hex').slice(0, 12);

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (VIDEO_EXT.has(path.extname(e.name).toLowerCase())) yield full;
  }
}

// Zoek ondertitelbestanden naast de video: film.srt, film.nl.srt, film.en.vtt
function sidecarSubs(file) {
  const dir = path.dirname(file);
  const stem = path.basename(file, path.extname(file));
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names
    .filter((n) => /\.(srt|vtt)$/i.test(n) && n.toLowerCase().startsWith(stem.toLowerCase()))
    .map((n) => {
      const lang = (n.slice(stem.length).match(/\.([a-z]{2,3})\.(?:srt|vtt)$/i) || [])[1] || 'und';
      return { file: path.join(dir, n), language: lang.toLowerCase() };
    });
}

function scan(folders) {
  const items = []; const seen = new Set();
  for (const folder of new Set(folders)) {
    for (const file of walk(folder)) {
      if (seen.has(file)) continue;
      seen.add(file);
      let st;
      try { st = fs.statSync(file); } catch { continue; }
      items.push({ id: idOf(file), file, size: st.size, added: Math.round(st.mtimeMs), ...parseName(file), sidecars: sidecarSubs(file) });
    }
  }
  items.sort((a, b) =>
    a.title.localeCompare(b.title) || (a.season || 0) - (b.season || 0) || (a.episode || 0) - (b.episode || 0));
  return items;
}

module.exports = { scan, idOf, sidecarSubs };

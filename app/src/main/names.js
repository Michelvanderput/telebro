const path = require('path');

const VIDEO_EXT = new Set(['.mkv', '.mp4', '.m4v', '.mov', '.avi', '.webm', '.ts', '.wmv']);
const NOISE = /\b(2160p|1080p|720p|480p|4k|uhd|hdr10?|dv|bluray|blu-ray|brrip|bdrip|web-?dl|webrip|hdtv|x26[45]|h\.?26[45]|hevc|10bit|aac|ac3|dts|atmos|remux|proper|repack|extended|multi|nl|eng)\b.*$/i;

const clean = (s) => s.replace(/[._]+/g, ' ').replace(NOISE, '').replace(/\s+/g, ' ').trim();

// "Show.Name.S02E05.1080p.mkv" of "Show Name 2x05" -> serie; "Film (2019)" / "Film.2019." -> film
function parseName(file) {
  const base = path.basename(file, path.extname(file));
  const ep = base.match(/^(.*?)[ ._-]+s(\d{1,2})[ ._-]?e(\d{1,3})/i) || base.match(/^(.*?)[ ._-]+(\d{1,2})x(\d{2,3})\b/i);
  if (ep) {
    return { type: 'series', title: clean(ep[1]) || 'Onbekend', season: +ep[2], episode: +ep[3] };
  }
  const yr = base.match(/^(.*?)[ ._(\[-]+((?:19|20)\d{2})(?!\d)/);
  if (yr && clean(yr[1])) return { type: 'movie', title: clean(yr[1]), year: +yr[2] };
  return { type: 'movie', title: clean(base) || base };
}

module.exports = { parseName, VIDEO_EXT };

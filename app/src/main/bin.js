const fs = require('fs');

// Pad naar ffmpeg/ffprobe: meegeleverde binary als die echt bestaat, anders die op het systeem.
function resolve(mod, fallback) {
  try {
    const p = require(mod);
    const file = (typeof p === 'string' ? p : p.path).replace('app.asar', 'app.asar.unpacked');
    if (fs.existsSync(file)) return file;
  } catch {}
  return fallback;
}
module.exports = {
  ffmpeg: resolve('ffmpeg-static', 'ffmpeg'),
  ffprobe: resolve('ffprobe-static', 'ffprobe'),
};

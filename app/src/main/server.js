const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
  '.m3u8': 'application/vnd.apple.mpegurl', '.m4s': 'video/iso.segment', '.vtt': 'text/vtt' };

function lanIp(peer) {
  const nets = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
  if (peer) { // kies het interface in hetzelfde /24 als de tv
    const prefix = peer.split('.').slice(0, 3).join('.');
    const same = nets.find((n) => n.address.startsWith(prefix + '.'));
    if (same) return same.address;
  }
  return nets.length ? nets[0].address : '127.0.0.1';
}

// Bestand serveren met HTTP Range: de tv kan zo vrij spoelen zonder iets te laden.
function serveFile(req, res, file, type) {
  let stat;
  try { stat = fs.statSync(file); } catch { res.writeHead(404); return res.end(); }
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'transferMode.dlna.org': 'Streaming' };
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m && (m[1] || m[2])) {
    let start = m[1] ? parseInt(m[1], 10) : stat.size - parseInt(m[2], 10);
    let end = m[1] && m[2] ? parseInt(m[2], 10) : stat.size - 1;
    end = Math.min(end, stat.size - 1);
    if (start > end || start < 0 || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  }
}

// routes: { file(id) -> pad | null, sub(id, key) -> Promise<string>, hlsDir(session) -> map | null }
function createServer(routes) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (parts[0] === 'file' && parts[1]) {
        const f = routes.file(parts[1]);
        return f ? serveFile(req, res, f, MIME[path.extname(f).toLowerCase()] || 'application/octet-stream') : (res.writeHead(404), res.end());
      }
      if (parts[0] === 'sub' && parts[1] && parts[2]) {
        const vtt = await routes.sub(parts[1], parts[2].replace(/\.vtt$/, ''));
        res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        return res.end(vtt);
      }
      if (parts[0] === 'hls' && parts[1] && parts[2]) {
        const dir = routes.hlsDir(parts[1]);
        const name = path.basename(parts[2]);
        return dir ? serveFile(req, res, path.join(dir, name), MIME[path.extname(name)] || 'application/octet-stream') : (res.writeHead(404), res.end());
      }
      res.writeHead(404); res.end();
    } catch (e) {
      res.writeHead(500); res.end(String(e.message));
    }
  });
  return server;
}

module.exports = { createServer, lanIp, serveFile };

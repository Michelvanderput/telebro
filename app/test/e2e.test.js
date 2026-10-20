// Draait echte ffmpeg/ffprobe: maakt een mkv, probet, remuxt naar HLS en haalt het via de server op.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const media = require('../src/main/media');
const { createServer } = require('../src/main/server');

const have = spawnSync('ffmpeg', ['-version']).status === 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-'));
const mkv = path.join(tmp, 'Test.Film.2020.mkv');
const srt = path.join(tmp, 'Test.Film.2020.nl.srt');

const get = (port, p, headers = {}) => new Promise((res, rej) =>
  http.get({ port, path: p, headers }, (r) => { const b = []; r.on('data', (d) => b.push(d)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(b) })); }).on('error', rej));

test('probe, plan, remux en range-server', { skip: !have }, async () => {
  fs.writeFileSync(srt, '1\n00:00:00,500 --> 00:00:01,500\nHoi\n');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=6',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-c:a', 'libvorbis', '-y', mkv]);
  assert.strictEqual(r.status, 0, String(r.stderr));
  const info = await media.probe(mkv);
  assert.strictEqual(info.video.codec_name, 'h264');
  const p = media.plan(info);
  assert.deepStrictEqual(p, { mode: 'hls', video: 'copy', audio: 'aac' });

  const dir = path.join(tmp, 'hls'); fs.mkdirSync(dir);
  const proc = media.startHls({ file: mkv, plan: p, outDir: dir });
  await new Promise((r2) => proc.on('exit', r2));
  const m3u8 = fs.readFileSync(path.join(dir, 'index.m3u8'), 'utf8');
  assert.ok(m3u8.includes('#EXT-X-ENDLIST') && m3u8.includes('.m4s'));

  const { srtToVtt } = require('../src/main/subs');
  const srv = createServer({ file: (id) => (id === 'a' ? mkv : null), sub: async () => srtToVtt(fs.readFileSync(srt, 'utf8')), hlsDir: () => dir });
  await new Promise((r2) => srv.listen(0, r2));
  const port = srv.address().port;
  const full = fs.statSync(mkv).size;
  const part = await get(port, '/file/a', { Range: 'bytes=0-99' });
  assert.strictEqual(part.status, 206);
  assert.strictEqual(part.body.length, 100);
  assert.strictEqual(part.headers['content-range'], `bytes 0-99/${full}`);
  const tail = await get(port, '/file/a', { Range: 'bytes=-50' });
  assert.strictEqual(tail.body.length, 50);
  assert.strictEqual((await get(port, '/file/nope')).status, 404);
  assert.strictEqual((await get(port, '/file/a', { Range: `bytes=${full + 5}-` })).status, 416);
  const pl = await get(port, '/hls/s/index.m3u8');
  assert.strictEqual(pl.headers['content-type'], 'application/vnd.apple.mpegurl');
  assert.ok((await get(port, '/hls/s/..%2f..%2fetc%2fpasswd')).status === 404);
  const vtt = await get(port, '/sub/a/x0.vtt');
  assert.ok(vtt.body.toString().startsWith('WEBVTT'));
  srv.close();
});

const test = require('node:test');
const assert = require('node:assert');
const { plan, ffmpegArgs } = require('../src/main/media');

const info = (container, vcodec, acodec) => ({ container, video: { codec_name: vcodec }, audio: [{ index: 0, codec: acodec }, { index: 1, codec: 'dts' }], subs: [] });

test('mp4 h264 aac speelt direct', () => assert.strictEqual(plan(info('mov,mp4', 'h264', 'aac')).mode, 'direct'));
test('mkv h264 aac wordt alleen geremuxt', () => {
  const p = plan(info('matroska', 'h264', 'aac'));
  assert.deepStrictEqual(p, { mode: 'hls', video: 'copy', audio: 'copy' });
});
test('dts audio wordt omgezet, video blijft', () => {
  assert.deepStrictEqual(plan(info('matroska', 'hevc', 'dts')), { mode: 'hls', video: 'copy', audio: 'aac' });
});
test('ander audiospoor forceert hls', () => assert.strictEqual(plan(info('mov,mp4', 'h264', 'aac'), 1).mode, 'hls'));
test('mpeg4 video moet hercoderen', () => assert.strictEqual(plan(info('avi', 'mpeg4', 'mp3')).video, 'transcode'));
test('ffmpeg args kiezen audiospoor en start', () => {
  const a = ffmpegArgs({ file: 'f.mkv', plan: { video: 'copy', audio: 'copy' }, audioIndex: 1, start: 90, outDir: '/t' });
  assert.ok(a.includes('0:a:1') && a.join(' ').includes('-ss 90') && a.join(' ').includes('-c:v copy'));
});

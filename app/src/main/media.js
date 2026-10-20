const { spawn, execFile } = require('child_process');
const bin = require('./bin');

const TEXT_SUBS = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text']);
const DIRECT_AUDIO = new Set(['aac', 'ac3', 'eac3', 'mp3']);
const COPY_AUDIO = new Set(['aac', 'ac3', 'eac3']);
const COPY_VIDEO = new Set(['h264', 'hevc']);

function probe(file) {
  return new Promise((resolve, reject) => {
    execFile(bin.ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
      { maxBuffer: 16 * 1024 * 1024 }, (err, out) => {
        if (err) return reject(err);
        const j = JSON.parse(out);
        const s = j.streams || [];
        const lang = (x) => (x.tags && x.tags.language) || 'und';
        const title = (x) => (x.tags && x.tags.title) || '';
        resolve({
          duration: parseFloat(j.format.duration) || 0,
          container: (j.format.format_name || '').split(',')[0],
          video: s.find((x) => x.codec_type === 'video' && !(x.disposition && x.disposition.attached_pic)),
          audio: s.filter((x) => x.codec_type === 'audio').map((x, i) => ({
            index: i, codec: x.codec_name, channels: x.channels, language: lang(x), title: title(x) })),
          subs: s.filter((x) => x.codec_type === 'subtitle').map((x, i) => ({
            index: i, codec: x.codec_name, language: lang(x), title: title(x), text: TEXT_SUBS.has(x.codec_name) })),
        });
      });
  });
}

// Kies de lichtste route: 1) bestand direct, 2) remux (kopie, bijna geen CPU), 3) alleen audio omzetten,
// 4) video hercoderen (laatste redmiddel, bv. mpeg4/vc1).
function plan(info, audioIndex = 0) {
  const a = info.audio[audioIndex];
  const v = info.video;
  const videoCopy = !!v && COPY_VIDEO.has(v.codec_name);
  const audioCopy = !!a && COPY_AUDIO.has(a.codec);
  const isMp4 = /mov|mp4/.test(info.container);
  if (isMp4 && videoCopy && a && DIRECT_AUDIO.has(a.codec) && audioIndex === 0) {
    return { mode: 'direct', video: 'copy', audio: 'copy' };
  }
  return { mode: 'hls', video: videoCopy ? 'copy' : 'transcode', audio: audioCopy ? 'copy' : 'aac' };
}

function ffmpegArgs({ file, plan: p, audioIndex = 0, start = 0, outDir }) {
  const args = ['-hide_banner', '-loglevel', 'error'];
  if (start > 0) args.push('-ss', String(start));
  args.push('-i', file, '-map', '0:v:0', '-map', `0:a:${audioIndex}`, '-sn', '-dn');
  if (p.video === 'copy') args.push('-c:v', 'copy', '-tag:v', 'hvc1'); // hvc1 nodig voor HEVC in fMP4
  else {
    const hw = process.platform === 'darwin' ? ['-c:v', 'h264_videotoolbox', '-b:v', '12M'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20'];
    args.push(...hw, '-pix_fmt', 'yuv420p');
  }
  if (p.audio === 'copy') args.push('-c:a', 'copy');
  else args.push('-c:a', 'aac', '-b:a', '384k', '-ac', '6');
  args.push('-f', 'hls', '-hls_time', '4', '-hls_list_size', '0', '-hls_segment_type', 'fmp4',
    '-hls_playlist_type', 'event', '-hls_flags', 'independent_segments',
    '-hls_fmp4_init_filename', 'init.mp4', '-hls_segment_filename', `${outDir}/seg%05d.m4s`, `${outDir}/index.m3u8`);
  return args;
}

function startHls(opts) {
  const proc = spawn(bin.ffmpeg, ffmpegArgs(opts), { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  proc.stderr.on('data', (d) => { err += d; });
  proc.on('exit', (code) => { if (code && code !== 255) console.error('[ffmpeg]', code, err.slice(-400)); });
  return proc;
}

function extractSubtitle(file, subIndex) {
  return new Promise((resolve, reject) => {
    execFile(bin.ffmpeg, ['-v', 'error', '-i', file, '-map', `0:s:${subIndex}`, '-f', 'webvtt', '-'],
      { maxBuffer: 32 * 1024 * 1024 }, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

module.exports = { probe, plan, ffmpegArgs, startHls, extractSubtitle };

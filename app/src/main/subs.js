// SRT -> WebVTT (Chromecast en Google TV tonen alleen WebVTT).
function srtToVtt(srt) {
  const body = srt
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return 'WEBVTT\n\n' + body.trim() + '\n';
}
module.exports = { srtToVtt };

const test = require('node:test');
const assert = require('node:assert');
const { srtToVtt } = require('../src/main/subs');

test('srt wordt webvtt', () => {
  const out = srtToVtt('﻿1\r\n00:00:01,500 --> 00:00:03,000\r\nHallo\r\n');
  assert.ok(out.startsWith('WEBVTT\n\n1\n'));
  assert.ok(out.includes('00:00:01.500 --> 00:00:03.000'));
  assert.ok(!out.includes('\r') && !out.includes('﻿'));
});

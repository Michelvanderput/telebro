const test = require('node:test');
const assert = require('node:assert');
const { parseName } = require('../src/main/names');

test('serie met SxxExx', () => {
  assert.deepStrictEqual(parseName('/x/Breaking.Bad.S02E05.1080p.WEB-DL.x264.mkv'), { type: 'series', title: 'Breaking Bad', season: 2, episode: 5 });
});
test('serie met 1x05', () => {
  assert.strictEqual(parseName('Show Name 1x05.mp4').episode, 5);
});
test('film met jaartal', () => {
  assert.deepStrictEqual(parseName('The.Matrix.1999.2160p.BluRay.mkv'), { type: 'movie', title: 'The Matrix', year: 1999 });
  assert.deepStrictEqual(parseName('Inception (2010).mp4'), { type: 'movie', title: 'Inception', year: 2010 });
});
test('film zonder jaar', () => {
  assert.strictEqual(parseName('Mijn Vakantie.mp4').title, 'Mijn Vakantie');
});

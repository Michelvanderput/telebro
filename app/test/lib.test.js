const test = require('node:test');
const assert = require('node:assert');
const lib = require('../src/renderer/lib.js');

const ep = (title, s, e, extra = {}) => ({ id: `${title}${s}${e}`, file: `/x/${title}.S${s}E${e}.mkv`, type: 'series', title, season: s, episode: e, added: 1, ...extra });
const items = [ep('Show', 1, 2), ep('Show', 2, 1), ep('Show', 1, 1), ep('Other', 1, 1), { id: 'm1', file: '/x/m.mp4', type: 'movie', title: 'Film', year: 2020, added: 5 }];

test('series groeperen en sorteren', () => {
  const g = lib.groupLibrary(items);
  assert.strictEqual(g.movies.length, 1);
  assert.deepStrictEqual(g.shows.map((s) => s.title), ['Other', 'Show']);
  const show = g.shows.find((s) => s.title === 'Show');
  assert.deepStrictEqual(show.episodes.map(lib.epCode), ['S01E01', 'S01E02', 'S02E01']);
  assert.deepStrictEqual(show.seasons, [1, 2]);
});
test('volgende aflevering loopt door over seizoenen', () => {
  assert.strictEqual(lib.epCode(lib.nextEpisode(items, items[2])), 'S01E02');
  assert.strictEqual(lib.epCode(lib.nextEpisode(items, items[0])), 'S02E01');
  assert.strictEqual(lib.nextEpisode(items, items[1]), null);
  assert.strictEqual(lib.nextEpisode(items, items[4]), null);
});
test('verder kijken: recentst eerst, een per serie, gezien valt weg', () => {
  const pos = { [items[0].id]: { t: 100, d: 3000, at: 10 }, [items[2].id]: { t: 50, d: 3000, at: 20 }, m1: { t: 9, d: 99, at: 5 }, [items[3].id]: { t: 5, d: 99, at: 1 } };
  const w = lib.continueWatching(items, pos, { [items[3].id]: true });
  assert.deepStrictEqual(w.map((i) => i.id), [items[2].id, 'm1']);
});
test('upNext kiest laatst begonnen, anders eerste ongeziene', () => {
  const show = lib.groupLibrary(items).shows.find((s) => s.title === 'Show');
  assert.strictEqual(lib.epCode(lib.upNext(show, {}, { [show.episodes[0].id]: true })), 'S01E02');
  assert.strictEqual(lib.epCode(lib.upNext(show, { [show.episodes[2].id]: { t: 1, d: 2, at: 9 } }, {})), 'S02E01');
});
test('opmaakhulpjes', () => {
  assert.strictEqual(lib.fmt(3725), '1:02:05');
  assert.strictEqual(lib.fmt(65), '1:05');
  assert.strictEqual(lib.bytes(1536), '2 KB');
  assert.strictEqual(lib.bytes(5 * 1024 ** 3), '5.0 GB');
  assert.strictEqual(lib.eta(30), '<1 min');
  assert.strictEqual(lib.metaKey(items[0]), 'tv:show');
  assert.strictEqual(lib.metaKey(items[4]), 'movie:film:2020');
});

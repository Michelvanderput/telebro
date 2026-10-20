const test = require('node:test');
const assert = require('node:assert');
const { lookup, fillMissing } = require('../src/main/meta');
const lib = require('../src/renderer/lib.js');

const reply = (body, status = 200) => async (url, opts) => { reply.calls.push({ url: String(url), opts }); return { ok: status < 400, status, json: async () => body }; };
reply.calls = [];

test('lookup vertaalt TMDB-antwoord', async () => {
  reply.calls = [];
  const r = await lookup({ type: 'movie', title: 'Inception', year: 2010 }, 'abc123',
    reply({ results: [{ title: 'Inception', overview: 'Droom', vote_average: 8.368, release_date: '2010-07-15', poster_path: '/p.jpg', backdrop_path: '/b.jpg' }] }));
  assert.deepStrictEqual(r, { title: 'Inception', overview: 'Droom', rating: 8.4, year: 2010, poster: 'https://image.tmdb.org/t/p/w342/p.jpg', backdrop: 'https://image.tmdb.org/t/p/w780/b.jpg' });
  assert.ok(reply.calls[0].url.includes('/search/movie') && reply.calls[0].url.includes('api_key=abc123') && reply.calls[0].url.includes('year=2010'));
});
test('bearer-token gaat in de header, series gebruiken /search/tv', async () => {
  reply.calls = [];
  await lookup({ type: 'series', title: 'Show' }, 'eyJtoken', reply({ results: [] }));
  assert.ok(reply.calls[0].url.includes('/search/tv') && !reply.calls[0].url.includes('api_key'));
  assert.strictEqual(reply.calls[0].opts.headers.Authorization, 'Bearer eyJtoken');
});
test('niets gevonden en ongeldige sleutel', async () => {
  assert.deepStrictEqual(await lookup({ type: 'movie', title: 'x' }, 'k', reply({ results: [] })), { none: true });
  await assert.rejects(lookup({ type: 'movie', title: 'x' }, 'k', reply({}, 401)), (e) => e.fatal === true);
});
test('fillMissing haalt elke serie en film maar een keer op', async () => {
  reply.calls = [];
  const items = [{ type: 'series', title: 'Show', season: 1, episode: 1 }, { type: 'series', title: 'Show', season: 1, episode: 2 }, { type: 'movie', title: 'Film', year: 2001 }];
  const cache = { 'movie:film:2001': { title: 'al bekend' } };
  await fillMissing(items, cache, 'k', lib.metaKey, { fetchFn: reply({ results: [] }), delay: 0 });
  assert.strictEqual(reply.calls.length, 1);
  assert.ok(cache['tv:show'].none);
});

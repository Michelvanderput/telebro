const test = require('node:test');
const assert = require('node:assert');
const d = require('../src/main/discover');

const reply = (body, status = 200) => async (url) => { reply.last = String(url); return { ok: status < 400, status, json: async () => body, arrayBuffer: async () => new TextEncoder().encode(body).buffer }; };

test('TMDB-zoeken filtert personen weg', async () => {
  const r = await d.tmdbSearch('matrix', 'abc', reply({ results: [
    { media_type: 'movie', id: 603, title: 'The Matrix', release_date: '1999-03-30', vote_average: 8.2, poster_path: '/m.jpg', overview: 'o' },
    { media_type: 'person', id: 1, name: 'Neo' }, { media_type: 'tv', id: 9, name: 'Serie', first_air_date: '2020-01-01' }] }));
  assert.deepStrictEqual(r.map((x) => [x.kind, x.title, x.year]), [['movie', 'The Matrix', 1999], ['tv', 'Serie', 2020]]);
  assert.ok(reply.last.includes('/search/multi') && reply.last.includes('api_key=abc'));
});
test('waar te kijken geeft NL-aanbieders', async () => {
  const r = await d.providers('movie', 603, 'k', 'NL', reply({ results: { NL: { link: 'http://x', flatrate: [{ provider_name: 'Netflix' }], rent: [{ provider_name: 'Pathé Thuis' }] }, US: {} } }));
  assert.deepStrictEqual(r, { link: 'http://x', flatrate: ['Netflix'], rent: ['Pathé Thuis'], buy: [] });
  await assert.rejects(d.providers('person', 1, 'k'), /type/);
});
test('Internet Archive-zoeken maakt veilige query en filtert rare id\'s', async () => {
  const r = await d.archiveSearch('Nosferatu"; DROP', reply({ response: { docs: [
    { identifier: 'Nosferatu_1922', title: ['Nosferatu'], year: '1922', downloads: 500 }, { identifier: '../../etc/passwd', title: 'x' }] } }));
  assert.deepStrictEqual(r.map((x) => x.id), ['Nosferatu_1922']);
  assert.ok(!decodeURIComponent(reply.last).includes('"') && reply.last.includes('mediatype%3Amovies'));
  assert.deepStrictEqual(await d.archiveSearch('   ', reply({})), []);
});
test('archive-torrent controleert id en antwoord', async () => {
  const b = await d.archiveTorrent('Nosferatu_1922', reply('d8:announce0:e'));
  assert.ok(Buffer.isBuffer(b) && reply.last.endsWith('/download/Nosferatu_1922/Nosferatu_1922_archive.torrent'));
  await assert.rejects(d.archiveTorrent('../x', reply('x')), /Ongeldig/);
  await assert.rejects(d.archiveTorrent('ok', reply('', 404)), /Geen torrent/);
  await assert.rejects(d.archiveTorrent('ok', reply('', 403)), /niet vrij/);
  await assert.rejects(d.archiveTorrent('ok', reply('<html>', 200)), /Onverwacht/);
});
test('archive-torrent probeert het opnieuw bij een 503', async () => {
  let n = 0;
  const flaky = async () => (++n < 3 ? { ok: false, status: 503 } : { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('d8:announce0:e').buffer });
  assert.ok((await d.archiveTorrent('ok', flaky, { retries: 2, delay: 1 })).length > 0);
  assert.strictEqual(n, 3);
  await assert.rejects(d.archiveTorrent('ok', async () => ({ ok: false, status: 503 }), { retries: 1, delay: 1 }), /even niet bereikbaar/);
});

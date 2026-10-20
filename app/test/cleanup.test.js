const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runCleanup, inside } = require('../src/main/cleanup');
const lib = require('../src/renderer/lib.js');

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 20);

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-'));
  const dl = path.join(root, 'Downloads'); const own = path.join(root, 'Eigen');
  fs.mkdirSync(path.join(dl, 'Torrent.Map'), { recursive: true }); fs.mkdirSync(own);
  const mk = (f) => { fs.writeFileSync(f, 'x'); return f; };
  const a = mk(path.join(dl, 'Torrent.Map', 'A.2010.mkv')); mk(path.join(dl, 'Torrent.Map', 'A.2010.nl.srt')); mk(path.join(dl, 'Torrent.Map', 'info.nfo'));
  const b = mk(path.join(dl, 'B.2011.mp4'));
  const c = mk(path.join(dl, 'C.2012.mp4'));
  const d = mk(path.join(own, 'D.2013.mp4'));
  const items = [
    { id: 'a', file: a, managed: true, sidecars: [{ file: path.join(dl, 'Torrent.Map', 'A.2010.nl.srt') }] },
    { id: 'b', file: b, managed: true, sidecars: [] }, { id: 'c', file: c, managed: true, sidecars: [] }, { id: 'd', file: d, managed: false, sidecars: [] }];
  const trashed = []; const trash = async (f) => { trashed.push(f); fs.rmSync(f, { recursive: true, force: true }); };
  return { root, dl, items, a, b, c, d, trash, trashed };
}

test('daysLeft: alleen gedownload, gekeken en zonder Bewaren', () => {
  const cl = { enabled: true, days: 3 };
  const item = { id: 'x', managed: true };
  assert.strictEqual(lib.daysLeft(item, { x: NOW - DAY }, {}, cl, NOW), 2);
  assert.strictEqual(lib.daysLeft(item, { x: NOW - 4 * DAY }, {}, cl, NOW), -1);
  assert.strictEqual(lib.daysLeft(item, {}, {}, cl, NOW), null, 'niet gekeken');
  assert.strictEqual(lib.daysLeft(item, { x: NOW - 9 * DAY }, { x: true }, cl, NOW), null, 'bewaren');
  assert.strictEqual(lib.daysLeft({ id: 'x', managed: false }, { x: NOW - 9 * DAY }, {}, cl, NOW), null, 'eigen map');
  assert.strictEqual(lib.daysLeft(item, { x: NOW - 9 * DAY }, {}, { enabled: false, days: 3 }, NOW), null, 'uitgeschakeld');
  assert.strictEqual(lib.daysLeft(item, { x: true }, {}, cl, NOW), 3, 'oud true start de klok nu');
});

test('opruimen verwijdert alleen verlopen, gekeken downloads via de prullenbak', async () => {
  const t = setup();
  const watched = { a: NOW - 5 * DAY, b: NOW - 1 * DAY, d: NOW - 30 * DAY }; // c niet gekeken, d eigen map
  const removed = await runCleanup({ items: t.items, watched, keep: {}, cleanup: { enabled: true, days: 3 }, downloadDir: t.dl, trash: t.trash, now: NOW });
  assert.deepStrictEqual(removed.map((r) => r.id), ['a']);
  assert.ok(!fs.existsSync(t.a) && !fs.existsSync(path.join(t.dl, 'Torrent.Map')), 'film, ondertitel en lege torrentmap weg');
  assert.ok(fs.existsSync(t.b) && fs.existsSync(t.c) && fs.existsSync(t.d), 'rest blijft staan');
  assert.ok(t.trashed.every((f) => inside(t.dl, f)));
});

test('Bewaren en uitgeschakeld beschermen alles', async () => {
  const t = setup();
  const watched = { a: NOW - 50 * DAY, b: NOW - 50 * DAY };
  assert.strictEqual((await runCleanup({ items: t.items, watched, keep: { a: true, b: true }, cleanup: { enabled: true, days: 3 }, downloadDir: t.dl, trash: t.trash, now: NOW })).length, 0);
  assert.strictEqual((await runCleanup({ items: t.items, watched, keep: {}, cleanup: { enabled: false, days: 3 }, downloadDir: t.dl, trash: t.trash, now: NOW })).length, 0);
  assert.strictEqual(t.trashed.length, 0);
});

test('pad buiten de downloadmap wordt nooit aangeraakt, ook niet als hij als managed is gemarkeerd', async () => {
  const t = setup();
  const evil = { id: 'e', file: t.d, managed: true, sidecars: [] };
  const removed = await runCleanup({ items: [evil], watched: { e: NOW - 99 * DAY }, keep: {}, cleanup: { enabled: true, days: 1 }, downloadDir: t.dl, trash: t.trash, now: NOW });
  assert.strictEqual(removed.length, 0);
  assert.ok(fs.existsSync(t.d));
  assert.ok(!inside(t.dl, t.dl) && !inside(t.dl, path.join(t.dl, '..', 'Eigen', 'x')));
});

test('status van film en serie', () => {
  assert.strictEqual(lib.status({ id: 'a' }, {}, {}), 'nieuw');
  assert.strictEqual(lib.status({ id: 'a' }, { a: { t: 1 } }, {}), 'bezig');
  assert.strictEqual(lib.status({ id: 'a' }, {}, { a: 1 }), 'gezien');
  const show = { episodes: [{ id: 'e1' }, { id: 'e2' }] };
  assert.strictEqual(lib.status(show, {}, { e1: 1 }), 'bezig');
  assert.strictEqual(lib.status(show, {}, { e1: 1, e2: 1 }), 'gezien');
});

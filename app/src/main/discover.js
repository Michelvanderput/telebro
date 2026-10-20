// Zoeken zonder piraterij: TMDB (waar kijk je het legaal) en het Internet Archive (publiek domein / Creative Commons).
const { headers } = require('./meta');

const ARCHIVE = 'https://archive.org';
const IMG = 'https://image.tmdb.org/t/p/w342';
const ARCHIVE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;

const tmdbUrl = (pathname, params, key) => {
  const q = new URLSearchParams({ language: 'nl-NL', ...params });
  if (!key.startsWith('eyJ')) q.set('api_key', key);
  return `https://api.themoviedb.org/3${pathname}?${q}`;
};

async function tmdbSearch(query, key, fetchFn = fetch) {
  const res = await fetchFn(tmdbUrl('/search/multi', { query, include_adult: 'false' }, key), { headers: headers(key) });
  if (res.status === 401) throw new Error('TMDB-sleutel ongeldig');
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return ((await res.json()).results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 24).map((r) => ({
    kind: r.media_type, id: r.id, title: r.title || r.name, overview: r.overview || '', rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
    year: parseInt((r.release_date || r.first_air_date || '').slice(0, 4), 10) || null, poster: r.poster_path ? IMG + r.poster_path : null }));
}

async function providers(kind, id, key, region = 'NL', fetchFn = fetch) {
  if (kind !== 'movie' && kind !== 'tv') throw new Error('onbekend type');
  const res = await fetchFn(tmdbUrl(`/${kind}/${Number(id)}/watch/providers`, {}, key), { headers: headers(key) });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const r = ((await res.json()).results || {})[region] || {};
  const names = (a) => (a || []).map((p) => p.provider_name);
  return { link: r.link || null, flatrate: names(r.flatrate), rent: names(r.rent), buy: names(r.buy) };
}

async function archiveSearch(query, fetchFn = fetch) {
  const term = query.replace(/[^\p{L}\p{N} '-]/gu, ' ').trim();
  if (!term) return [];
  const p = new URLSearchParams({ q: `title:(${term}) AND mediatype:movies`, rows: '24', page: '1', output: 'json' });
  for (const f of ['identifier', 'title', 'year', 'downloads']) p.append('fl[]', f);
  p.append('sort[]', 'downloads desc');
  const res = await fetchFn(`${ARCHIVE}/advancedsearch.php?${p}`);
  if (!res.ok) throw new Error(`Internet Archive ${res.status}`);
  return (((await res.json()).response || {}).docs || []).filter((d) => ARCHIVE_ID.test(d.identifier || '')).map((d) => ({
    id: d.identifier, title: Array.isArray(d.title) ? d.title[0] : d.title, year: parseInt(d.year, 10) || null, downloads: d.downloads || 0,
    thumb: `${ARCHIVE}/services/img/${d.identifier}` }));
}

// Het Internet Archive maakt voor elk item een .torrent aan. Sommige mirrors zijn even onbereikbaar (5xx): dan opnieuw proberen.
async function archiveTorrent(id, fetchFn = fetch, { retries = 2, delay = 800 } = {}) {
  if (!ARCHIVE_ID.test(id)) throw new Error('Ongeldig item');
  let res;
  for (let i = 0; i <= retries; i++) {
    res = await fetchFn(`${ARCHIVE}/download/${id}/${id}_archive.torrent`);
    if (res.ok || res.status < 500) break;
    if (i < retries) await new Promise((r) => setTimeout(r, delay));
  }
  if (res.status === 403) throw new Error('Dit item is niet vrij te downloaden (beveiligd of alleen te lenen). Kies een ander item.');
  if (res.status >= 500) throw new Error('Het Internet Archive is even niet bereikbaar. Probeer het straks opnieuw of kies een ander item.');
  if (!res.ok) throw new Error(`Geen torrent beschikbaar voor dit item (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > 5 * 1024 * 1024 || buf[0] !== 0x64) throw new Error('Onverwacht torrent-bestand');
  return buf;
}

module.exports = { tmdbSearch, providers, archiveSearch, archiveTorrent, ARCHIVE_ID };

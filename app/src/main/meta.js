// Posters en omschrijvingen via TMDB (optioneel, eigen gratis API-sleutel). Resultaten worden lokaal bewaard.
const IMG = 'https://image.tmdb.org/t/p';

function headers(key) {
  return key.startsWith('eyJ') ? { Authorization: `Bearer ${key}`, accept: 'application/json' } : { accept: 'application/json' };
}

async function lookup(item, key, fetchFn = fetch) {
  const kind = item.type === 'series' ? 'tv' : 'movie';
  const q = new URLSearchParams({ query: item.title, language: 'nl-NL', include_adult: 'false' });
  if (!key.startsWith('eyJ')) q.set('api_key', key);
  if (kind === 'movie' && item.year) q.set('year', String(item.year));
  const res = await fetchFn(`https://api.themoviedb.org/3/search/${kind}?${q}`, { headers: headers(key) });
  if (res.status === 401) throw Object.assign(new Error('TMDB-sleutel ongeldig'), { fatal: true });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const hit = ((await res.json()).results || [])[0];
  if (!hit) return { none: true };
  return {
    title: hit.title || hit.name, overview: hit.overview || '', rating: hit.vote_average ? Math.round(hit.vote_average * 10) / 10 : null,
    year: parseInt((hit.release_date || hit.first_air_date || '').slice(0, 4), 10) || null,
    poster: hit.poster_path ? `${IMG}/w342${hit.poster_path}` : null,
    backdrop: hit.backdrop_path ? `${IMG}/w780${hit.backdrop_path}` : null,
  };
}

// Haalt alleen ontbrekende items op, een voor een (vriendelijk voor de API). Stopt bij een ongeldige sleutel.
async function fillMissing(items, cache, key, keyOf, { fetchFn = fetch, onProgress = () => {}, delay = 120 } = {}) {
  const todo = []; const seen = new Set();
  for (const i of items) { const k = keyOf(i); if (!cache[k] && !seen.has(k)) { seen.add(k); todo.push([k, i]); } }
  for (const [k, i] of todo) {
    try { cache[k] = await lookup(i, key, fetchFn); onProgress(k); } catch (e) { if (e.fatal) throw e; }
    if (delay) await new Promise((r) => setTimeout(r, delay));
  }
  return cache;
}

module.exports = { lookup, fillMissing, headers };

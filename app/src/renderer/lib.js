// Pure logica, gedeeld door de UI (browser) en de main-process (node) en getest met node --test.
(function (root) {
  const pad = (n) => String(n).padStart(2, '0');
  const epCode = (i) => `S${pad(i.season || 0)}E${pad(i.episode || 0)}`;
  const byEpisode = (a, b) => (a.season || 0) - (b.season || 0) || (a.episode || 0) - (b.episode || 0) || a.file.localeCompare(b.file);

  const fmt = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
    return (h ? `${h}:${pad(m)}` : `${m}`) + `:${pad(s % 60)}`;
  };
  const bytes = (n) => {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    return `${(n / 1024 ** i).toFixed(i > 1 ? 1 : 0)} ${u[i]}`;
  };
  const eta = (s) => (s == null ? '' : s < 60 ? '<1 min' : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)}u ${Math.round((s % 3600) / 60)}m`);

  // Sleutel waaronder metadata (poster, omschrijving) wordt opgeslagen: gelijk voor alle afleveringen van een serie.
  const metaKey = (i) => (i.type === 'series' ? `tv:${i.title.toLowerCase()}` : `movie:${i.title.toLowerCase()}:${i.year || ''}`);

  // Series samenvoegen tot een kaart per serie; films blijven los.
  function groupLibrary(items) {
    const shows = new Map(); const movies = [];
    for (const i of items) {
      if (i.type !== 'series') { movies.push(i); continue; }
      const k = i.title.toLowerCase();
      if (!shows.has(k)) shows.set(k, { key: k, title: i.title, type: 'series', episodes: [] });
      shows.get(k).episodes.push(i);
    }
    const list = [...shows.values()];
    for (const s of list) {
      s.episodes.sort(byEpisode);
      s.seasons = [...new Set(s.episodes.map((e) => e.season || 0))].sort((a, b) => a - b);
      s.added = Math.max(...s.episodes.map((e) => e.added || 0));
    }
    return { movies, shows: list.sort((a, b) => a.title.localeCompare(b.title)) };
  }

  // Volgende aflevering in dezelfde serie (ook over seizoenen heen).
  function nextEpisode(items, item) {
    if (!item || item.type !== 'series') return null;
    const eps = items.filter((i) => i.type === 'series' && i.title.toLowerCase() === item.title.toLowerCase()).sort(byEpisode);
    const idx = eps.findIndex((e) => e.id === item.id);
    return idx >= 0 && idx < eps.length - 1 ? eps[idx + 1] : null;
  }

  // "Verder kijken": begonnen, niet afgekeken, recentst eerst. Per serie alleen de laatste aflevering.
  function continueWatching(items, positions, watched) {
    const seenShow = new Set(); const out = [];
    const rows = items.filter((i) => positions[i.id] && !watched[i.id]).sort((a, b) => positions[b.id].at - positions[a.id].at);
    for (const i of rows) {
      const k = i.type === 'series' ? i.title.toLowerCase() : i.id;
      if (seenShow.has(k)) continue;
      seenShow.add(k); out.push(i);
    }
    return out;
  }

  // Voor een serie: welke aflevering is "nu aan de beurt"? Laatst begonnen, anders eerste ongeziene.
  function upNext(show, positions, watched) {
    const started = show.episodes.filter((e) => positions[e.id] && !watched[e.id]).sort((a, b) => positions[b.id].at - positions[a.id].at)[0];
    if (started) return started;
    return show.episodes.find((e) => !watched[e.id]) || show.episodes[0];
  }

  const api = { fmt, bytes, eta, epCode, metaKey, groupLibrary, nextEpisode, continueWatching, upNext };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.lib = api;
})(typeof self !== 'undefined' ? self : globalThis);

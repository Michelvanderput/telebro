const $ = (s) => document.querySelector(s);
const { fmt, bytes, eta, epCode, metaKey, groupLibrary, nextEpisode, continueWatching, upNext, daysLeft, status } = window.lib;

const S = {
  items: [], positions: {}, watched: {}, keep: {}, meta: {}, filter: 'all', disc: null, folders: [], settings: {}, downloads: [],
  view: 'home', q: '', device: '', sort: 'title', now: null, devices: [],
};

// Veilige DOM-bouwer: alles gaat via textContent, nooit via innerHTML.
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e[k] = (ev) => { v(ev); }; // return false zou het event annuleren (toetsen!)
    else if (k in e && k !== 'list') e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const hue = (str) => { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const gradient = (t) => { const h = hue(t); return `linear-gradient(160deg,hsl(${h} 55% 34%),hsl(${(h + 55) % 360} 50% 13%))`; };
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = err ? 'err' : ''; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), err ? 7000 : 3500);
}
const fail = (e) => toast(String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true);

const metaOf = (entry) => S.meta[metaKey(entry.episodes ? entry.episodes[0] : entry)] || {};
const minLeft = (id) => { const p = S.positions[id]; return p ? Math.max(1, Math.round((p.d - p.t) / 60)) : 0; };

// ---------- bouwstenen ----------
function poster(entry, extra) {
  const m = metaOf(entry);
  const p = el('div', { class: 'poster', style: m.poster ? '' : `background:${gradient(entry.title)}` });
  if (m.poster) p.append(el('img', { src: m.poster, alt: '', loading: 'lazy' }));
  else p.append(el('b', { text: entry.title }));
  [].concat(extra || []).filter(Boolean).forEach((x) => p.append(x));
  return p;
}
function progressBar(id) {
  const p = S.positions[id];
  return p && p.d ? el('div', { class: 'prog' }, el('i', { style: `width:${Math.min(100, (p.t / p.d) * 100)}%` })) : null;
}
function card(entry) {
  const isShow = !!entry.episodes;
  const m = metaOf(entry);
  const watchedAll = isShow ? entry.episodes.every((e) => S.watched[e.id]) : S.watched[entry.id];
  const sub = isShow ? `${entry.episodes.length} afl. · ${entry.seasons.length} seizoen${entry.seasons.length > 1 ? 'en' : ''}` : [m.year || entry.year, m.rating ? `★ ${m.rating}` : ''].filter(Boolean).join(' · ');
  const left = isShow ? null : daysLeft(entry, S.watched, S.keep, S.settings.cleanup);
  const extra = [watchedAll ? el('span', { class: 'badge ok', text: left != null ? `✓ ${Math.max(0, left)}d` : '✓', title: left != null ? 'Dagen tot opruimen' : 'Gezien' }) : null, isShow ? null : progressBar(entry.id)];
  return el('div', { class: 'card', onclick: () => openDetail(entry) }, poster(entry, extra),
    el('div', { class: 't', text: entry.title }), el('div', { class: 's', text: sub }));
}
function wideCard(item) {
  const m = metaOf(item);
  const p = el('div', { class: 'poster', style: m.backdrop ? '' : `background:${gradient(item.title)}` });
  if (m.backdrop || m.poster) p.append(el('img', { src: m.backdrop || m.poster, alt: '', loading: 'lazy' }));
  else p.append(el('b', { text: item.title }));
  const pb = progressBar(item.id); if (pb) p.append(pb);
  const show = item.type === 'series';
  return el('div', { class: 'card wide', onclick: () => openDetail(show ? groupOf(item) : item, item) }, p,
    el('div', { class: 't', text: show ? `${item.title} · ${epCode(item)}` : item.title }),
    el('div', { class: 's', text: `Nog ${minLeft(item.id)} min` }));
}
const groupOf = (item) => groupLibrary(S.items).shows.find((s) => s.key === item.title.toLowerCase());
const row = (title, sub, cards) => cards.length ? [el('h2', { text: title }, sub ? el('small', { text: sub }) : null), el('div', { class: 'row' }, cards)] : [];
const matches = (title) => !S.q || title.toLowerCase().includes(S.q.toLowerCase());

function emptyState() {
  return el('div', { class: 'empty' }, el('h1', { text: 'Welkom bij Telebro' }),
    el('p', { text: 'Je mediahub voor films en series. Voeg een map toe, of download iets en het verschijnt vanzelf.' }),
    el('div', { class: 'steps' }, el('div', { text: '1.  Klik op “Map toevoegen” en kies de map met je films en series.' }),
      el('div', { text: '2.  Kies links onderin je tv bij “Afspelen op”.' }),
      el('div', { text: '3.  Klik op een titel en dan op Afspelen.' }),
      el('div', { text: '4.  Optioneel: zet bij Instellingen een TMDB-sleutel voor posters en omschrijvingen.' })),
    el('div', { class: 'actions' }, el('button', { class: 'primary', text: '+ Map toevoegen', onclick: addFolder }),
      el('button', { text: 'Naar downloads', onclick: () => go('downloads') })));
}

// ---------- views ----------
function viewHome() {
  const v = [];
  if (!S.items.length) return [emptyState()];
  const { movies, shows } = groupLibrary(S.items.filter((i) => matches(i.title)));
  const cont = continueWatching(S.items.filter((i) => matches(i.title)), S.positions, S.watched);
  const recentMovies = [...movies].sort((a, b) => b.added - a.added).slice(0, 18);
  const recentShows = [...shows].sort((a, b) => b.added - a.added).slice(0, 18);
  v.push(...row('Verder kijken', null, cont.map(wideCard)));
  v.push(...row('Nieuw toegevoegd', 'films', recentMovies.map(card)));
  v.push(...row('Series', `${shows.length}`, recentShows.map(card)));
  if (!v.length) v.push(el('div', { class: 'empty', text: 'Niets gevonden.' }));
  return v;
}
function sortControl() {
  const f = el('select', { onchange: (e) => { S.filter = e.target.value; render(); } },
    ...[['all', 'Alles'], ['nieuw', 'Nieuw'], ['bezig', 'Bezig'], ['gezien', 'Gezien']].map(([v, t]) => el('option', { value: v, text: t })));
  f.value = S.filter;
  return el('div', { class: 'bar2' }, el('span', { class: 's', text: 'Status' }), f, el('span', { class: 's', text: 'Sorteer' }), (() => {
    const s = el('select', { onchange: (e) => { S.sort = e.target.value; render(); } },
      el('option', { value: 'title', text: 'Titel' }), el('option', { value: 'recent', text: 'Recent toegevoegd' }), el('option', { value: 'rating', text: 'Beoordeling' }));
    s.value = S.sort; return s;
  })());
}
const sorter = () => ({
  title: (a, b) => a.title.localeCompare(b.title), recent: (a, b) => (b.added || 0) - (a.added || 0),
  rating: (a, b) => (metaOf(b).rating || 0) - (metaOf(a).rating || 0) }[S.sort]);
const inFilter = (e) => S.filter === 'all' || status(e, S.positions, S.watched) === S.filter;
function viewMovies() {
  const list = groupLibrary(S.items).movies.filter((m) => matches(m.title) && inFilter(m)).sort(sorter());
  if (!S.items.length) return [emptyState()];
  return [el('h2', { text: 'Films', }, el('small', { text: `${list.length}` })), sortControl(), el('div', { class: 'grid' }, list.map(card))];
}
function viewSeries() {
  const list = groupLibrary(S.items).shows.filter((m) => matches(m.title) && inFilter(m)).sort(sorter());
  if (!S.items.length) return [emptyState()];
  return [el('h2', { text: 'Series' }, el('small', { text: `${list.length}` })), sortControl(), el('div', { class: 'grid' }, list.map(card))];
}

async function addMagnet() {
  const i = $('#magnet'); const v = i.value.trim();
  if (!v) return;
  try { await window.tv.dlAdd(v); i.value = ''; toast('Download gestart'); refreshDownloads(); } catch (e) { fail(e); }
}
function viewDownloads() {
  const list = el('div', { id: 'dlList' });
  setTimeout(() => { renderDownloadList(); refreshDownloads(); });
  return [el('h2', { text: 'Downloads' }),
    el('div', { class: 'addbox' },
      el('div', { class: 'line' }, el('input', { id: 'magnet', type: 'text', placeholder: 'Plak een magnet-link…', onkeydown: (e) => { if (e.key === 'Enter') addMagnet(); } }),
        el('button', { class: 'primary', text: 'Toevoegen', onclick: addMagnet }),
        el('button', { text: '.torrent kiezen', onclick: async () => { try { if (await window.tv.dlAddFile()) toast('Download gestart'); } catch (e) { fail(e); } } })),
      el('div', { class: 'legal', text: `Sleep een .torrent-bestand of magnet-link ook ergens in het venster. Downloads komen in ${S.settings.downloadDir || 'je downloadmap'} en verschijnen daarna automatisch in je bibliotheek. Gebruik dit alleen voor bestanden waarvoor je de rechten hebt. Delen na afloop staat uit.`, })),
    list];
}
function renderDownloadList() {
  const box = $('#dlList'); if (!box) return;
  if (!S.downloads.length) { box.replaceChildren(el('div', { class: 'legal', style: 'margin-top:18px', text: 'Nog geen downloads.' })); return; }
  box.replaceChildren(...S.downloads.map((d) => {
    const pct = Math.round((d.progress || 0) * 100);
    const act = d.done
      ? [el('button', { text: 'Toon in Finder', onclick: () => window.tv.dlReveal(d.id) }),
        el('button', { class: 'danger', text: 'Verwijder bestanden', onclick: () => removeDl(d, true) }), el('button', { text: 'Uit lijst', onclick: () => removeDl(d, false) })]
      : [el('button', { text: d.paused ? '▶ Hervat' : '❚❚ Pauze', onclick: () => (d.paused ? window.tv.dlResume(d.id) : window.tv.dlPause(d.id)) }),
        el('button', { class: 'danger', text: 'Annuleer', onclick: () => removeDl(d, true) })];
    return el('div', { class: 'dl' + (d.done ? ' done' : '') },
      el('div', { class: 'top' }, el('div', { class: 'name', text: d.name, title: d.name }), act),
      el('div', { class: 'bar' }, el('i', { style: `width:${pct}%` })),
      el('div', { class: 'stats' }, d.done ? [el('span', { text: `Klaar · ${bytes(d.length)}` })]
        : [el('span', { text: d.hasMeta ? `${pct}% van ${bytes(d.length)}` : 'Metadata ophalen…' }), el('span', { text: d.paused ? 'Gepauzeerd' : `↓ ${bytes(d.down)}/s` }),
          el('span', { text: `${d.peers} peers` }), d.eta != null && !d.paused ? el('span', { text: `nog ${eta(d.eta / 1000)}` }) : null]));
  }));
  const active = S.downloads.filter((d) => !d.done).length;
  const b = $('#dlBadge'); b.hidden = !active; b.textContent = active;
}
async function removeDl(d, del) {
  if (del && !confirm(`${d.done ? 'Bestanden van' : 'Download'} “${d.name}” verwijderen?`)) return;
  try { applySnapshot(await window.tv.dlRemove(d.id, del)); refreshDownloads(); render(); } catch (e) { fail(e); }
}
async function refreshDownloads() { try { S.downloads = await window.tv.dlList(); renderDownloadList(); } catch {} }

async function runSearch(q) {
  q = q.trim(); if (!q) return;
  S.disc = { q, loading: true }; renderDiscover();
  try { S.disc = { q, ...(await window.tv.search(q)) }; } catch (e) { S.disc = { q, tmdb: null, archive: [], archiveError: String(e.message || e) }; }
  renderDiscover();
}
function viewDiscover() {
  setTimeout(renderDiscover);
  return [el('h2', { text: 'Ontdekken' }),
    el('div', { class: 'addbox' }, el('div', { class: 'line' },
      el('input', { id: 'dq', type: 'text', placeholder: 'Zoek een film of serie…', value: (S.disc && S.disc.q) || '', onkeydown: (e) => { if (e.key === 'Enter') runSearch(e.target.value); } }),
      el('button', { class: 'primary', text: 'Zoeken', onclick: () => runSearch($('#dq').value) })),
      el('div', { class: 'legal', text: 'Zie waar een titel legaal te streamen is (TMDB) en download gratis films uit het publiek domein (Internet Archive).' })),
    el('div', { id: 'discRes' })];
}
function discCard(r) {
  const p = el('div', { class: 'poster', style: r.poster ? '' : `background:${gradient(r.title || '?')}` });
  if (r.poster) p.append(el('img', { src: r.poster, alt: '', loading: 'lazy' })); else p.append(el('b', { text: r.title }));
  return p;
}
function renderDiscover() {
  const box = $('#discRes'); if (!box) return;
  const d = S.disc;
  if (!d) { box.replaceChildren(); return; }
  if (d.loading) { box.replaceChildren(el('div', { class: 'legal', style: 'margin-top:18px', text: 'Zoeken…' })); return; }
  const parts = [];
  parts.push(el('h2', { text: 'Waar kijk je het?' }, el('small', { text: 'TMDB' })));
  if (d.tmdb == null) parts.push(el('div', { class: 'legal', text: d.tmdbError || 'Voeg bij Instellingen een TMDB-sleutel toe om te zien waar titels te streamen zijn.' }));
  else if (!d.tmdb.length) parts.push(el('div', { class: 'legal', text: 'Niets gevonden.' }));
  else parts.push(el('div', { class: 'grid' }, d.tmdb.map((r) => el('div', { class: 'card', onclick: () => openTitle(r) }, discCard(r),
    el('div', { class: 't', text: r.title }), el('div', { class: 's', text: [r.kind === 'tv' ? 'Serie' : 'Film', r.year, r.rating ? `★ ${r.rating}` : ''].filter(Boolean).join(' · ') })))));
  parts.push(el('h2', { text: 'Gratis en legaal downloaden' }, el('small', { text: 'Internet Archive' })));
  if (d.archiveError) parts.push(el('div', { class: 'legal', text: d.archiveError }));
  else if (!d.archive.length) parts.push(el('div', { class: 'legal', text: 'Niets gevonden in het publiek domein.' }));
  else parts.push(el('div', { class: 'grid' }, d.archive.map((r) => {
    const p = el('div', { class: 'poster', style: `background:${gradient(r.title || r.id)}` }, el('img', { src: r.thumb, alt: '', loading: 'lazy' }));
    return el('div', { class: 'card' }, p, el('div', { class: 't', text: r.title, title: r.title }), el('div', { class: 's', text: [r.year, `${r.downloads.toLocaleString('nl-NL')}× gedownload`].filter(Boolean).join(' · ') }),
      el('button', { text: '↓ Downloaden', onclick: async (e) => { e.target.disabled = true; try { await window.tv.archiveDownload(r.id); toast('Download gestart'); refreshDownloads(); } catch (err) { fail(err); } e.target.disabled = false; } }));
  })));
  box.replaceChildren(...parts);
}
async function openTitle(r) {
  const m = $('#modal');
  const sheet = el('div', { class: 'sheet' }, el('button', { class: 'x', text: '×', onclick: closeDetail }),
    el('div', { class: 'hero', style: `background:${gradient(r.title)}` }, discCard(r),
      el('div', { class: 'info' }, el('h1', { text: r.title }), el('div', { class: 'meta' }, el('span', { text: r.kind === 'tv' ? 'Serie' : 'Film' }), r.year ? el('span', { text: r.year }) : null, r.rating ? el('span', { class: 'star', text: `★ ${r.rating}` }) : null),
        el('div', { class: 'over', text: r.overview || 'Geen omschrijving.' }), el('div', { id: 'prov', class: 'plan', style: 'padding:0', text: 'Zoeken waar je dit kunt kijken…' }))));
  m.replaceChildren(sheet); m.hidden = false; D = null;
  try {
    const p = await window.tv.providers(r.kind, r.id);
    const line = (t, a) => (a.length ? `${t}: ${a.join(', ')}` : null);
    const txt = [line('Streamen', p.flatrate), line('Huren', p.rent), line('Kopen', p.buy)].filter(Boolean).join('  ·  ');
    $('#prov').textContent = txt || 'Niet beschikbaar bij Nederlandse aanbieders.';
  } catch (e) { $('#prov').textContent = String(e.message || e); }
}

function viewSettings() {
  const folderLine = (f) => el('div', { class: 'line' }, el('div', { class: 'path', text: f }),
    el('button', { class: 'danger', text: 'Verwijder', onclick: async () => applySnapshot(await window.tv.removeFolder(f), true) }));
  return [el('h2', { text: 'Instellingen' }),
    el('div', { class: 'sec' }, el('h3', { text: 'Bibliotheek' }), el('p', { text: 'Mappen met je films en series. Ondertitels (.srt/.vtt) naast een film worden automatisch gevonden.' }),
      S.folders.map(folderLine), S.folders.length ? null : el('p', { text: 'Nog geen mappen.' }),
      el('div', { class: 'line' }, el('button', { class: 'primary', text: '+ Map toevoegen', onclick: addFolder }), el('button', { text: '↻ Opnieuw scannen', onclick: rescan }))),
    el('div', { class: 'sec' }, el('h3', { text: 'Downloadmap' }), el('p', { text: 'Hier komen je downloads. Deze map wordt altijd meegescand.' }),
      el('div', { class: 'line' }, el('div', { class: 'path', text: S.settings.downloadDir || '' }),
        el('button', { text: 'Wijzigen…', onclick: async () => applySnapshot(await window.tv.chooseDownloadDir(), true) }))),
    (() => {
      const c = S.settings.cleanup || { enabled: false, days: 3 };
      const days = el('select', { onchange: save }, ...[1, 3, 7, 14, 30].map((n) => el('option', { value: n, text: `${n} dag${n === 1 ? '' : 'en'}` })));
      const on = el('input', { type: 'checkbox', checked: c.enabled, onchange: save });
      days.value = String(c.days);
      async function save() { applySnapshot(await window.tv.setCleanup({ enabled: on.checked, days: +days.value }), true); }
      return el('div', { class: 'sec' }, el('h3', { text: 'Automatisch opruimen' }),
        el('p', { text: 'Gekeken downloads gaan na een aantal dagen naar de prullenbak, zodat je schijf niet volloopt. Alleen bestanden in de downloadmap; je eigen mappen en alles met ☆ Bewaren blijven staan. Je kunt het uit de prullenbak terughalen.' }),
        el('div', { class: 'line' }, el('label', { class: 'chk' }, on, ' Opruimen na '), days, el('div', { class: 'grow' }),
          el('button', { text: 'Nu opruimen', onclick: async () => { try { await window.tv.cleanupRun(); } catch (e) { fail(e); } } })));
    })(),
    el('div', { class: 'sec' }, el('h3', { text: 'Posters en omschrijvingen (TMDB)' }),
      el('p', { text: S.settings.hasTmdb ? 'Sleutel ingesteld. Metadata wordt automatisch opgehaald.' : 'Maak een gratis account op themoviedb.org, ga naar Instellingen → API en plak hier je sleutel (API-sleutel of Read Access Token).' }),
      el('div', { class: 'line' }, el('input', { id: 'tmdb', type: 'password', placeholder: S.settings.hasTmdb ? '••••••••  (vervangen)' : 'TMDB-sleutel' }),
        el('button', { class: 'primary', text: 'Opslaan', onclick: async () => { applySnapshot(await window.tv.setTmdb($('#tmdb').value), true); toast('Opgeslagen, posters worden opgehaald'); } }),
        S.settings.hasTmdb ? el('button', { class: 'danger', text: 'Wissen', onclick: async () => applySnapshot(await window.tv.setTmdb(''), true) }) : null)),
    el('div', { class: 'sec' }, el('h3', { text: 'Sneltoetsen' }),
      el('p', {}, el('kbd', { text: '/' }), ' zoeken   ', el('kbd', { text: 'spatie' }), ' pauze/hervat   ', el('kbd', { text: 'esc' }), ' sluiten')),
  ];
}

function render() {
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.view));
  const views = { home: viewHome, movies: viewMovies, series: viewSeries, discover: viewDiscover, downloads: viewDownloads, settings: viewSettings };
  const v = $('#view'); const top = v.scrollTop;
  v.replaceChildren(...[].concat(views[S.view]()));
  if (S.view !== 'downloads' && S.view !== 'discover') v.scrollTop = top;
}
const go = (view) => { S.view = view; render(); };

// ---------- detail ----------
let D = null; // { entry, item, info, season }
async function openDetail(entry, preselect) {
  const isShow = !!entry.episodes;
  D = { entry, isShow, item: isShow ? (preselect || upNext(entry, S.positions, S.watched)) : entry, info: null, season: null };
  if (isShow) D.season = D.item.season || 0;
  drawDetail(); loadInfo();
}
function closeDetail() { D = null; $('#modal').hidden = true; $('#modal').replaceChildren(); }
async function loadInfo() {
  const id = D.item.id; D.info = null;
  try { const info = await window.tv.info(id); if (!D || D.item.id !== id) return; D.info = info; drawDetail(); }
  catch (e) { fail(e); }
}
function drawDetail() {
  if (!D) return;
  const { entry, item, info, isShow } = D;
  const m = metaOf(entry);
  const pos = S.positions[item.id];
  const keep = { audio: $('#dAudio') && $('#dAudio').value, sub: $('#dSub') && $('#dSub').value };
  const sheet = el('div', { class: 'sheet' }, el('button', { class: 'x', text: '×', onclick: closeDetail }),
    el('div', { class: 'hero', style: m.backdrop ? `background-image:url("${m.backdrop}")` : `background:${gradient(entry.title)}` },
      poster(entry),
      el('div', { class: 'info' }, el('h1', { text: entry.title }),
        el('div', { class: 'meta' }, m.year || entry.year ? el('span', { text: m.year || entry.year }) : null, m.rating ? el('span', { class: 'star', text: `★ ${m.rating}` }) : null,
          info ? el('span', { text: fmt(info.duration) }) : null, info && info.video ? el('span', { text: `${info.video.w}×${info.video.h}` }) : null,
          isShow ? el('span', { text: `${epCode(item)}` }) : null),
        el('div', { class: 'over', text: m.overview || (S.settings.hasTmdb ? '' : 'Voeg bij Instellingen een TMDB-sleutel toe voor omschrijvingen en posters.') }))));
  if (isShow) {
    sheet.append(el('div', { class: 'seasons' }, entry.seasons.map((s) => el('button', { class: s === D.season ? 'on' : '', text: s ? `Seizoen ${s}` : 'Overig',
      onclick: () => { D.season = s; drawDetail(); } }))));
    sheet.append(el('div', { class: 'eps' }, entry.episodes.filter((e) => (e.season || 0) === D.season).map((e) => {
      const p = S.positions[e.id];
      return el('div', { class: 'ep' + (e.id === item.id ? ' on' : ''), onclick: () => { D.item = e; drawDetail(); loadInfo(); } },
        el('span', { class: 'c', text: epCode(e) }), el('span', { class: 'n', text: e.file.split('/').pop() }),
        el('span', { class: 'r' + (S.watched[e.id] ? ' ok' : ''), text: S.watched[e.id] ? '✓ gezien' : p ? `nog ${minLeft(e.id)} min` : '' }));
    })));
  }
  const audio = el('select', { id: 'dAudio' }); const sub = el('select', { id: 'dSub' }, el('option', { value: '', text: 'Uit' }));
  if (info) {
    info.audio.forEach((x) => audio.append(el('option', { value: x.index, text: `${x.language.toUpperCase()} · ${x.codec}${x.channels ? ' ' + x.channels + 'ch' : ''} ${x.title}`.trim() })));
    info.sidecars.forEach((x) => sub.append(el('option', { value: x.key, text: `Los bestand (${x.language})` })));
    info.subs.forEach((x) => sub.append(el('option', { value: 's' + x.index, disabled: !x.text, text: `${x.language.toUpperCase()} · ${x.codec} ${x.title}${x.text ? '' : ' (beeld, niet ondersteund)'}`.trim() })));
    const pick = [...sub.options].find((o) => /\b(nl|dut|nld)\b/i.test(o.text) && !o.disabled) || [...sub.options].find((o) => o.value && !o.disabled);
    const prefA = [...audio.options].find((o) => /\b(nl|nld|dut)\b/i.test(o.text)) || [...audio.options].find((o) => /\b(en|eng)\b/i.test(o.text));
    if (prefA) audio.value = prefA.value;
    sub.value = pick ? pick.value : '';
    // behoud een keuze van de gebruiker bij het opnieuw tekenen
    if (keep.audio != null && [...audio.options].some((o) => o.value === keep.audio) && D.kept === item.id) audio.value = keep.audio;
    if (keep.sub != null && [...sub.options].some((o) => o.value === keep.sub) && D.kept === item.id) sub.value = keep.sub;
    D.kept = item.id;
  }
  sheet.append(el('div', { class: 'opts' }, el('label', { text: 'Audio' }, audio), el('label', { text: 'Ondertiteling' }, sub)));
  sheet.append(el('div', { class: 'plan', text: !info ? 'Bestand lezen…' : info.plan.mode === 'direct' ? 'Speelt direct af: geen verwerking nodig.'
    : `Wordt licht verwerkt (${info.plan.video === 'copy' ? 'video ongewijzigd' : 'video omzetten'}, audio ${info.plan.audio === 'copy' ? 'ongewijzigd' : 'omzetten'}).` }));
  const left = daysLeft(item, S.watched, S.keep, S.settings.cleanup);
  if (left != null) sheet.append(el('div', { class: 'plan', text: left > 0 ? `Gekeken: gaat over ${left} dag${left === 1 ? '' : 'en'} naar de prullenbak (tenzij je op Bewaren klikt).` : 'Gekeken: gaat bij de volgende opruimronde naar de prullenbak.' }));
  const resume = pos && pos.t > 30;
  sheet.append(el('div', { class: 'actions' },
    el('button', { class: 'primary', disabled: !info, text: resume ? `▶ Hervat vanaf ${fmt(pos.t)}` : '▶ Afspelen op tv', onclick: (e) => play(resume ? pos.t : 0, e.target) }),
    resume ? el('button', { text: 'Vanaf het begin', onclick: (e) => play(0, e.target) }) : null,
    item.managed ? el('button', { text: S.keep[item.id] ? '★ Bewaard' : '☆ Bewaren', title: 'Nooit automatisch opruimen',
      onclick: async () => { applySnapshot(await window.tv.setKeep(item.id, !S.keep[item.id])); drawDetail(); } }) : null,
    el('button', { text: S.watched[item.id] ? 'Markeer als ongezien' : 'Markeer als gezien',
      onclick: async () => { applySnapshot(await window.tv.markWatched(item.id, !S.watched[item.id])); drawDetail(); } })));
  const modal = $('#modal'); const sc = modal.scrollTop;
  modal.replaceChildren(sheet); modal.hidden = false; modal.scrollTop = sc;
}

async function play(start, btn) {
  if (!S.device) { toast('Kies eerst links onderin je tv bij “Afspelen op”.', true); $('#device').focus(); return; }
  const label = btn.textContent; btn.disabled = true; btn.textContent = 'Verbinden…';
  try {
    const r = await window.tv.play({ id: D.item.id, host: S.device, audioIndex: +$('#dAudio').value || 0, subKey: $('#dSub').value || null, start });
    showNow(r); closeDetail();
  } catch (e) { fail(e); btn.disabled = false; btn.textContent = label; }
}

// ---------- afspeelbalk ----------
let paused = false; let dragging = false; let nowId = null;
function showNow(r) {
  nowId = r.id; paused = false;
  document.body.classList.add('playing'); $('#bar').hidden = false;
  $('#nowTitle').textContent = r.title; $('#nowEp').textContent = r.ep || '';
  const bp = $('#barPoster'); if (r.poster) bp.src = r.poster; else bp.removeAttribute('src');
  $('#pp').textContent = '❚❚'; $('#seek').dataset.dur = r.duration;
  const cc = $('#cc'); cc.replaceChildren(el('option', { value: '', text: 'Ondertitels uit' }), ...r.tracks.map((t) => el('option', { value: t.key, text: t.name })));
  cc.value = r.subKey || '';
  const it = S.items.find((i) => i.id === r.id); $('#nextEp').hidden = !nextEpisode(S.items, it);
}
function hideNow() { document.body.classList.remove('playing'); $('#bar').hidden = true; nowId = null; }

// ---------- acties ----------
async function addFolder() { try { applySnapshot(await window.tv.addFolder(), true); } catch (e) { fail(e); } }
async function rescan() { applySnapshot(await window.tv.rescan(), true); toast('Bibliotheek bijgewerkt'); }
function applySnapshot(s, rerender) {
  if (!s) return;
  Object.assign(S, { items: s.items, folders: s.folders, positions: s.positions, watched: s.watched, keep: s.keep || {}, meta: s.meta, settings: s.settings });
  if (s.lastDevice && !S.device && S.devices.some((d) => d.host === s.lastDevice)) { S.device = s.lastDevice; $('#device').value = S.device; }
  if (rerender) render();
}
function setDevices(list) {
  S.devices = list;
  const d = $('#device'); const cur = S.device;
  d.replaceChildren(el('option', { value: '', text: list.length ? 'Kies je tv…' : 'Tv zoeken…' }), ...list.map((x) => el('option', { value: x.host, text: x.name })));
  if (!list.some((x) => x.host === cur)) S.device = '';
  if (!S.device && S.lastDevice && list.some((x) => x.host === S.lastDevice)) S.device = S.lastDevice;
  if (!S.device && list.length === 1) S.device = list[0].host;
  d.value = S.device;
}

// ---------- events ----------
$('#nav').onclick = (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.v); };
$('#search').oninput = (e) => { S.q = e.target.value; if (['downloads', 'settings', 'discover'].includes(S.view)) S.view = 'home'; render(); };
$('#rescan').onclick = rescan;
$('#device').onchange = (e) => { S.device = e.target.value; };
$('#modal').onclick = (e) => { if (e.target.id === 'modal') closeDetail(); };
$('#pp').onclick = () => { paused = !paused; (paused ? window.tv.pause() : window.tv.resume()).catch(fail); $('#pp').textContent = paused ? '▶' : '❚❚'; };
$('#stop').onclick = async () => { await window.tv.stop().catch(() => {}); hideNow(); };
$('#nextEp').onclick = async () => { try { showNow(await window.tv.next()); } catch (e) { fail(e); } };
$('#vol').oninput = (e) => window.tv.volume(e.target.value / 100).catch(() => {});
$('#cc').onchange = (e) => window.tv.subtitle(e.target.value || null).catch(fail);
$('#seek').onpointerdown = () => (dragging = true);
$('#seek').onchange = (e) => { dragging = false; window.tv.seek((e.target.value / 1000) * (+$('#seek').dataset.dur || 0)).catch(fail); };
document.addEventListener('keydown', (e) => {
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if (e.key === 'Escape') { if (D) closeDetail(); else if (typing) document.activeElement.blur(); }
  else if (e.key === '/' && !typing) { e.preventDefault(); $('#search').focus(); }
  else if (e.key === ' ' && !typing && nowId && !D) { e.preventDefault(); $('#pp').click(); }
});

// slepen en neerzetten van .torrent of magnet
let dragDepth = 0;
addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; $('#drop').hidden = false; });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').hidden = true; } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', async (e) => {
  e.preventDefault(); dragDepth = 0; $('#drop').hidden = true;
  try {
    const f = [...e.dataTransfer.files].find((x) => /\.torrent$/i.test(x.name));
    if (f) await window.tv.dlAddData(new Uint8Array(await f.arrayBuffer()));
    else { const t = e.dataTransfer.getData('text'); if (!/^magnet:/i.test(t)) return toast('Sleep een .torrent-bestand of magnet-link.', true); await window.tv.dlAdd(t); }
    toast('Download gestart'); go('downloads');
  } catch (err) { fail(err); }
});
addEventListener('paste', async (e) => {
  if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  const t = (e.clipboardData.getData('text') || '').trim();
  if (/^magnet:\?/i.test(t)) { try { await window.tv.dlAdd(t); toast('Download gestart'); go('downloads'); } catch (err) { fail(err); } }
});

window.tv.onDevices(setDevices);
window.tv.onError((m) => toast(m, true));
window.tv.onToast((m) => toast(m));
window.tv.onMeta((m) => { S.meta = m; if (!D) render(); else drawDetail(); });
window.tv.onLibrary((s) => applySnapshot(s, !D));
window.tv.onProgress((p) => { S.positions = p.positions; S.watched = p.watched; if (S.view === 'home' && !D) render(); });
window.tv.onNowPlaying(showNow);
window.tv.onEnded(hideNow);
window.tv.onDownloads((l) => { S.downloads = l; renderDownloadList(); const b = $('#dlBadge'); const a = l.filter((d) => !d.done).length; b.hidden = !a; b.textContent = a; });
window.tv.onStatus((s) => {
  if (s.state === 'IDLE' && !s.time) return;
  if (!dragging && s.duration) $('#seek').value = Math.round((s.time / s.duration) * 1000);
  $('#seek').dataset.dur = s.duration; $('#t0').textContent = fmt(s.time); $('#t1').textContent = fmt(s.duration);
  if (s.volume != null) $('#vol').value = Math.round(s.volume * 100);
  paused = s.state === 'PAUSED'; $('#pp').textContent = paused ? '▶' : '❚❚';
});

(async () => {
  const snap = await window.tv.library(); S.lastDevice = snap.lastDevice; applySnapshot(snap); render();
  setDevices(await window.tv.devices());
  setInterval(async () => setDevices(await window.tv.devices()), 8000);
  refreshDownloads();
})();

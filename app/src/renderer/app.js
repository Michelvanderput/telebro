const $ = (s) => document.querySelector(s);
let items = [], tab = 'all', sel = null, dragging = false, deviceHost = '', paused = false;

const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };
const hue = (str) => { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 5000); };

function render() {
  const q = $('#search').value.trim().toLowerCase();
  const list = items.filter((i) => (tab === 'all' || i.type === tab) && i.title.toLowerCase().includes(q));
  const grid = $('#grid');
  grid.replaceChildren();
  if (!list.length) {
    const d = document.createElement('div'); d.className = 'empty';
    d.textContent = items.length ? 'Niets gevonden.' : 'Nog geen bibliotheek. Klik rechtsboven op “+ Map” en kies de map met je films en series.';
    grid.append(d); return;
  }
  for (const i of list) {
    const c = document.createElement('div'); c.className = 'card' + (sel && sel.id === i.id ? ' sel' : '');
    const h = hue(i.title);
    c.style.background = `linear-gradient(160deg, hsl(${h} 60% 35%), hsl(${(h + 50) % 360} 55% 14%))`;
    const b = document.createElement('b'); b.textContent = i.title;
    const s = document.createElement('small');
    s.textContent = i.type === 'series' ? `S${String(i.season).padStart(2, '0')}E${String(i.episode).padStart(2, '0')}` : (i.year || 'Film');
    c.append(b, s); c.onclick = () => openDetail(i); grid.append(c);
  }
}

async function openDetail(i) {
  sel = i; render();
  $('#detail').hidden = false;
  $('#dTitle').textContent = i.title;
  $('#dMeta').textContent = 'Laden…';
  try {
    const info = await window.tv.info(i.id);
    $('#dMeta').textContent = `${info.video ? info.video.w + '×' + info.video.h + ' ' + info.video.codec : ''} · ${fmt(info.duration)}`;
    const a = $('#dAudio'); a.replaceChildren();
    info.audio.forEach((x) => a.append(new Option(`${x.language} ${x.codec} ${x.channels || ''}ch ${x.title}`.trim(), x.index)));
    const s = $('#dSub'); s.replaceChildren(new Option('Uit', ''));
    info.sidecars.forEach((x) => s.append(new Option(`Los bestand (${x.language})`, x.key)));
    info.subs.forEach((x) => { const o = new Option(`${x.language} ${x.codec} ${x.title}${x.text ? '' : ' (afbeelding, niet ondersteund)'}`.trim(), 's' + x.index); o.disabled = !x.text; s.append(o); });
    const first = [...s.options].find((o) => /nl|dut/.test(o.text) && !o.disabled) || [...s.options].find((o) => o.value && !o.disabled);
    if (first) s.value = first.value;
    $('#dPlan').textContent = info.plan.mode === 'direct' ? 'Direct afspelen: geen verwerking nodig.'
      : `Licht verwerken (${info.plan.video === 'copy' ? 'video ongewijzigd' : 'video omzetten'}, audio ${info.plan.audio === 'copy' ? 'ongewijzigd' : 'omzetten'}).`;
  } catch (e) { $('#dMeta').textContent = 'Kon bestand niet lezen'; toast(String(e.message || e)); }
}

async function play(start = 0) {
  if (!deviceHost) return toast('Kies eerst een tv rechtsboven.');
  $('#dPlay').disabled = true; $('#dPlay').textContent = 'Verbinden…';
  try {
    await window.tv.play({ id: sel.id, host: deviceHost, audioIndex: +$('#dAudio').value || 0, subKey: $('#dSub').value || null, start });
    $('#bar').hidden = false; $('#nowTitle').textContent = sel.title; paused = false; $('#pp').textContent = '❚❚';
  } catch (e) { toast(String(e.message || e)); }
  $('#dPlay').disabled = false; $('#dPlay').textContent = '▶ Speel af op tv';
}

function setDevices(list) {
  const cur = deviceHost;
  const d = $('#device'); d.replaceChildren(new Option(list.length ? 'Kies tv…' : 'Tv zoeken…', ''));
  list.forEach((x) => d.append(new Option(x.name, x.host)));
  d.value = list.some((x) => x.host === cur) ? cur : '';
}

$('#search').oninput = render;
$('#tabs').onclick = (e) => { if (!e.target.dataset.t) return; tab = e.target.dataset.t;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b === e.target)); render(); };
$('#close').onclick = () => { $('#detail').hidden = true; sel = null; render(); };
$('#device').onchange = (e) => { deviceHost = e.target.value; };
$('#addFolder').onclick = async () => { const r = await window.tv.addFolder(); items = r.items; render(); };
$('#dPlay').onclick = () => play(0);
$('#dSub').onchange = (e) => { if (!$('#bar').hidden) window.tv.subtitle(e.target.value || null).catch((x) => toast(String(x.message))); };
$('#pp').onclick = () => { paused = !paused; (paused ? window.tv.pause() : window.tv.resume()).catch((x) => toast(String(x.message))); $('#pp').textContent = paused ? '▶' : '❚❚'; };
$('#stop').onclick = async () => { await window.tv.stop(); $('#bar').hidden = true; };
$('#vol').oninput = (e) => window.tv.volume(e.target.value / 100).catch(() => {});
$('#seek').onpointerdown = () => (dragging = true);
$('#seek').onchange = (e) => { dragging = false; window.tv.seek(e.target.value / 1000 * ($('#seek').dataset.dur || 0)).catch((x) => toast(String(x.message))); };

window.tv.onDevices(setDevices);
window.tv.onError((m) => toast(m));
window.tv.onStatus((s) => {
  if (s.state === 'IDLE') { if (s.time === 0) return; }
  $('#seek').dataset.dur = s.duration;
  if (!dragging && s.duration) $('#seek').value = Math.round(s.time / s.duration * 1000);
  $('#t0').textContent = fmt(s.time); $('#t1').textContent = fmt(s.duration);
  if (s.volume != null) $('#vol').value = Math.round(s.volume * 100);
});

(async () => {
  const lib = await window.tv.library(); items = lib.items; render();
  setDevices(await window.tv.devices());
  setInterval(async () => setDevices(await window.tv.devices()), 8000);
})();

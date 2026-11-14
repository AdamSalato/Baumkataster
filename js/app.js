// ===== Anwendung: Anmeldung, Karte, Dashboard, Detailseite, Speichern =====

const TEST = /[?&]test\b/i.test(location.search);       // index.html?test = Testversion ohne Datenbank (js/mock.js)
let sb, map, layer, geoPin, homeLL = null;
const markers = new Map();
const OHNE = '\u0000';                                    // Kundenfilter „Ohne Kunde“
const S = { objs: [], sel: null, kons: [], kid: null, typ: 'baum', filter: 'all', kunde: '', sort: { k: 'dring', dir: 1 }, q: '', mode: 'pruef', tool: null, draft: null, me: null, admin: false };
const kCur = () => S.kons.find(k => k.id === S.kid);
const locked = k => !S.admin && abgelaufen(k);            // für den angemeldeten Benutzer gesperrt?
const noMap = () => document.body.classList.contains('nomap');

// ===== Erscheinungsbild aus config.js =====
function brand() {
  document.title = CONFIG.APP_NAME + (TEST ? ' (Test)' : '');
  document.querySelectorAll('.appname').forEach(e => e.textContent = CONFIG.APP_NAME);
  document.querySelectorAll('img.logo').forEach(i => { if (CONFIG.LOGO) { i.src = CONFIG.LOGO; i.hidden = false; i.onerror = () => i.hidden = true; } });
  const ic = document.querySelector('link[rel=icon]'); if (ic && CONFIG.LOGO) ic.href = CONFIG.LOGO;
}

// ===== Anmeldung =====
// Name des angemeldeten Benutzers: Anzeigename aus Supabase, sonst aus der E-Mail (max.muster@... -> Max Muster)
function userName(u) {
  if (!u) return null;
  const m = u.user_metadata || {}, n = m.full_name || m.name || m.display_name;
  if (n) return String(n).trim();
  const l = String(u.email || '').split('@')[0].replace(/[._\-+]+/g, ' ').trim();
  return l ? l.replace(/(^|\s)(\S)/g, (x, a, b) => a + b.toUpperCase()) : null;
}
const meName = () => S.me || store.get('bk_pruefer') || null;
function showLogin() { $('login').hidden = false; $('hd').hidden = $('app').hidden = true; }
const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
async function boot() {
  brand();
  if (TEST) {
    try { await loadScript('js/mock.js'); } catch (e) { showLogin(); $('err').textContent = 'js/mock.js konnte nicht geladen werden.'; return; }
    sb = createMock();
    $('testHint').hidden = $('testChip').hidden = $('bReset').hidden = false; $('emLbl').textContent = 'Benutzer'; $('em').type = 'text';
  } else {
    if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('DEIN-')) { showLogin(); $('err').textContent = 'Bitte SUPABASE_URL und SUPABASE_KEY in config.js eintragen.'; return; }
    if (!window.supabase) { showLogin(); $('err').textContent = 'Die Datenbank-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen und neu laden.'; return; }
    sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
  }
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') showLogin(); });
  const { data } = await sb.auth.getSession();
  data.session ? start() : showLogin();
}
$('bLogin').onclick = async () => {
  if (!sb) return;
  const { error } = await sb.auth.signInWithPassword({ email: $('em').value.trim(), password: $('pw').value });
  if (error) $('err').textContent = 'Anmeldung fehlgeschlagen: ' + error.message;
  else { $('err').textContent = ''; $('pw').value = ''; start(); }
};
$('pw').onkeydown = e => { if (e.key === 'Enter') $('bLogin').click(); };
$('bOut').onclick = () => sb.auth.signOut();

async function loadObjs() {
  let all = [], from = 0;
  for (;;) {
    const { data, error } = await sb.from('objekte').select('*').order('kennung').range(from, from + 999);
    if (error) { toast('Laden fehlgeschlagen: ' + error.message, true); return false; }
    all = all.concat(data); if (data.length < 1000) break; from += 1000;
  }
  S.objs = all; refreshKunden(); return true;
}
async function start() {
  $('login').hidden = true; $('hd').hidden = $('app').hidden = false;
  try {
    const { data } = await sb.auth.getSession(), u = data.session && data.session.user;
    S.me = userName(u); S.admin = !!u && (u.app_metadata || {}).role === 'admin';      // Admin-Recht: siehe setup.sql
  } catch (e) { }
  $('who').innerHTML = `<b>${esc(S.me || 'Angemeldet')}</b>${S.admin ? 'Admin' : 'Prüfer'}`;
  if (!map) { initMap(); initLayout(); }
  setTimeout(() => map.invalidateSize(), 50);
  const ty = await sb.from('objekttypen').select('*');
  (ty.data || []).forEach(r => { if (TYPES[r.code]) { TYPES[r.code].months = r.intervall_monate; TYPES[r.code].label = r.bezeichnung; } });
  await loadObjs();
  renderMarkers(); showDash(); goHome();
}
document.addEventListener('visibilitychange', async () => { if (!document.hidden && sb && !$('app').hidden && !S.sel && await loadObjs()) { renderMarkers(); renderDash(); } });

// ===== Layout: Karte ein-/ausblenden, Breite ändern =====
function setMapVisible(v, remember = true) {
  document.body.classList.toggle('nomap', !v);
  $('bMap').innerHTML = `🗺<span class="lbl"> Karte ${v ? 'ausblenden' : 'einblenden'}</span>`;
  $('bMap').setAttribute('aria-label', v ? 'Karte ausblenden' : 'Karte einblenden');
  if (remember) store.set('bk_map', v ? '1' : '0');
  if (v && map) setTimeout(() => map.invalidateSize(), 60);
}
function initLayout() {
  const v = store.get('bk_map');
  setMapVisible(v == null ? window.innerWidth >= 700 : v === '1', false);
  const w = parseInt(store.get('bk_mapw'));
  if (w) $('app').style.setProperty('--mapw', w + 'px');
  const sp = $('split'), app = $('app');
  const setW = px => { const max = app.clientWidth - 430, val = Math.max(240, Math.min(px, max)); app.style.setProperty('--mapw', val + 'px'); store.set('bk_mapw', Math.round(val)); map.invalidateSize(); };
  sp.addEventListener('pointerdown', e => { sp.setPointerCapture(e.pointerId); sp.classList.add('drag'); });
  sp.addEventListener('pointermove', e => { if (sp.classList.contains('drag')) setW(e.clientX - app.getBoundingClientRect().left); });
  const end = () => { sp.classList.remove('drag'); map.invalidateSize(); };
  sp.addEventListener('pointerup', end); sp.addEventListener('pointercancel', end);
  sp.addEventListener('keydown', e => { const cur = $('mapwrap').getBoundingClientRect().width; if (e.key === 'ArrowLeft') { setW(cur - 40); e.preventDefault(); } if (e.key === 'ArrowRight') { setW(cur + 40); e.preventDefault(); } });
  window.addEventListener('resize', () => map.invalidateSize());
}
$('bMap').onclick = () => setMapVisible(noMap());

// ===== Karte =====
function initMap() {
  map = L.map('map', { zoomControl: false }).setView(CONFIG.START_FALLBACK, 17);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap-Mitwirkende' }).addTo(map);
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Luftbild &copy; Esri' });
  L.control.layers({ Karte: osm, Luftbild: sat }).addTo(map);
  layer = L.layerGroup().addTo(map);
  map.on('click', e => mapClick(e.latlng));
  renderLegend();
}
async function geocode(q) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&accept-language=de&q=' + encodeURIComponent(q), { signal: ctl.signal });
    const j = await r.json(); return j[0] ? { ll: [+j[0].lat, +j[0].lon], name: j[0].display_name } : null;
  } catch (e) { return null; } finally { clearTimeout(to); }
}
// Startpunkt: Adresse aus config.js, einmal ermittelt und im Browser gemerkt
async function homePos() {
  if (homeLL) return homeLL;
  try { const c = JSON.parse(store.get('bk_home2')); if (c && c.q === CONFIG.START_ADRESSE) return homeLL = c.ll; } catch (e) { }
  const g = await geocode(CONFIG.START_ADRESSE); homeLL = g ? g.ll : CONFIG.START_FALLBACK;
  if (g) store.set('bk_home2', JSON.stringify({ q: CONFIG.START_ADRESSE, ll: homeLL }));
  return homeLL;
}
async function goHome() { map.setView(await homePos(), 17); }
$('bHome').onclick = goHome;
$('bAll').onclick = () => { const v = S.objs.filter(visible); if (v.length) map.fitBounds(v.map(t => [t.lat, t.lng]), { maxZoom: 18, padding: [40, 40] }); else toast('Keine Objekte vorhanden'); };
$('geoForm').onsubmit = async e => {
  e.preventDefault(); const q = $('geoQ').value.trim(); if (!q) return;
  const g = await geocode(q); if (!g) return toast('Adresse nicht gefunden', true);
  map.setView(g.ll, 18); if (geoPin) geoPin.remove();
  geoPin = L.circleMarker(g.ll, { radius: 8, color: cssVar('--brand'), weight: 3, fillColor: '#fff', fillOpacity: .7 }).addTo(map).bindTooltip(esc(g.name));
};
function setMode(m) { S.mode = m; $('mP').classList.toggle('on', m === 'pruef'); $('mR').classList.toggle('on', m === 'risk'); renderMarkers(); renderLegend(); }
$('mP').onclick = () => setMode('pruef'); $('mR').onclick = () => setMode('risk');
function renderLegend() {
  const it = S.mode === 'risk' ? [['grn', 'Risiko gering'], ['yel', 'mittel'], ['red', 'hoch']] : [['grn', 'Prüfung ok'], ['yel', '≤ 3 Monate'], ['org', '≤ 1 Monat'], ['red', 'überfällig']];
  $('legend').innerHTML = it.map(([c, t]) => `<span><i style="background:${mcol(c)}"></i>${t}</span>`).join('');
}
function mStyle(t) {
  const on = S.sel && S.sel.id === t.id, col = mcol(t.entfernt ? 'neu' : S.mode === 'risk' ? RISK[t.sicherheit].c : status(t).k);
  return { radius: on ? 13 : 10, color: on ? '#111' : '#fff', weight: on ? 4 : 2, fillColor: col, fillOpacity: 1 };
}
function renderMarkers() {
  if (!layer) return; layer.clearLayers(); markers.clear();
  S.objs.filter(visible).forEach(t => {
    const m = L.circleMarker([t.lat, t.lng], mStyle(t)).bindTooltip(`${esc(t.kennung)}${t.name !== t.kennung ? ' · ' + esc(t.name) : ''}${t.kunde ? ' · ' + esc(t.kunde) : ''}${t.entfernt ? ' (entfernt)' : ''}`).on('click', ev => { L.DomEvent.stopPropagation(ev); if (S.tool) return mapClick(ev.latlng); select(t.id); });
    m.addTo(layer); markers.set(t.id, m);
  });
  if (S.sel) markers.get(S.sel.id)?.bringToFront();
}

// ===== Kunden =====
const kundenListe = () => [...new Set(S.objs.map(o => (o.kunde || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
function refreshKunden() {
  const l = kundenListe();
  $('kunden').innerHTML = l.map(k => `<option value="${esc(k)}">`).join('');
  if (S.kunde && S.kunde !== OHNE && !l.includes(S.kunde)) S.kunde = '';
}

// ===== Dashboard =====
// Kacheln/Filter. „Alle“ und alle übrigen Kacheln zeigen nur aktive Objekte, entfernte stehen nur unter „Entfernt“.
const FILTER = {
  all: ['', t => true, ''],
  red: ['Überfällig', t => status(t).k === 'red', 'red'],
  yel: ['Fällig ≤ 3 Monate', faelligBald, 'yel'],
  risk: ['Risiko hoch', t => t.sicherheit === 'hoch' && !!t.letzte_pruefung, 'red'],
  prio: ['Priorität', t => !!t.aktuell?.prio, 'blu'],
  fael: ['Fällung nötig', t => T(t).isFlagged(t), ''],
  ent: ['Entfernt', t => true, 'off']
};
const matchQ = t => { const q = S.q.toLowerCase().trim(); return !q || [t.kennung, t.name, t.kunde, t.art, t.strasse, t.hausnummer, t.plz, t.stadt, t.pruefer].join(' ').toLowerCase().includes(q); };
const matchK = t => !S.kunde || (S.kunde === OHNE ? !t.kunde : t.kunde === S.kunde);
const matchF = t => S.filter === 'ent' ? !!t.entfernt : !t.entfernt && (FILTER[S.filter] || FILTER.all)[1](t);
const visible = t => t.typ === S.typ && ((S.sel && S.sel.id === t.id) || (matchK(t) && matchQ(t) && matchF(t)));
function sorted(list) {
  const { k, dir } = S.sort, ds = t => status(t).days, str = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'de', { numeric: true });
  const cmp = {
    dring: (a, b) => ds(a) - ds(b) || RISK[b.sicherheit].rank - RISK[a.sicherheit].rank,
    id: (a, b) => str(a.kennung, b.kennung),
    name: (a, b) => str(a.name, b.name),
    kunde: (a, b) => str(a.kunde, b.kunde) || str(a.kennung, b.kennung),
    pruefer: (a, b) => str(a.pruefer, b.pruefer),
    risk: (a, b) => RISK[b.sicherheit].rank - RISK[a.sicherheit].rank || ds(a) - ds(b),
    key: (a, b) => (T(a).keyValue(a) ?? -1) - (T(b).keyValue(b) ?? -1)
  }[k];
  return list.slice().sort((a, b) => cmp(a, b) * dir);
}
// Die Liste genau so, wie sie im Dashboard steht (für Tabelle und PDF-Liste)
const currentList = () => sorted(S.objs.filter(t => t.typ === S.typ && matchK(t) && matchQ(t) && matchF(t)));
function filterText() {
  const TT = TYPES[S.typ], p = [S.filter === 'all' ? 'Alle ' + TT.plural : FILTER[S.filter][0]];
  if (S.kunde) p.push(S.kunde === OHNE ? 'ohne Kunde' : 'Kunde: ' + S.kunde);
  if (S.q.trim()) p.push(`Suche: „${S.q.trim()}“`);
  return p.join(' · ');
}
function showDash() {
  S.sel = null; S.kons = []; S.kid = null; setTool(null);
  $('detail').hidden = true; $('dash').hidden = false;
  renderDash(); renderMarkers();
  if (mobile() && !noMap()) $('mapwrap').scrollIntoView({ block: 'start' });
  else $('panel').scrollTop = 0;
}
function renderDash() {
  const TT = TYPES[S.typ], pool = S.objs.filter(o => o.typ === S.typ && matchK(o)), akt = pool.filter(o => !o.entfernt), n = f => akt.filter(f).length;
  const nRisk = n(FILTER.risk[1]);
  const chips = Object.entries(FILTER).map(([k, [l, f, cls]]) => k === 'all' ? [k, 'Alle ' + TT.plural, akt.length, ''] : k === 'ent' ? [k, l, pool.length - akt.length, cls] : [k, l, n(f), k === 'risk' && nRisk ? 'rdk' : cls]);
  const list = currentList(), kl = kundenListe();
  const th = (k, l, cls = '') => `<th class="${cls}"><button data-sort="${k}" aria-label="Sortieren nach ${l}">${l}${S.sort.k === k ? (S.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
  const rows = list.map(t => {
    const st = status(t), nm = t.name && t.name !== t.kennung ? esc(t.name) : '<span class="mute">–</span>';
    return `<tr class="r${t.entfernt ? ' off' : ''}" data-id="${t.id}" tabindex="0"><td class="idc">${esc(t.kennung)}</td>
    <td><b>${nm}</b>${t.entfernt ? '<span class="badge off">Entfernt</span>' : T(t).badges(t)}<small>${esc([t.art, addr(t)].filter(Boolean).join(' · '))}</small></td>
    <td class="hide-xs">${t.kunde ? esc(t.kunde) : '<span class="mute">–</span>'}</td>
    <td><span class="chip ${st.k}">${fmtD(t.letzte_pruefung)}</span><small>${st.label}</small></td>
    <td class="hide-s nw">${esc(t.pruefer || '–')}</td>
    <td>${t.letzte_pruefung ? `<span class="chip ${t.entfernt ? 'neu' : RISK[t.sicherheit].c}">${cap(t.sicherheit)}</span>` : '<span class="mute">–</span>'}</td>
    <td class="hide-s nw">${T(t).keyFmt(T(t).keyValue(t))}</td></tr>`;
  }).join('');
  const types = Object.keys(TYPES).length > 1 ? `<select id="typSel" aria-label="Objekttyp">${Object.entries(TYPES).map(([c, v]) => `<option value="${c}" ${c === S.typ ? 'selected' : ''}>${v.plural}</option>`).join('')}</select>` : '';
  const kSel = kl.length ? `<select id="kSel" aria-label="Kunde filtern"><option value="">Alle Kunden</option>${kl.map(k => `<option value="${esc(k)}" ${k === S.kunde ? 'selected' : ''}>${esc(k)}</option>`).join('')}<option value="${OHNE}" ${S.kunde === OHNE ? 'selected' : ''}>Ohne Kunde</option></select>` : '';
  $('dash').innerHTML = `
  <div class="sum">${chips.map(([k, l, c, cls]) => `<button class="${cls}${S.filter === k ? ' on' : ''}" data-f="${k}" aria-pressed="${S.filter === k}"><b>${c}</b><span>${l}</span></button>`).join('')}</div>
  <div class="bar">${types}${kSel}<input id="q" type="search" placeholder="Suchen: ID, Name, Kunde, Art, Adresse, Prüfer" value="${esc(S.q)}" aria-label="Suchen"></div>
  <div class="card tbl"><div class="sc"><table><thead><tr>${th('id', 'ID')}${th('name', 'Name')}${th('kunde', 'Kunde', 'hide-xs')}${th('dring', 'Letzte Prüfung')}${th('pruefer', 'Prüfer', 'hide-s')}${th('risk', 'Sicherheitsrisiko')}${th('key', TT.keyLabel.replace('Baumhöhe', 'Höhe'), 'hide-s')}</tr></thead>
  <tbody>${rows}</tbody></table>${rows ? '' : `<div class="empty">${pool.length || S.kunde ? 'Keine Treffer für diese Auswahl.' : `Noch keine ${TT.plural} erfasst. Mit „+ Neuer ${TT.label}“ den ersten anlegen.`}</div>`}</div></div>`;
}
$('dash').addEventListener('click', e => {
  const f = e.target.closest('[data-f]'), s = e.target.closest('[data-sort]'), r = e.target.closest('tr.r');
  if (f) { S.filter = S.filter === f.dataset.f ? 'all' : f.dataset.f; renderDash(); renderMarkers(); }
  else if (s) { const k = s.dataset.sort; S.sort = { k, dir: S.sort.k === k ? -S.sort.dir : 1 }; renderDash(); }
  else if (r) select(r.dataset.id);
});
$('dash').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('tr.r')) select(e.target.dataset.id); });
$('dash').addEventListener('input', e => {
  if (e.target.id !== 'q') return;
  S.q = e.target.value; const pos = e.target.selectionStart; renderDash(); renderMarkers();
  const q = $('q'); q.focus(); q.setSelectionRange(pos, pos);
});
$('dash').addEventListener('change', e => {
  if (e.target.id === 'typSel') { S.typ = e.target.value; S.filter = 'all'; S.kunde = ''; renderDash(); renderMarkers(); }
  if (e.target.id === 'kSel') { S.kunde = e.target.value; renderDash(); renderMarkers(); }
});

// ===== Auswahl & Detail =====
async function loadKons(id) {
  const { data, error } = await sb.from('pruefungen').select('*').eq('objekt_id', id).order('datum', { ascending: false }).order('created_at', { ascending: false });
  if (error) { toast('Prüfungen laden fehlgeschlagen: ' + error.message, true); return []; }
  return data;
}
async function select(id) {
  const t = S.objs.find(x => x.id === id); if (!t) return;
  const kons = await loadKons(id);
  S.sel = t; S.kons = kons; S.kid = kons[0]?.id ?? null; S.typ = t.typ;
  $('dash').hidden = true; $('detail').hidden = false;
  renderDetail(); renderMarkers();
  if (!noMap()) map.setView([t.lat, t.lng], Math.max(map.getZoom(), 18));
  $('panel').scrollTop = 0;
  if (mobile()) $('detail').scrollIntoView({ block: 'start' });
}
const putObj = t => { const i = S.objs.findIndex(x => x.id === t.id); if (i >= 0) S.objs[i] = t; };
async function syncSel() {
  const { data } = await sb.from('objekte').select('*').eq('id', S.sel.id).single();
  if (!data) return;
  putObj(data); S.sel = data; renderFacts(); renderMarkers();
}
function renderHead() {
  const t = S.sel;
  $('dTitle').textContent = t.name;
  $('dAddr').innerHTML = `<span class="idchip">${esc(t.kennung)}</span>${esc([t.art, addr(t)].filter(Boolean).join(' · '))}`;
}
function renderDetail() {
  const t = S.sel, Ty = T(t), darfLoeschen = S.admin || !S.kons.some(abgelaufen);
  $('detail').innerHTML = `
  <div class="dhead"><button class="btn sec" id="bBack">← Dashboard</button><div><h2 id="dTitle"></h2><small id="dAddr"></small></div></div>
  <div id="facts"></div>
  <div class="acts"><button class="btn pri big" id="bNew">+ Neue Prüfung</button><button class="btn sec" id="bPdfLast">PDF (nur letzte Prüfung)</button><button class="btn sec" id="bPdfAll">PDF (alle Prüfungen)</button></div>
  <section class="card"><h3>Prüfungen</h3><div id="hist"></div><div id="kform"></div></section>
  <details class="card" open><summary>Stammdaten</summary>
    <div class="g2">
      <label>ID<input type="text" value="${esc(t.kennung)}" readonly></label>${field('Name / Bezeichnung', 't', 'name', t.name)}
      ${field('Straße', 't', 'strasse', t.strasse)}${field('Hausnr.', 't', 'hausnummer', t.hausnummer)}${field('PLZ', 't', 'plz', t.plz)}${field('Stadt', 't', 'stadt', t.stadt)}
      ${Ty.stammForm(t)}
    </div>
    ${Ty.stammNotiz(t)}
    <p style="margin:8px 0 0"><small id="posInfo"></small></p>
    <div class="foot"><button class="btn sec" id="bMove">Position auf Karte neu setzen</button><button class="btn sec" id="bGeoAddr">Position aus Adresse ermitteln</button>
      <button class="btn sec" id="bEnt">${t.entfernt ? 'Wieder als aktiv führen' : 'Als entfernt markieren'}</button>${darfLoeschen ? '<button class="btn dan" id="bDel">Löschen</button>' : ''}</div>
    ${darfLoeschen ? '' : `<span class="hint">Endgültig löschen kann nur ein Admin, weil abgeschlossene Prüfungen vorliegen. Nicht mehr vorhandene ${Ty.plural} bitte als entfernt markieren.</span>`}
  </details>`;
  renderHead(); renderFacts(); renderHist(); renderForm(); renderPos();
}
function renderPos() {
  const t = S.sel, q = { adresse: 'aus Adresse ermittelt (ungefähr)', karte: 'auf der Karte gesetzt', gps: 'per Standort gesetzt' }[t.pos_quelle];
  $('posInfo').textContent = `Position ${t.lat.toFixed(6)}, ${t.lng.toFixed(6)}, ${q}`;
}
function renderFacts() {
  const t = S.sel, st = status(t), has = !!t.letzte_pruefung, Ty = T(t);
  const fl = Ty.flags(t); if (t.entfernt) fl.unshift(['off', st.label]); else if (t.pos_quelle === 'adresse') fl.push(['neu', 'Position ungefähr (aus Adresse), bei Bedarf auf der Karte neu setzen']);
  $('facts').innerHTML = `<div class="tiles">
    <div class="tile"><span class="lb">${Ty.keyLabel}</span><b class="big">${Ty.keyFmt(Ty.keyValue(t))}</b></div>
    <div class="tile ${st.k}"><span class="lb">Letzte Prüfung</span><b class="big">${fmtD(t.letzte_pruefung)}</b><small>${st.label}${t.pruefer ? ' · ' + esc(t.pruefer) : ''}</small></div>
    <div class="tile ${has && !t.entfernt ? RISK[t.sicherheit].c : ''}"><span class="lb">Sicherheitsrisiko</span><b class="big">${has ? cap(t.sicherheit) : '–'}</b></div></div>
  <div class="flags">${fl.map(([c, x]) => `<span class="chip ${c}">${esc(x)}</span>`).join('')}</div>`;
}
function renderHist() {
  const Ty = T(S.sel);
  $('hist').innerHTML = S.kons.length ? S.kons.map(k => `<button class="hrow${k.id === S.kid ? ' on' : ''}" data-kid="${k.id}"><span>${abgelaufen(k) ? '<span title="abgeschlossen">🔒</span> ' : ''}${fmtD(k.datum)}</span><span class="mute">${esc([k.pruefer, k.kunde].filter(Boolean).join(' · ') || '–')}</span><span>${Ty.keyFmt(Ty.keyValue({ aktuell: k.daten }))}</span><span class="chip ${RISK[k.sicherheit].c}">${cap(k.sicherheit)}</span></button>`).join('') : '<div class="empty">Noch keine Prüfung erfasst.<br>Mit „+ Neue Prüfung“ die erste anlegen.</div>';
}
function renderForm() {
  const k = kCur(), el = $('kform');
  const kundeFeld = (s, v) => `<div class="kbar">${field('Kunde', s, 'kunde', v, 'text', 'list="kunden" autocomplete="off" placeholder="Tippen oder auswählen"')}</div>`;
  // Ohne Prüfung gehört der Kunde zum Objekt; sonst steht er in der Prüfung (so bleiben frühere Kunden in der Historie sichtbar)
  if (!k) { el.innerHTML = kundeFeld('t', S.sel.kunde) + (S.sel.typ === 'baum' ? `<h4>Baumart</h4>${artInput(S.sel.art)}` : ''); return; }
  const lk = locked(k), h = CONFIG.SPERRE_STUNDEN;
  const note = lk ? `<div class="lock">🔒 Diese Prüfung ist abgeschlossen (älter als ${h} Stunden) und kann nicht mehr geändert werden. Für neue Werte bitte „+ Neue Prüfung“ anlegen.</div>`
    : abgelaufen(k) ? `<div class="lock adm">Admin: Diese Prüfung ist für andere Benutzer gesperrt (älter als ${h} Stunden). Du kannst sie weiterhin ändern.</div>`
    : `<div class="lock ok">Änderbar bis ${sperreAb(k).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} Uhr, danach abgeschlossen.</div>`;
  el.innerHTML = note + kundeFeld('k', k.kunde) + T(S.sel).form(k) + `<div class="foot"><button class="btn sec" id="bPdfOne">PDF dieser Prüfung</button>${lk ? '' : '<button class="btn dan" id="bKdel">Prüfung löschen</button>'}</div>`;
  if (lk) el.querySelectorAll('[data-k],[data-d],[data-chk],.ar button').forEach(e => { e.disabled = true; });
}

// ===== Speichern =====
async function patch(tbl, obj, p) {
  const old = {}; for (const f in p) old[f] = obj[f];
  Object.assign(obj, p);
  const { error } = await sb.from(tbl).update(p).eq('id', obj.id);
  if (error) { Object.assign(obj, old); toast('Speichern fehlgeschlagen: ' + error.message, true); return false; }
  toast('Gespeichert'); return true;
}
function readVal(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'number') { if (el.value === '') return null; const n = Math.round(parseFloat(el.value) * 100) / 100; return isNaN(n) || n < 0 ? undefined : n; }
  if (el.type === 'radio') return el.value;
  const v = el.value.trim();
  return el.type === 'date' ? (v || undefined) : (v || null);
}
async function commit(el) {
  const t = S.sel, k = kCur(), ds = el.dataset; if (!t) return;
  if ((ds.chk || ds.k || ds.d) && k && locked(k)) { toast('Diese Prüfung ist abgeschlossen und kann nicht mehr geändert werden', true); renderForm(); return; }
  if (ds.chk) {
    if (!k) return;
    const bf = new Set(k.daten?.befunde || []); el.checked ? bf.add(ds.chk) : bf.delete(ds.chk);
    const c = el.closest('details').querySelector('.cnt'), n = el.closest('.cg').querySelectorAll('input:checked').length;
    c.textContent = n; c.classList.toggle('z', !n);
    if (!await patch('pruefungen', k, { daten: { ...k.daten, befunde: [...bf] } })) renderForm();
    return;
  }
  let v = readVal(el);
  if (ds.t || ds.s) {
    const f = ds.t || ds.s;
    if (ds.t === 'name' && !v) v = t.kennung;            // leere Bezeichnung: ID als Name
    if (v === undefined) { toast('Ungültiger Wert', true); renderDetail(); return; }
    const p = ds.t ? { [f]: v } : { stamm: { ...t.stamm, [f]: v } };
    if (await patch('objekte', t, p)) {
      if (ds.t === 'name') el.value = t.name;
      putObj(t); renderHead(); renderMarkers();
      if (ds.t === 'kunde') refreshKunden();
    } else el.value = (ds.t ? t[f] : t.stamm?.[f]) ?? '';
  } else if ((ds.k || ds.d) && k) {
    const f = ds.k || ds.d;
    if (v === undefined) { toast(f === 'datum' ? 'Bitte ein Datum angeben' : 'Ungültiger Wert', true); renderForm(); return; }
    const p = ds.k ? { [f]: v } : { daten: { ...k.daten, [f]: v } };
    if (await patch('pruefungen', k, p)) {
      if (f === 'pruefer' && v) store.set('bk_pruefer', v);
      if (f === 'datum') S.kons.sort((a, b) => b.datum.localeCompare(a.datum) || b.created_at.localeCompare(a.created_at));
      renderHist();
      await syncSel();            // Datenbank-Trigger übernimmt die Werte der neuesten Prüfung ins Objekt
      if (f === 'kunde') refreshKunden();
    } else renderForm();
  }
}
const stepTimers = new WeakMap();
$('detail').addEventListener('change', e => { if (e.target.matches('[data-k],[data-d],[data-t],[data-s],[data-chk]')) commit(e.target); });
$('detail').addEventListener('click', async e => {
  const t = S.sel, b = e.target.closest('button'); if (!t) return;
  if (b?.dataset.step) {                       // ▲▼: Höhe/Krone in 10-cm-Schritten, Umfang in 1 cm
    const inp = b.closest('.num').querySelector('input'), dec = +inp.dataset.dec;
    const next = Math.max(0, Math.round(((parseFloat(inp.value) || 0) + parseFloat(b.dataset.step)) * 100) / 100);
    inp.value = next.toFixed(dec); clearTimeout(stepTimers.get(inp));
    stepTimers.set(inp, setTimeout(() => commit(inp), 450)); return;
  }
  const row = e.target.closest('[data-kid]');
  if (row) { S.kid = row.dataset.kid; renderHist(); renderForm(); return; }
  switch (b?.id) {
    case 'bBack': return showDash();
    case 'bNew': return newPruefung();
    case 'bPdfAll': return makePdf(t, S.kons, false, 'alle_Pruefungen');
    case 'bPdfLast': return makePdf(t, S.kons.slice(0, 1), false, 'letzte_Pruefung');
    case 'bPdfOne': return makePdf(t, [kCur()], false, 'Pruefung_' + (kCur().datum || ''));
    case 'bMove': return setTool('move');
    case 'bGeoAddr': return posFromAddress();
    case 'bEnt': {
      const on = !t.entfernt;
      if (on && !confirm(`${t.kennung} als entfernt markieren?\n\nDer Eintrag bleibt mit allen Prüfungen gespeichert, erscheint aber nur noch unter „Entfernt“.`)) return;
      if (await patch('objekte', t, { entfernt: on, entfernt_am: on ? isoD(today()) : null })) { putObj(t); renderDetail(); renderMarkers(); toast(on ? 'Als entfernt markiert' : 'Wieder aktiv'); }
      return;
    }
    case 'bKdel':
      if (!confirm('Diese Prüfung wirklich löschen?')) return;
      { const { error } = await sb.from('pruefungen').delete().eq('id', S.kid); if (error) return toast('Löschen fehlgeschlagen: ' + error.message, true);
        S.kons = S.kons.filter(x => x.id !== S.kid); S.kid = S.kons[0]?.id ?? null; renderHist(); renderForm(); await syncSel(); toast('Prüfung gelöscht'); }
      return;
    case 'bDel':
      if (!confirm(`${t.kennung}${t.name !== t.kennung ? ' (' + t.name + ')' : ''} mit allen Prüfungen endgültig löschen?\n\nTipp: Nicht mehr vorhandene Objekte lieber „Als entfernt markieren“, dann bleibt die Dokumentation erhalten.`)) return;
      { const { error } = await sb.from('objekte').delete().eq('id', t.id); if (error) return toast('Löschen fehlgeschlagen: ' + error.message, true);
        S.objs = S.objs.filter(x => x.id !== t.id); refreshKunden(); showDash(); toast('Gelöscht'); }
  }
});
async function newPruefung() {
  const t = S.sel, last = S.kons[0], Ty = T(t);
  const row = { objekt_id: t.id, datum: isoD(today()) };
  if (last) {            // alle bestehenden Werte der letzten Prüfung übernehmen
    ['kunde', 'pruefer', 'sicherheit', 'handlungsbedarf', 'massnahmen', 'anmerkungen', 'erledigung_sofort', 'erledigung_wochen'].forEach(f => row[f] = last[f]);
    row.daten = JSON.parse(JSON.stringify(last.daten || {}));
    if (row.daten.intervall == null || row.daten.intervall === '') row.daten.intervall = 1;
    row.pruefer = meName() || last.pruefer;
  } else {
    row.daten = { ...Ty.defaultDaten(), ...JSON.parse(JSON.stringify(t.aktuell || {})) };
    row.pruefer = meName(); row.kunde = t.kunde;
  }
  const { data, error } = await sb.from('pruefungen').insert(row).select().single();
  if (error) return toast('Anlegen fehlgeschlagen: ' + error.message, true);
  S.kons = await loadKons(t.id); S.kid = data.id; await syncSel(); renderHist(); renderForm();
  $('kform').scrollIntoView({ behavior: 'smooth', block: 'start' });
  toast(last ? 'Neue Prüfung angelegt, Daten der letzten übernommen' : 'Erste Prüfung angelegt');
}

// ===== Position: neu setzen (Karte) oder aus Adresse =====
function setTool(tool) {
  S.tool = tool; $('map').style.cursor = tool ? 'crosshair' : ''; $('pick').hidden = !tool;
  if (tool) {
    setMapVisible(true);
    $('pickTxt').textContent = tool === 'add' ? 'Position des neuen Objekts auf der Karte antippen' : `Neue Position für ${S.sel?.kennung} antippen`;
    if (mobile()) $('mapwrap').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}
$('pickX').onclick = () => { const was = S.tool; setTool(null); if (was === 'add' && S.draft) { S.draft = null; $('dlg').showModal(); } };
async function mapClick(ll) {
  if (S.tool === 'add' && S.draft) { const f = S.draft; S.draft = null; setTool(null); insertObject(f, [ll.lat, ll.lng], 'karte'); }
  else if (S.tool === 'move' && S.sel) {
    setTool(null);
    if (await patch('objekte', S.sel, { lat: ll.lat, lng: ll.lng, pos_quelle: 'karte' })) { putObj(S.sel); renderMarkers(); renderPos(); renderFacts(); toast('Position gespeichert'); }
  }
}
async function posFromAddress() {
  const t = S.sel, q = [t.strasse, t.hausnummer, t.plz, t.stadt].filter(Boolean).join(' ');
  if (!q) return toast('Bitte zuerst eine Adresse eintragen', true);
  const g = await geocode(q); if (!g) return toast('Adresse nicht gefunden', true);
  if (await patch('objekte', t, { lat: g.ll[0], lng: g.ll[1], pos_quelle: 'adresse' })) { renderMarkers(); renderPos(); renderFacts(); if (!noMap()) map.setView(g.ll, 18); toast('Position aus Adresse gesetzt'); }
}

// ===== Neues Objekt =====
function openNew() {
  const Ty = TYPES[S.typ];
  ['n_name', 'n_kunde', 'n_art', 'n_str', 'n_nr', 'n_plz', 'n_ort', 'n_h'].forEach(i => $(i).value = '');
  if (S.kunde && S.kunde !== OHNE) $('n_kunde').value = S.kunde;          // Kundenfilter aktiv: Kunde vorbelegen
  $('n_first').checked = true; document.querySelector('input[name=npos][value=adresse]').checked = true; $('nSave').textContent = 'Speichern';
  $('dTitleNew').textContent = 'Neuer ' + Ty.label; $('n_artl').firstChild.textContent = Ty.artLabel; $('n_hw').hidden = S.typ !== 'baum';
  $('dlg').showModal(); $('n_name').focus();
}
$('bAdd').onclick = () => openNew();
$('dlg').addEventListener('change', e => { if (e.target.name === 'npos') $('nSave').textContent = e.target.value === 'karte' ? 'Weiter zur Karte' : 'Speichern'; });
$('dlg').addEventListener('click', e => {
  const b = e.target.closest('[data-nstep]'); if (!b) return;
  const i = $('n_h'); i.value = Math.max(0, Math.round(((parseFloat(i.value) || 0) + parseFloat(b.dataset.nstep)) * 10) / 10).toFixed(1);
});
$('nCancel').onclick = () => $('dlg').close();
const readDlg = () => { const v = i => $(i).value.trim() || null, h = parseFloat($('n_h').value); return { name: v('n_name'), kunde: v('n_kunde'), art: v('n_art'), strasse: v('n_str'), hausnummer: v('n_nr'), plz: v('n_plz'), stadt: v('n_ort'), hoehe: isNaN(h) ? null : h, first: $('n_first').checked }; };
const posGps = () => new Promise((ok, no) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => ok([p.coords.latitude, p.coords.longitude]), no, { enableHighAccuracy: true, timeout: 15000 }) : no());
$('nSave').onclick = async () => {
  const f = readDlg(), mode = document.querySelector('input[name=npos]:checked').value, btn = $('nSave');
  if (mode === 'karte') { S.draft = f; $('dlg').close(); setTool('add'); return; }
  btn.disabled = true;
  try {
    let ll;
    if (mode === 'adresse') {
      const q = [f.strasse, f.hausnummer, f.plz, f.stadt].filter(Boolean).join(' ');
      if (!f.strasse && !f.stadt && !f.plz) return toast('Bitte eine Adresse eingeben oder „Auf Karte setzen“ wählen', true);
      const g = await geocode(q); if (!g) return toast('Adresse nicht gefunden. Bitte prüfen oder „Auf Karte setzen“ wählen', true);
      ll = g.ll;
    } else { try { ll = await posGps(); } catch (e) { return toast('Standort nicht verfügbar', true); } }
    await insertObject(f, ll, mode);
  } finally { btn.disabled = false; }
};
async function insertObject(f, ll, src) {
  const Ty = TYPES[S.typ];
  if (src !== 'adresse' && !f.strasse && !f.plz && !f.stadt) {       // Adresse zur Position ergänzen
    try {
      const a = (await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&accept-language=de&lat=${ll[0]}&lon=${ll[1]}`)).json()).address || {};
      f.strasse = a.road || null; f.hausnummer = a.house_number || null; f.plz = a.postcode || null; f.stadt = a.city || a.town || a.village || null;
    } catch (e) { /* Adresse bleibt leer */ }
  }
  const { data, error } = await sb.from('objekte').insert({ typ: S.typ, name: f.name, kunde: f.kunde, art: f.art, strasse: f.strasse, hausnummer: f.hausnummer, plz: f.plz, stadt: f.stadt, lat: ll[0], lng: ll[1], pos_quelle: src }).select().single();
  if (error) return toast('Anlegen fehlgeschlagen: ' + error.message, true);
  if (f.first) {
    const daten = { ...Ty.defaultDaten(), ...(f.hoehe != null ? { hoehe: f.hoehe } : {}) };
    const { error: e2 } = await sb.from('pruefungen').insert({ objekt_id: data.id, datum: isoD(today()), kunde: f.kunde, pruefer: meName(), daten });
    if (e2) toast('Angelegt, aber erste Prüfung fehlgeschlagen: ' + e2.message, true);
  }
  const { data: fresh } = await sb.from('objekte').select('*').eq('id', data.id).single();
  S.objs.push(fresh || data); S.objs.sort((a, b) => a.kennung.localeCompare(b.kennung, 'de', { numeric: true })); refreshKunden();
  if ($('dlg').open) $('dlg').close();
  await select(data.id); toast(`${(fresh || data).kennung} angelegt`);
}

// ===== Menü: CSV (alle Objekte des Typs, auch entfernte) =====
$('menu').addEventListener('click', e => { if (e.target.closest('button')) $('menu').open = false; });
$('bCsv').onclick = () => {
  const Ty = TYPES[S.typ], cols = ['kennung', 'name', 'kunde', 'art', 'strasse', 'hausnummer', 'plz', 'stadt', 'lat', 'lng', 'sicherheit', 'handlungsbedarf', 'massnahmen', 'anmerkungen', 'pruefer', 'letzte_pruefung', 'faellig_am', 'entfernt', 'entfernt_am'];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const val = (o, c) => c === 'faellig_am' ? (status(o).due ? isoD(status(o).due) : '') : c === 'entfernt' ? (o.entfernt ? 'ja' : '') : o[c];
  const list = sorted(S.objs.filter(o => o.typ === S.typ));
  const lines = [cols.concat(Ty.csv).join(';')].concat(list.map(o => cols.map(c => q(val(o, c))).concat(Ty.csv.map(c => q(o.aktuell?.[c]))).join(';')));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `${Ty.plural}_${isoD(today())}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

boot();

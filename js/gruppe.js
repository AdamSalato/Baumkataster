// ===== Objekttyp „Gruppe“: fasst Bäume zusammen (Wald, Park, Allee …) =====
// Eine Gruppe ist ein Eintrag in der Tabelle „objekte“ (ID G-001 …). Sie hat keine Prüfungen; Kunde, Verkehrssicherheit,
// Maßnahmen und Anmerkungen stehen direkt an der Gruppe. Ein Baum gehört über „gruppe_id“ zu höchstens einer Gruppe.

// Auswahlliste für das Feld Art. Einfach ergänzen oder kürzen.
const GRUPPEN_ARTEN = ['Wald', 'Park', 'Allee', 'Baumreihe', 'Baumgruppe', 'Straßenbegleitgrün', 'Friedhof', 'Spielplatz', 'Schul- / Kitagelände', 'Sportanlage', 'Wohnanlage', 'Privatgarten', 'Gewerbegrundstück', 'Sonstige'];

TYPES.gruppe = {
  label: 'Gruppe', plural: 'Gruppen', neu: 'Neue Gruppe', artLabel: 'Art', months: 12, nurGruppe: true,
  keyLabel: 'Bäume', keyValue: () => null, keyFmt: () => '–',
  defaultDaten: () => ({}), flags: () => [], badges: () => '', isFlagged: () => false, csv: [], listTitle: 'Gruppenliste', listCols: []
};

const istGruppe = o => !!o && o.typ === 'gruppe';
const objById = id => id ? S.objs.find(x => x.id === id) : null;
const gruppeVon = t => istGruppe(t) ? null : objById(t.gruppe_id);
const mitglieder = g => S.objs.filter(o => o.gruppe_id === g.id && !istGruppe(o));
const gruppen = () => S.objs.filter(o => istGruppe(o) && !o.entfernt);
const gLabel = g => g.name && g.name !== g.kennung ? `${g.kennung} · ${g.name}` : g.kennung;
const nBaeume = n => `${n} ${n === 1 ? 'Baum' : 'Bäume'}`;
const artSelect = (v, attr) => `<select ${attr}><option value="">– bitte wählen –</option>${[...new Set(GRUPPEN_ARTEN.concat(v ? [v] : []))].map(a => `<option ${a === v ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>`;
$('n_gart').innerHTML = artSelect('', '').replace(/^<select >|<\/select>$/g, '');

// Vorschlagsliste „bestehende Gruppen“ für das Gruppenfeld in der Baumansicht
function refreshGruppen() { $('gruppenDL').innerHTML = gruppen().map(g => `<option value="${esc(gLabel(g))}">`).join(''); }

// ----- Baumansicht: Gruppenfeld -----
function gruppeFeld(t) {
  const g = gruppeVon(t);
  if (g) return `<div class="grow"><span class="lb">Gruppe</span><button class="btn sec" id="bGrp">${esc(gLabel(g))} ›</button><button class="btn sec sm" id="bGrpX" aria-label="Aus der Gruppe entfernen" title="Aus der Gruppe entfernen">✕</button></div>`;
  if (!gruppen().length) return '';
  return `<div class="kbar"><label>Gruppe<input id="grpIn" type="text" list="gruppenDL" autocomplete="off" placeholder="Bestehende Gruppe suchen und zuweisen"></label></div>`;
}
// Text aus dem Gruppenfeld einer bestehenden Gruppe zuordnen: genaue Bezeichnung, ID oder eindeutiger Treffer
function findeGruppe(txt) {
  const q = txt.trim().toLowerCase(), all = gruppen(); if (!q) return null;
  return all.find(g => gLabel(g).toLowerCase() === q || g.kennung.toLowerCase() === q || g.name.toLowerCase() === q) || (l => l.length === 1 ? l[0] : null)(all.filter(g => gLabel(g).toLowerCase().includes(q)));
}
async function setGruppe(t, g) {
  if (await patch('objekte', t, { gruppe_id: g ? g.id : null })) { putObj(t); renderFacts(); renderMarkers(); toast(g ? `Zu ${g.kennung} hinzugefügt` : 'Aus der Gruppe entfernt'); }
}

// ----- Gruppenansicht -----
function renderGruppe() {
  const g = S.sel;
  $('detail').innerHTML = `
  <div class="dhead"><button class="btn sec" id="bBack">← Dashboard</button><div><h2 id="dTitle"></h2><small id="dAddr"></small></div></div>
  <div id="facts"></div>
  <section class="card"><h3 id="gCount"></h3><div id="gList"></div></section>
  <section class="card"><h3>Angaben zur Gruppe</h3><div id="gForm"></div>
    <p style="margin:8px 0 0"><small id="posInfo"></small></p>
    <div class="foot"><button class="btn sec" id="bMove">Position auf Karte neu setzen</button><button class="btn sec" id="bGeoAddr">Position aus Adresse ermitteln</button>
      <button class="btn sec" id="bEnt">${g.entfernt ? 'Wieder als aktiv führen' : 'Als entfernt markieren'}</button><button class="btn dan" id="bDel">Gruppe löschen</button></div>
    <span class="hint">Beim Löschen der Gruppe bleiben die Bäume erhalten, sie gehören dann nur zu keiner Gruppe mehr.</span>
  </section>`;
  renderHead(); renderGFacts(); renderGList(); renderGForm(); renderPos();
}
function renderGFacts() {
  const g = S.sel, m = mitglieder(g).filter(o => !o.entfernt), offen = massOffen(g), fl = [];
  if (g.entfernt) fl.push(['off', status(g).label]);
  if (offen) fl.push([dring(g.dringlichkeit).c, 'Maßnahme offen: ' + dring(g.dringlichkeit).l]);
  else if (hatMass(g)) fl.push(['grn', `Maßnahme erledigt am ${fmtD(g.erledigt_am)}${g.erledigt_von ? ' (' + g.erledigt_von + ')' : ''}`]);
  const n = f => m.filter(f).length, add = (c, k, txt) => { if (k) fl.push([c, `${nBaeume(k)} ${txt}`]); };
  add('red', n(o => status(o).k === 'red'), 'überfällig'); add('yel', n(faelligBald), 'in ≤ 3 Monaten fällig');
  add('red', n(o => o.sicherheit === 'unsicher' && !!o.letzte_pruefung), 'nicht verkehrssicher'); add('org', n(massOffen), 'mit offener Maßnahme');
  $('facts').innerHTML = `<div class="tiles">
    <div class="tile"><span class="lb">Bäume in der Gruppe</span><b class="big">${m.length}</b></div>
    <div class="tile ${g.entfernt ? '' : sich(g.sicherheit).c}"><span class="lb">Verkehrssicherheit</span><b class="big txt">${sich(g.sicherheit).l}</b></div>
    <div class="tile ${offen ? dring(g.dringlichkeit).c : ''}"><span class="lb">Maßnahme</span><b class="big txt">${hatMass(g) ? (offen ? dring(g.dringlichkeit).k : 'Erledigt') : 'Keine'}</b></div></div>
  <div class="flags">${fl.map(([c, x]) => `<span class="chip ${c}">${esc(x)}</span>`).join('')}</div>
  <div class="acts"><button class="btn pri big" id="bGAdd">+ Bäume hinzufügen</button><button class="btn sec" id="bGPdf">PDF-Liste der Gruppe</button></div>`;
}
function renderGList() {
  const g = S.sel, m = sorted(mitglieder(g));
  $('gCount').textContent = `Bäume in dieser Gruppe (${m.length})`;
  $('gList').innerHTML = m.length ? m.map(o => {
    const st = status(o);
    return `<div class="mrow${o.entfernt ? ' off' : ''}" data-mid="${o.id}" role="button" tabindex="0"><span class="idc">${esc(o.kennung)}</span><span><b>${o.name !== o.kennung ? esc(o.name) : ''}</b> <span class="mute">${esc([o.art, addr(o)].filter(Boolean).join(' · '))}</span></span>
      <span class="chip ${st.k}" title="${esc(st.label)}">${o.entfernt ? 'Entfernt' : fmtD(o.letzte_pruefung)}</span>${o.letzte_pruefung ? `<span class="chip ${sich(o.sicherheit).c}">${sich(o.sicherheit).k}</span>` : '<span></span>'}
      <button class="x" data-mx="${o.id}" aria-label="${esc(o.kennung)} aus der Gruppe entfernen" title="Aus der Gruppe entfernen">✕</button></div>`;
  }).join('') : '<div class="empty">Noch keine Bäume in dieser Gruppe.<br>Mit „+ Bäume hinzufügen“ mehrere auf einmal auswählen.</div>';
}
function renderGForm() {
  const g = S.sel;
  $('gForm').innerHTML = `<div class="g2">
      <label>ID<input type="text" value="${esc(g.kennung)}" readonly></label>${field('Name / Bezeichnung', 't', 'name', g.name)}
      <label>Art${artSelect(g.art, A('t', 'art'))}</label>${field('Kunde', 't', 'kunde', g.kunde, 'text', 'list="kunden" autocomplete="off" placeholder="Tippen oder auswählen"')}
    </div>
    <h4>Verkehrssicherheit</h4>${segC('t', 'sicherheit', g.sicherheit, Object.entries(SICH).map(([v, d]) => [v, d.l, d.c]))}
    ${massForm(g, 't')}
    ${area('Maßnahmen Beschreibung', 't', 'massnahmen', g.massnahmen)}
    ${area('Anmerkungen', 't', 'anmerkungen', g.anmerkungen)}
    <h4>Lage</h4><div class="g2">${field('Straße', 't', 'strasse', g.strasse)}${field('Hausnr.', 't', 'hausnummer', g.hausnummer)}${field('PLZ', 't', 'plz', g.plz)}${field('Stadt', 't', 'stadt', g.stadt)}</div>`;
}

// ----- Dialog: mehrere Bäume auf einmal hinzufügen -----
const GA = { sel: new Set(), q: '' };
const gaKandidaten = () => { const g = S.sel, q = GA.q.toLowerCase().trim(); return S.objs.filter(o => !istGruppe(o) && !o.entfernt && o.gruppe_id !== g.id && (!q || suchText(o).includes(q))); };
function gaRender() {
  const l = sorted(gaKandidaten()).sort((a, b) => a.kennung.localeCompare(b.kennung, 'de', { numeric: true }));
  $('gaList').innerHTML = l.length ? l.map(o => { const og = gruppeVon(o); return `<label class="ck"><input type="checkbox" value="${o.id}" ${GA.sel.has(o.id) ? 'checked' : ''}><span><b>${esc(o.kennung)}</b>${o.name !== o.kennung ? ' ' + esc(o.name) : ''} <span class="mute">${esc([o.art, addr(o), o.kunde].filter(Boolean).join(' · '))}</span>${og ? `<span class="badge blu">bisher in ${esc(og.kennung)}</span>` : ''}</span></label>`; }).join('') : '<div class="empty">Keine passenden Bäume.</div>';
  $('gaInfo').textContent = `${l.length} angezeigt · ${GA.sel.size} ausgewählt`;
  $('gaSave').textContent = GA.sel.size ? `${nBaeume(GA.sel.size)} hinzufügen` : 'Hinzufügen'; $('gaSave').disabled = !GA.sel.size;
}
function openGAdd() {
  GA.sel = new Set(); GA.q = S.q || ''; $('gaQ').value = GA.q;            // Suche aus dem Dashboard übernehmen
  $('gaTitle').textContent = `Bäume zu ${S.sel.kennung} hinzufügen`;
  gaRender(); $('dlgG').showModal(); $('gaQ').focus();
}
$('gaQ').oninput = e => { GA.q = e.target.value; gaRender(); };
$('gaList').onchange = e => { if (e.target.type === 'checkbox') { e.target.checked ? GA.sel.add(e.target.value) : GA.sel.delete(e.target.value); gaRender(); } };
$('gaAll').onclick = () => { gaKandidaten().forEach(o => GA.sel.add(o.id)); gaRender(); };
$('gaNone').onclick = () => { GA.sel.clear(); gaRender(); };
$('gaCancel').onclick = () => $('dlgG').close();
$('gaSave').onclick = async () => {
  const g = S.sel, ids = [...GA.sel]; if (!ids.length) return;
  $('gaSave').disabled = true;
  const { error } = await sb.from('objekte').update({ gruppe_id: g.id }).in('id', ids);
  if (error) { toast('Hinzufügen fehlgeschlagen: ' + error.message, true); gaRender(); return; }
  S.objs.forEach(o => { if (GA.sel.has(o.id)) o.gruppe_id = g.id; });
  $('dlgG').close(); renderGFacts(); renderGList(); renderMarkers(); toast(`${nBaeume(ids.length)} hinzugefügt`);
};

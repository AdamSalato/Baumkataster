// ===== PDF: Protokoll eines Objekts und Liste (Tabelle) aus dem Dashboard =====

// Logo für PDFs (config.js: PDF_LOGO, nur PNG/JPG). Wird einmal geladen; ohne Logo steht der Firmenname oben rechts.
let pdfLogo = null;
(async () => {
  const src = CONFIG.PDF_LOGO; if (!src || !/\.(png|jpe?g)$/i.test(src)) return;
  try {
    const blob = await (await fetch(src)).blob();
    const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob); });
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = data; });
    pdfLogo = { data, fmt: /\.png$/i.test(src) ? 'PNG' : 'JPEG', ratio: img.width / img.height };
  } catch (e) { /* ohne Logo weiter */ }
})();
// Kopf oben rechts: Logo oder Firmenname. xr = rechter Rand, yt = Oberkante
function pdfKopf(doc, xr, yt) {
  if (pdfLogo) { const h = 11, w = Math.min(45, h * pdfLogo.ratio); try { doc.addImage(pdfLogo.data, pdfLogo.fmt, xr - w, yt, w, h); return; } catch (e) { } }
  if (CONFIG.FIRMA) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...rgb('--brand')); doc.text(CONFIG.FIRMA, xr, yt + 5, { align: 'right' }); doc.setTextColor(0); }
}

// ----- Protokoll eines Objekts (ks = Prüfungen, blank = leeres Formular) -----
function makePdf(o, ks, blank, suffix) {
  const Ty = T(o), doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4' }), X = 15, W = 180, LW = 58; let y = 16;
  const need = h => { if (y + h > 278) { doc.addPage(); y = 16; } };
  const H = s => { need(18); doc.setFillColor(...BR); doc.rect(X, y, W, 7, 'F'); doc.setTextColor(...BI); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(s, X + 2.5, y + 4.9); doc.setTextColor(0); y += 9.5; };
  const box = (x, yy, on) => { doc.setDrawColor(60); doc.setLineWidth(.25); doc.rect(x, yy, 3.2, 3.2); if (on) { doc.setLineWidth(.55); doc.line(x + .5, yy + .5, x + 2.7, yy + 2.7); doc.line(x + 2.7, yy + .5, x + .5, yy + 2.7); } doc.setLineWidth(.2); };
  const frame = h => { doc.setDrawColor(190); doc.setFillColor(243, 246, 244); doc.rect(X, y, LW, h, 'FD'); doc.rect(X + LW, y, W - LW, h, 'S'); doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(0); };
  const P = {
    blank, H, need, box,
    gap: n => { y += n; },
    row(l, v) {
      if (v && typeof v === 'object') {
        need(7.5); frame(7.5); doc.text(l, X + 2, y + 4.8); doc.setFont('helvetica', 'normal');
        let x = X + LW + 3; v.o.forEach(([txt, on]) => { box(x, y + 2.1, on); doc.text(txt, x + 4.8, y + 4.9); x += 4.8 + doc.getTextWidth(txt) + 6; }); y += 7.5; return;
      }
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      const ln = doc.splitTextToSize(String(v == null || v === '' ? ' ' : v), W - LW - 5), h = Math.max(7.5, ln.length * 4.2 + 3.4);
      need(h); frame(h); doc.text(l, X + 2, y + 4.8); doc.setFont('helvetica', 'normal'); doc.text(ln, X + LW + 2.5, y + 4.8); y += h;
    },
    opts: (vals, cur) => ({ o: vals.map(v => [v, !blank && cur === v]) }),
    yn: b => ({ o: [['Ja', !blank && !!b], ['Nein', !blank && !b]] }),
    m: (v, d, u) => blank || v == null ? '' : fmtN(v, d) + ' ' + u,
    checklist(groups, bef) {
      groups.forEach(([h, l]) => {
        need(16); doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(9); doc.text(h, X, y + 3); y += 5.5; doc.setFont('helvetica', 'normal');
        for (let i = 0; i < l.length; i += 2) { need(5.5); [0, 1].forEach(j => { const x = l[i + j]; if (x) { box(X + j * 90, y + .6, bef.includes(x.split(' ')[0])); doc.text(x, X + j * 90 + 5, y + 3.2); } }); y += 5; }
        y += 2.5;
      });
    },
    sign() { need(24); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('Datum, Unterschrift:', X, y + 16); doc.setDrawColor(60); doc.line(X + 36, y + 16, X + W, y + 16); }
  };
  const st = blank ? null : status(o), title = `${Ty.label}protokoll`, BR = rgb('--brand'), BI = rgb('--brand-ink');
  pdfKopf(doc, X + W, 12);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(blank ? title + ' (Blanko)' : `${title}: ${o.kennung}${o.name !== o.kennung ? ' – ' + o.name : ''}`, X, y + 5); y += 9;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
  doc.text(blank ? 'Datum: ____________________' : `${addr(o) || 'ohne Adresse'}   |   erstellt am ${new Date().toLocaleDateString('de-DE')}`, X, y + 2); doc.setTextColor(0); y += 8;

  H('Stammdaten');
  P.row('ID:', blank ? '' : o.kennung); P.row('Name / Bezeichnung:', blank ? '' : o.name); P.row('Kunde:', blank ? '' : o.kunde); P.row(Ty.artLabel + ':', blank ? '' : o.art);
  P.row('Straße / Nr.:', blank ? '' : [o.strasse, o.hausnummer].filter(Boolean).join(' ')); P.row('PLZ / Stadt:', blank ? '' : [o.plz, o.stadt].filter(Boolean).join(' '));
  P.row('Position (Lat, Lng):', blank ? '' : `${o.lat.toFixed(6)}, ${o.lng.toFixed(6)}${o.pos_quelle === 'adresse' ? ' (ungefähr)' : ''}`);
  Ty.pdf.stamm(o, P);
  if (!blank) {
    y += 3; H('Aktueller Stand');
    P.row('Letzte Prüfung:', fmtD(o.letzte_pruefung)); if (o.entfernt) P.row('Status:', st.label); else P.row('Nächste Prüfung bis:', st.due ? st.due.toLocaleDateString('de-DE') : 'sofort (noch nie geprüft)');
    P.row('Prüfer:', o.pruefer); P.row('Sicherheitsrisiko:', P.opts(['gering', 'mittel', 'hoch'], o.letzte_pruefung ? o.sicherheit : null));
    Ty.pdf.aktuell(o, P);
  }
  if (blank) ks = [{ datum: null, daten: { befunde: [] } }];
  else if (!ks.length) { y += 3; P.row('Prüfungen:', 'Noch keine Prüfung erfasst.'); }

  ks.forEach(k => {
    doc.addPage(); y = 16;
    H('Prüfprotokoll vom ' + (k.datum ? fmtD(k.datum) : '____________________'));
    Ty.pdf.pruef(k, P);
  });

  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) { doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110); doc.text(`${CONFIG.FIRMA ? CONFIG.FIRMA + '  |  ' : ''}${blank ? title + ' (Blanko)' : o.kennung + (o.name !== o.kennung ? ' ' + o.name : '')}  |  Seite ${p}/${n}`, X, 289); doc.setTextColor(0); }
  doc.save((blank ? title + '_Blanko' : o.kennung + '_' + suffix).replace(/[^\wäöüÄÖÜß-]+/g, '_') + '.pdf');
}
$('bBlank').onclick = () => makePdf({ typ: S.typ }, [], true);

// ----- Liste als Tabelle (Querformat) -----
// Spalte: [Schlüssel, Überschrift, Breite (Gewicht), Wert, in der Standardauswahl?, Farbe (optional)]
function listColumns(Ty) {
  return [
    ['name', 'Name', 2.2, o => o.name !== o.kennung ? o.name : '', true],
    ['kunde', 'Kunde', 2, o => o.kunde || '', true],
    ['art', Ty.artLabel, 2.4, o => o.art || '', true],
    ['adresse', 'Adresse', 2.8, o => addr(o), true],
    ['letzte', 'Letzte Prüfung', 1.4, o => fmtD(o.letzte_pruefung), true, o => status(o).k === 'red' ? '--red' : null],
    ['faellig', 'Nächste Prüfung', 1.4, o => { const s = status(o); return o.entfernt ? '–' : s.due ? s.due.toLocaleDateString('de-DE') : 'sofort'; }, false, o => status(o).k === 'red' ? '--red' : null],
    ['pruefer', 'Prüfer', 1.6, o => o.pruefer || '', false],
    ['risiko', 'Sicherheitsrisiko', 1.3, o => o.letzte_pruefung ? cap(o.sicherheit) : '', true, o => o.letzte_pruefung && o.sicherheit === 'hoch' ? '--red' : null],
    ...Ty.listCols,
    ['handlung', 'Handlungsbedarf', 1.3, o => o.letzte_pruefung ? cap(o.handlungsbedarf) : '', true],
    ['massnahmen', 'Maßnahmen', 3.4, o => o.massnahmen || '', true],
    ['anmerkungen', 'Anmerkungen', 3, o => o.anmerkungen || '', false],
    ['status', 'Status', 1.4, o => o.entfernt ? status(o).label : 'Aktiv', false]
  ];
}
function listPdf(list, cols, info) {
  const Ty = TYPES[S.typ], doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const X = 12, W = 273, BOT = 196, BR = rgb('--brand'), BI = rgb('--brand-ink'), PADX = 1.6;
  const all = [['id', 'ID', 0, o => o.kennung], ...cols];
  // Spaltenbreiten: Mindestbreite = längstes Wort (Überschrift und Inhalt, damit z. B. ein Datum nicht umbricht), Rest nach Gewicht.
  // Passen die Spalten nicht auf die Seite, wird die Schrift schrittweise kleiner.
  const cells = list.map(o => all.map(c => String(c[3](o) ?? '')));
  const longest = (t, bold) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); return Math.max(0, ...t.split(/[\s]+/).map(x => doc.getTextWidth(x))); };
  let fs = 8.4, min;
  for (; ; fs -= 0.4) {
    doc.setFontSize(fs);
    min = all.map((c, i) => Math.max(longest(c[1], true), Math.min(30, Math.max(0, ...cells.map(r => longest(r[i], i === 0))))) + 2 * PADX + 0.8);
    if (min.reduce((a, b) => a + b, 0) <= W * 0.92 || fs <= 5.6) break;
  }
  const lh = fs * 0.44, msum = min.reduce((a, b) => a + b, 0);
  if (msum > W) min = min.map(m => m * W / msum);
  const rest = Math.max(0, W - min.reduce((a, b) => a + b, 0)), wsum = all.reduce((a, c) => a + c[2], 0);
  const w = all.map((c, i) => min[i] + (wsum ? rest * c[2] / wsum : rest / all.length)), xs = []; w.reduce((x, v, i) => (xs[i] = x, x + v), X);
  let y = 12;
  const head = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(fs);
    const ln = all.map((c, i) => doc.splitTextToSize(c[1], w[i] - 2 * PADX)), h = Math.max(...ln.map(l => l.length)) * lh + 3.2;
    doc.setFillColor(...BR); doc.rect(X, y, W, h, 'F'); doc.setTextColor(...BI);
    ln.forEach((l, i) => doc.text(l, xs[i] + PADX, y + 2.2 + lh * 0.72));
    doc.setTextColor(0); y += h;
  };
  // Titel
  pdfKopf(doc, X + W, 8);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(0); doc.text(Ty.listTitle, X, y + 4.5); y += 9;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
  const sub = doc.splitTextToSize(`${info}   |   ${list.length} ${list.length === 1 ? Ty.label : Ty.plural}   |   Stand ${new Date().toLocaleDateString('de-DE')}`, W);
  doc.text(sub, X, y + 1.5); doc.setTextColor(0); y += sub.length * 4 + 3;
  head();
  list.forEach((o, r) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(fs);
    const ln = all.map((c, i) => doc.splitTextToSize(cells[r][i], w[i] - 2 * PADX)), h = Math.max(1, ...ln.map(l => l.length)) * lh + 2.6;
    if (y + h > BOT) { doc.addPage(); y = 12; head(); doc.setFont('helvetica', 'normal'); doc.setFontSize(fs); }
    if (o.entfernt) { doc.setFillColor(...rgb('--off-bg')); doc.rect(X, y, W, h, 'F'); }
    else if (r % 2) { doc.setFillColor(246, 248, 246); doc.rect(X, y, W, h, 'F'); }
    ln.forEach((l, i) => {
      const col = all[i][5] && all[i][5](o);
      doc.setFont('helvetica', i === 0 || col ? 'bold' : 'normal'); doc.setTextColor(...(col ? rgb(col) : o.entfernt ? [95, 104, 98] : [0, 0, 0]));
      doc.text(l, xs[i] + PADX, y + 1.9 + lh * 0.72);
    });
    doc.setDrawColor(215); doc.setLineWidth(.15); doc.line(X, y + h, X + W, y + h);
    y += h;
  });
  if (!list.length) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90); doc.text('Keine Einträge in dieser Auswahl.', X, y + 6); }
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) { doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110); doc.text(`${CONFIG.FIRMA ? CONFIG.FIRMA + '  |  ' : ''}${Ty.listTitle}  |  Seite ${p}/${n}`, X, 203); doc.setTextColor(0); }
  doc.save(`${Ty.listTitle}${S.kunde ? '_' + S.kunde : ''}_${isoD(today())}`.replace(/[^\wäöüÄÖÜß-]+/g, '_') + '.pdf');
}

// ----- Dialog: Spalten wählen -----
const LIST_KEY = 'bk_listcols';
function openList() {
  const Ty = TYPES[S.typ], cols = listColumns(Ty), list = currentList();
  let saved = null; try { saved = JSON.parse(store.get(LIST_KEY + '_' + S.typ)); } catch (e) { }
  const on = c => Array.isArray(saved) ? saved.includes(c[0]) : c[4];
  $('lInfo').innerHTML = `<b>${list.length} ${list.length === 1 ? Ty.label : Ty.plural}</b> <span class="mute">· ${esc(filterText())}</span>`;
  $('lCols').innerHTML = cols.map(c => `<label class="ck"><input type="checkbox" value="${c[0]}" ${on(c) ? 'checked' : ''}>${esc(c[1])}</label>`).join('');
  $('dlgL').showModal();
}
$('bList').onclick = openList;
$('lCancel').onclick = () => $('dlgL').close();
const lSet = f => { const cols = listColumns(TYPES[S.typ]); $('lCols').querySelectorAll('input').forEach(i => { i.checked = f(cols.find(c => c[0] === i.value)); }); };
$('lAll').onclick = () => lSet(() => true); $('lNone').onclick = () => lSet(() => false); $('lStd').onclick = () => lSet(c => c[4]);
$('lSave').onclick = () => {
  const keys = [...$('lCols').querySelectorAll('input:checked')].map(i => i.value);
  store.set(LIST_KEY + '_' + S.typ, JSON.stringify(keys));
  listPdf(currentList(), listColumns(TYPES[S.typ]).filter(c => keys.includes(c[0])), filterText());
  $('dlgL').close();
};

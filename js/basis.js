// ===== Basis: Helfer, Formular-Bausteine, Prüfstatus. Wird von allen anderen Dateien benutzt. =====

// ----- Helfer -----
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const isoD = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtD = s => s ? parseD(s).toLocaleDateString('de-DE') : '–';
const fmtN = (n, d = 1) => n == null ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const num0 = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };
const addr = t => [[t.strasse, t.hausnummer].filter(Boolean).join(' '), [t.plz, t.stadt].filter(Boolean).join(' ')].filter(Boolean).join(', ');
const mobile = () => window.matchMedia('(max-width:900px)').matches;
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
function toast(m, err) { const s = $('st'); s.textContent = m; s.className = err ? 'show err' : 'show'; clearTimeout(toast.t); toast.t = setTimeout(() => s.className = '', err ? 6000 : 2000); }

// Farben kommen aus css/theme.css
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const mcol = k => cssVar('--' + (k === 'neu' ? 'off' : k) + '-m') || '#888';      // kräftige Farbe zu einer Ampelklasse
function rgb(n) {                                                                   // Farbe aus theme.css als [r,g,b] für PDFs
  let h = cssVar(n).replace('#', ''); if (h.length === 3) h = h.replace(/./g, c => c + c);
  return /^[0-9a-f]{6}$/i.test(h) ? [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) : [31, 77, 54];
}

// Verkehrssicherheit (Spalte „sicherheit“): l = Bezeichnung, k = Kurzform für Tabellen, c = Farbe aus theme.css, rank = Sortierung
const SICH = {
  sicher: { l: 'Verkehrssicher', k: 'Verkehrssicher', c: 'grn', rank: 0 },
  nach_massnahme: { l: 'Verkehrssicher nach Maßnahme', k: 'Nach Maßnahme', c: 'yel', rank: 1 },
  unklar: { l: 'Nicht abschließend bewertbar', k: 'Nicht bewertbar', c: 'org', rank: 2 },
  unsicher: { l: 'Nicht verkehrssicher', k: 'Nicht verkehrssicher', c: 'red', rank: 3 }
};
const sich = v => SICH[v] || SICH.sicher;
// Maßnahmen (Spalte „dringlichkeit“): tage = Frist ab dem Prüfdatum (null = ohne Frist)
const DRING = {
  keine: { l: 'Keine Maßnahme', k: 'Keine', c: 'off', tage: null },
  sofort: { l: 'Sofortmaßnahme (unverzüglich)', k: 'Sofort', c: 'red', tage: 0 },
  sehr_hoch: { l: 'Sehr hohe Dringlichkeit (2–4 Wochen)', k: 'Sehr dringend', c: 'org', tage: 28 },
  hoch: { l: 'Hohe Dringlichkeit (1–3 Monate)', k: 'Dringend', c: 'yel', tage: 92 },
  gering: { l: 'Geringe Dringlichkeit (4–6 Monate)', k: 'Gering dringend', c: 'blu', tage: 183 },
  pflege: { l: 'Pflegemaßnahme (ab 6 Monaten / ohne Frist)', k: 'Pflege', c: 'off', tage: null }
};
const dring = v => DRING[v] || DRING.keine;
const hatMass = x => !!x.dringlichkeit && x.dringlichkeit !== 'keine' && !!DRING[x.dringlichkeit];
const bewertet = t => t.typ === 'gruppe' || !!t.letzte_pruefung;                              // Verkehrssicherheit/Maßnahme vorhanden? (Baum: erst mit Prüfung)
const massOffen = t => bewertet(t) && hatMass(t) && !t.erledigt_am;                 // Objekt: Maßnahme der neuesten Prüfung noch offen?
const massBis = (datum, d) => { const tg = dring(d).tage; if (tg == null || !datum) return null; const x = parseD(datum); x.setDate(x.getDate() + tg); return x; };
// als Halbsatz: „sofort fällig“, „fällig bis 10.5.2026“, „ohne Frist“
const massFrist = (datum, d) => d === 'sofort' ? 'sofort fällig' : massBis(datum, d) ? 'fällig bis ' + massBis(datum, d).toLocaleDateString('de-DE') : 'ohne Frist';
const massBisTxt = (datum, d) => d === 'sofort' ? 'sofort' : massBis(datum, d) ? 'bis ' + massBis(datum, d).toLocaleDateString('de-DE') : 'ohne Frist';

// ----- Formular-Bausteine. Bereich (s): k = Spalte der Prüfung, d = typspezifische Prüfdaten, t = Spalte des Objekts, s = typspezifische Stammdaten -----
const A = (s, f) => `data-${s}="${f}"`;
const field = (l, s, f, v, ty = 'text', extra = '') => `<label>${l}<input type="${ty}" ${A(s, f)} value="${esc(v)}" ${extra}></label>`;
const area = (l, s, f, v) => `<label>${l}<textarea ${A(s, f)}>${esc(v)}</textarea></label>`;
const cb = (s, f, v, l, cls = '') => `<label class="ck ${cls}"><input type="checkbox" ${A(s, f)} ${v ? 'checked' : ''}>${l}</label>`;
const seg = (s, f, v, opts, cls = '') => `<div class="seg ${cls}" role="radiogroup">${opts.map(o => `<label><input type="radio" name="${s}_${f}" ${A(s, f)} value="${esc(o)}" ${v === o ? 'checked' : ''}><span>${esc(cap(o))}</span></label>`).join('')}</div>`;
// farbige Auswahl: opts = [[Wert, Bezeichnung, Farbe], …]
const segC = (s, f, v, opts) => `<div class="seg col" role="radiogroup">${opts.map(([val, l, c]) => `<label class="c-${c}"><input type="radio" name="${s}_${f}" ${A(s, f)} value="${esc(val)}" ${String(v) === String(val) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>`;
// Maßnahmen-Abschnitt einer Prüfung (für alle Objekttypen gleich)
// s = Bereich: 'k' Prüfung (mit Frist ab Prüfdatum), 't' direkt am Objekt (Gruppe)
const massForm = (k, s = 'k') => `<h4>Maßnahmen</h4>${segC(s, 'dringlichkeit', DRING[k.dringlichkeit] ? k.dringlichkeit : 'keine', Object.entries(DRING).map(([v, d]) => [v, d.l, d.c]))}`
  + (hatMass(k) ? `<div class="g2 erl">${field('Maßnahme erledigt am' + (s === 'k' ? ` <span class="unit">(${massFrist(k.datum, k.dringlichkeit)})</span>` : ''), s, 'erledigt_am', k.erledigt_am, 'date')}${field('Erledigt von', s, 'erledigt_von', k.erledigt_von)}</div>` : '');
const num = (l, s, f, v, dec, unit, step) => `<label>${l} <span class="unit">(${unit})</span><div class="num"><input type="number" inputmode="decimal" ${A(s, f)} data-dec="${dec}" step="${step}" min="0" value="${v == null ? '' : v}"><span class="ar"><button type="button" data-step="${step}" aria-label="${l} erhöhen">▲</button><button type="button" data-step="${-step}" aria-label="${l} verringern">▼</button></span></div></label>`;

// ----- Objekttypen: jede Typ-Datei (js/baum.js, später z. B. js/zaun.js) trägt sich hier ein -----
const TYPES = {};
const T = o => TYPES[o.typ] || TYPES.baum;

// ----- Prüfstatus -----
// rot = überfällig oder nie geprüft; orange = ≤ 1 Monat; gelb = ≤ 3 Monate; sonst grün; entfernt = grau.
// Frist: Intervall der letzten Prüfung (Jahre), sonst Standardintervall des Typs (Baum: 12 Monate).
function monthsOf(t) { const y = num0(t.aktuell?.intervall); return y && y > 0 && y <= 10 ? Math.round(y * 12) : T(t).months; }
function status(t) {
  if (t.entfernt) return { k: 'neu', days: 1e6, due: null, label: 'Entfernt' + (t.entfernt_am ? ' am ' + fmtD(t.entfernt_am) : '') };
  if (t.typ === 'gruppe') return { k: 'neu', days: -2e6, due: null, label: '' };            // Gruppen haben keine Prüfungen, stehen in der Liste oben
  if (!t.letzte_pruefung) return { k: 'red', days: -1e6, label: 'Noch nie geprüft', due: null };
  const l = parseD(t.letzte_pruefung), due = new Date(l.getFullYear(), l.getMonth() + monthsOf(t), l.getDate());
  const days = Math.round((due - today()) / 864e5);
  if (days < 0) return { k: 'red', days, due, label: `${-days} ${-days === 1 ? 'Tag' : 'Tage'} überfällig` };
  if (days === 0) return { k: 'org', days, due, label: 'heute fällig' };
  const txt = `fällig in ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
  if (days <= CONFIG.DRINGEND_TAGE) return { k: 'org', days, due, label: txt };
  if (days <= CONFIG.WARN_TAGE) return { k: 'yel', days, due, label: txt };
  return { k: 'grn', days, due, label: 'fällig am ' + due.toLocaleDateString('de-DE') };
}
const faelligBald = t => ['org', 'yel'].includes(status(t).k);        // fällig in ≤ 3 Monaten (einschließlich ≤ 1 Monat)

// ----- Sperre: Prüfungen sind nach 12 Stunden nur noch für Admins änderbar (die Datenbank setzt das durch) -----
const sperreAb = k => new Date(new Date(k.created_at).getTime() + CONFIG.SPERRE_STUNDEN * 36e5);
const abgelaufen = k => !!k && Date.now() > sperreAb(k).getTime();

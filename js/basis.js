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

const RISK = { gering: { c: 'grn', rank: 0 }, mittel: { c: 'yel', rank: 1 }, hoch: { c: 'red', rank: 2 } };

// ----- Formular-Bausteine. Bereich (s): k = Spalte der Prüfung, d = typspezifische Prüfdaten, t = Spalte des Objekts, s = typspezifische Stammdaten -----
const A = (s, f) => `data-${s}="${f}"`;
const field = (l, s, f, v, ty = 'text', extra = '') => `<label>${l}<input type="${ty}" ${A(s, f)} value="${esc(v)}" ${extra}></label>`;
const area = (l, s, f, v) => `<label>${l}<textarea ${A(s, f)}>${esc(v)}</textarea></label>`;
const cb = (s, f, v, l, cls = '') => `<label class="ck ${cls}"><input type="checkbox" ${A(s, f)} ${v ? 'checked' : ''}>${l}</label>`;
const seg = (s, f, v, opts, cls = '') => `<div class="seg ${cls}" role="radiogroup">${opts.map(o => `<label${cls === 'rk' ? ` class="${o}"` : ''}><input type="radio" name="${s}_${f}" ${A(s, f)} value="${esc(o)}" ${v === o ? 'checked' : ''}><span>${esc(cap(o))}</span></label>`).join('')}</div>`;
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

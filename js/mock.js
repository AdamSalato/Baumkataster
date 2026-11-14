// ===== TESTVERSION (index.html?test): lokale Datenbank im Browser statt Supabase =====
// Bildet die Datenbank-Automatik aus setup.sql nach: ID-Vergabe, Übernahme der neuesten Prüfung, 12-Stunden-Sperre, Admin-Recht.
// Anmeldung: admin / admin (Admin) oder pruefer / pruefer (normaler Benutzer).
function createMock() {
  const KEY = 'bk_test_db_v4', SESS = 'bk_test_user', listeners = [];
  const USERS = { admin: { pw: 'admin', name: 'Admin', role: 'admin' }, pruefer: { pw: 'pruefer', name: 'P. Prüfer', role: null } };
  const me = () => USERS[localStorage.getItem(SESS)] || null, isAdmin = () => !!me() && me().role === 'admin';
  const gesperrt = k => !isAdmin() && Date.now() - new Date(k.created_at).getTime() > 12 * 36e5;
  const SPERRE = 'Diese Prüfung ist gesperrt (älter als 12 Stunden). Änderungen sind nur als Admin möglich.';
  const clone = o => JSON.parse(JSON.stringify(o));
  const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(16).slice(2);
  const ld = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  let db = null, tick = 0, seeding = false;
  const stamp = () => new Date(Date.now() - (seeding ? 5e8 : 0) + (tick++)).toISOString();   // Beispieldaten sind „alt“ und damit gesperrt

  const objDef = p => ({ id: uid(), typ: null, kennung: null, name: null, kunde: null, art: null, strasse: null, hausnummer: null, plz: null, stadt: null, lat: null, lng: null, pos_quelle: 'karte', stamm: {}, aktuell: {}, sicherheit: 'gering', handlungsbedarf: 'nein', pruefer: null, letzte_pruefung: null, massnahmen: null, anmerkungen: null, entfernt: false, entfernt_am: null, created_at: stamp(), ...p });
  const prDef = p => ({ id: uid(), objekt_id: null, datum: ld(0), pruefer: null, sicherheit: 'gering', handlungsbedarf: 'nein', massnahmen: null, anmerkungen: null, erledigung_sofort: false, erledigung_wochen: null, daten: {}, created_at: stamp(), ...p });

  // entspricht dem Datenbank-Trigger objekt_kennung(): ID vergeben, leere Bezeichnung mit ID füllen
  function kennung(o) {
    if (!o.kennung) {
      const ty = db.objekttypen.find(t => t.code === o.typ); if (!ty) throw new Error('Unbekannter Objekttyp: ' + o.typ);
      ty.zaehler++; o.kennung = ty.praefix + '-' + String(ty.zaehler).padStart(3, '0');
    }
    if (o.name == null || String(o.name).trim() === '') o.name = o.kennung;
  }
  // entspricht dem Datenbank-Trigger sync_objekt(): neueste Prüfung bestimmt die aktuellen Werte
  function sync(bid) {
    const t = db.objekte.find(x => x.id === bid); if (!t) return;
    const n = db.pruefungen.filter(k => k.objekt_id === bid).sort((a, b) => b.datum.localeCompare(a.datum) || b.created_at.localeCompare(a.created_at))[0];
    if (n) Object.assign(t, { aktuell: clone(n.daten), sicherheit: n.sicherheit, handlungsbedarf: n.handlungsbedarf, kunde: n.kunde, pruefer: n.pruefer, letzte_pruefung: n.datum, massnahmen: n.massnahmen, anmerkungen: n.anmerkungen });
    else Object.assign(t, { aktuell: {}, sicherheit: 'gering', handlungsbedarf: 'nein', pruefer: null, letzte_pruefung: null, massnahmen: null, anmerkungen: null });
  }

  function seed(c) {
    seeding = true;
    const d = { objekttypen: [{ code: 'baum', bezeichnung: 'Baum', praefix: 'B', intervall_monate: 12, zaehler: 0 }], objekte: [], pruefungen: [] }; db = d;
    const G = 'Gesund', B = 'Stark geschädigt', P = ['M. Becker', 'S. Yilmaz'];
    const KD = ['Wohnpark Eisenwerk GmbH', 'Stadt Schwelm', 'Familie Brandt'], kundeVon = str => str === 'Eisenwerkstraße' ? KD[0] : str === 'Brunnenstraße' ? KD[2] : KD[1];
    const spec = [
      ['Eiche Einfahrt', 'Stieleiche (Quercus robur)', 'Eisenwerkstraße', '3', -60, 25, 18.4, 14.0, 310, 'Reifephase', G, 'gering', 'nein', false, 20, [], '', 2],
      ['Linde Parkplatz', 'Winterlinde (Tilia cordata)', 'Eisenwerkstraße', '5', -30, 40, 15.2, 11.5, 245, 'Reifephase', G, 'mittel', 'ja', false, 280, ['K13', 'S9'], 'Totholz entfernen, Kronenpflege', 1],
      [null, 'Spitzahorn (Acer platanoides)', 'Eisenwerkstraße', '7', 0, 15, 12.8, 9.0, 190, 'Reifephase', G, 'gering', 'nein', false, 60, [], '', 1],
      ['Kastanie Spielplatz', 'Rosskastanie (Aesculus hippocastanum)', 'Eisenwerkstraße', '12', 40, -20, 21.0, 16.5, 380, 'Alterungsphase', B, 'hoch', 'ja', true, 405, ['K1', 'K3', 'K7', 'S4', 'S6', 'W3'], 'Fällung beantragt, Bereich absperren', 2],
      [null, 'Hainbuche (Carpinus betulus)', 'Eisenwerkstraße', '14', 70, 10, 9.5, 6.0, 120, 'Jugendphase', G, 'gering', 'nein', false, 355, [], '', 0],
      [null, 'Platane (Platanus x hispanica)', 'Hauptstraße', '21', -90, -35, 23.1, 18.0, 420, 'Reifephase', G, 'mittel', 'nein', false, 340, ['K10', 'S1'], 'Lichtraumprofil herstellen', 1],
      ['Buche Hauptstraße', 'Rotbuche (Fagus sylvatica)', 'Hauptstraße', '25', -120, 5, 19.7, 15.2, 335, 'Reifephase', B, 'mittel', 'ja', false, 150, ['K5', 'K11', 'W3'], 'Pilzbefall beobachten', 1],
      [null, 'Bergahorn (Acer pseudoplatanus)', 'Am Park', '2', 20, -70, 14.0, 10.0, 210, 'Reifephase', G, 'gering', 'nein', false, 245, [], '', 1],
      [null, 'Eberesche (Sorbus aucuparia)', 'Am Park', '4', 55, -55, 6.2, 4.1, 75, 'Jugendphase', G, 'gering', 'nein', false, 345, [], '', 0],
      [null, 'Sandbirke (Betula pendula)', 'Am Park', '6', 95, -30, 11.3, 7.2, 140, 'Alterungsphase', B, 'hoch', 'ja', false, 300, ['K13', 'K15', 'S7'], 'Totholz beseitigen, Wipfeldürre prüfen', 1],
      ['Esche Brunnen', 'Esche (Fraxinus excelsior)', 'Brunnenstraße', '8', -45, -80, 17.6, 12.8, 260, 'Alterungsphase', B, 'hoch', 'ja', true, 380, ['K15', 'K2', 'K13', 'S11'], 'Eschentriebsterben, Fällung erforderlich', 2],
      [null, 'Feldahorn (Acer campestre)', 'Brunnenstraße', '10', -10, -110, 8.4, 6.8, 98, 'Jugendphase', G, 'gering', 'nein', false, 100, [], '', 0],
      [null, 'Sommerlinde (Tilia platyphyllos)', 'Brunnenstraße', '12', 30, -120, 13.0, 10.2, 205, 'Reifephase', G, 'gering', 'nein', false, 220, [], '', 1],
      [null, 'Walnuss (Juglans regia)', 'Eisenwerkstraße', '20', 110, 35, 10.8, 12.0, 175, 'Reifephase', G, 'mittel', 'nein', false, 330, ['S2'], '', 0],
      [null, 'Hainbuche, Neupflanzung', 'Eisenwerkstraße', '22', 130, 50, null, null, null, 'Jugendphase', G, 'gering', 'nein', false, null, [], '', 0]
    ];
    spec.forEach(([name, art, str, nr, dx, dy, h, br, um, ph, zu, ri, ha, fa, ago, bef, mass, prev], idx) => {
      const t = objDef({ typ: 'baum', name, kunde: idx === 7 ? null : kundeVon(str), entfernt: idx === 12, entfernt_am: idx === 12 ? ld(40) : null, art, strasse: str, hausnummer: nr, plz: '58332', stadt: 'Schwelm', lat: c[0] + dy / 111000, lng: c[1] + dx / (111000 * Math.cos(c[0] * Math.PI / 180)), pos_quelle: idx === 14 ? 'adresse' : 'karte', stamm: { alter_standort: idx % 3 ? '' : '~60 Jahre' } });
      kennung(t); d.objekte.push(t);
      if (ago == null) return;
      for (let i = prev; i >= 0; i--) {   // älteste zuerst, damit created_at stimmt
        d.pruefungen.push(prDef({
          objekt_id: t.id, datum: ld(ago + 365 * i), kunde: idx === 3 && i ? 'Hausverwaltung Alt & Partner' : t.kunde, pruefer: P[(i + idx) % 2],
          sicherheit: i ? (ri === 'hoch' ? 'mittel' : 'gering') : ri, handlungsbedarf: i ? 'nein' : ha,
          massnahmen: i ? null : (mass || null), anmerkungen: i ? null : (bef.length ? 'Siehe Regelkontrolle' : null),
          daten: {
            hoehe: h == null ? null : Math.round((h - 0.8 * i) * 10) / 10, breite: br == null ? null : Math.round((br - 0.4 * i) * 10) / 10, umfang: um == null ? null : um - 12 * i,
            phase: ph, zustand: i ? G : (zu === B && ri !== 'hoch' ? 'Leicht geschädigt' : zu), intervall: 1, prio: !i && idx === 1, abstimmung_fachabt: false, eingehende_untersuchung: false, faellung: i ? false : fa,
            befunde: i ? bef.slice(0, Math.max(0, bef.length - 2 * i)) : bef.slice()
          }
        }));
      }
      sync(t.id);
    });
    seeding = false;
    return d;
  }

  const save = () => localStorage.setItem(KEY, JSON.stringify(db));
  const ready = (async () => {
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (!db || !db.objekte) { seed(await homePos()); save(); }
  })();

  const cmp = (a, b) => a == null ? (b == null ? 0 : -1) : b == null ? 1 : typeof a === 'string' ? a.localeCompare(b, 'de', { numeric: true }) : a - b;
  class Q {
    constructor(t) { this.t = t; this.op = 'select'; this.f = []; this.o = []; this.ret = true; }
    select() { this.ret = true; return this; }
    insert(r) { this.op = 'insert'; this.p = r; this.ret = false; return this; }
    update(p) { this.op = 'update'; this.p = p; this.ret = false; return this; }
    delete() { this.op = 'delete'; this.ret = false; return this; }
    eq(c, v) { this.f.push([c, v]); return this; }
    order(c, opt) { this.o.push([c, !(opt && opt.ascending === false)]); return this; }
    range(a, b) { this.r = [a, b]; return this; }
    single() { this.one = true; return this; }
    then(res, rej) { return this.run().then(res, rej); }
    async run() {
      await ready;
      try {
        const rows = db[this.t], isO = this.t === 'objekte', isP = this.t === 'pruefungen', m = r => this.f.every(([c, v]) => r[c] === v);
        let data;
        if (this.op === 'select') {
          data = rows.filter(m).map(clone);
          this.o.slice().reverse().forEach(([c, asc]) => data.sort((a, b) => (asc ? 1 : -1) * cmp(a[c], b[c])));
          if (this.r) data = data.slice(this.r[0], this.r[1] + 1);
        } else if (this.op === 'insert') {
          if (!isO && !isP) throw new Error('Schreibzugriff nicht erlaubt');
          const r = isO ? objDef(clone(this.p)) : prDef(clone(this.p));
          if (isO) {
            if (typeof r.lat !== 'number' || typeof r.lng !== 'number') throw new Error('Position fehlt');
            kennung(r);
            if (db.objekte.some(o => o.kennung === r.kennung)) throw new Error('ID existiert bereits');
          }
          if (isP) {
            if (!db.objekte.some(t => t.id === r.objekt_id)) throw new Error('Objekt existiert nicht (Fremdschlüssel)');
            if (!r.datum) throw new Error('Datum darf nicht leer sein');
          }
          if (r.sicherheit && !RISK[r.sicherheit]) throw new Error('Ungültiges Sicherheitsrisiko');
          rows.push(r); data = [clone(r)]; if (isP) sync(r.objekt_id);
        } else if (this.op === 'update') {
          const tg = rows.filter(m);
          if (this.p.sicherheit && !RISK[this.p.sicherheit]) throw new Error('Ungültiges Sicherheitsrisiko');
          if (isP && tg.some(gesperrt)) throw new Error(SPERRE);
          tg.forEach(r => { const ca = r.created_at; Object.assign(r, clone(this.p)); r.created_at = ca; if (isP) sync(r.objekt_id); }); data = tg.map(clone);
        } else {
          const tg = rows.filter(m);
          if (isP && tg.some(gesperrt)) throw new Error(SPERRE);
          if (isO && db.pruefungen.some(k => gesperrt(k) && tg.some(t => t.id === k.objekt_id))) throw new Error(SPERRE);
          db[this.t] = rows.filter(r => !tg.includes(r)); data = tg.map(clone);
          if (isO) db.pruefungen = db.pruefungen.filter(k => !tg.some(t => t.id === k.objekt_id)); else if (isP) tg.forEach(k => sync(k.objekt_id));
        }
        save();
        if (!this.ret) return { data: null, error: null };
        if (this.one) return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: 'Zeile nicht gefunden' } };
        return { data, error: null };
      } catch (e) { return { data: null, error: { message: e.message } }; }
    }
  }
  return {
    from: t => new Q(t),
    auth: {
      async signInWithPassword({ email, password }) {
        const u = String(email).trim().toLowerCase();
        if (USERS[u] && USERS[u].pw === password) { localStorage.setItem(SESS, u); return { error: null }; }
        return { error: { message: 'Benutzer oder Passwort falsch (Test: admin / admin oder pruefer / pruefer)' } };
      },
      async getSession() { const u = me(); return { data: { session: u ? { user: { email: localStorage.getItem(SESS), user_metadata: { full_name: u.name }, app_metadata: { role: u.role } } } : null } }; },
      async signOut() { localStorage.removeItem(SESS); listeners.forEach(f => f('SIGNED_OUT')); return { error: null }; },
      onAuthStateChange(f) { listeners.push(f); return { data: { subscription: { unsubscribe() { } } } }; }
    }
  };
}
if ($('bReset')) $('bReset').onclick = () => { if (confirm('Alle Testdaten verwerfen und die Beispieldaten neu laden?')) { localStorage.removeItem('bk_test_db_v4'); location.reload(); } };

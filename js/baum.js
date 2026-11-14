// ===== Objekttyp „Baum“: Felder, Formular, Kennzeichen, PDF-Inhalt und Baumarten-Vorschläge =====

const PHASE = ['Jugendphase', 'Reifephase', 'Alterungsphase'];
// Vitalitätsstufen (gespeichert wird die Ziffer): [Wert, Bezeichnung, Farbe]
const VITAL = [['0', '0 – Exploration', 'grn'], ['1', '1 – Degeneration', 'yel'], ['2', '2 – Stagnation', 'org'], ['3', '3 – Resignation', 'red'], ['4', '4 – Abgestorben', 'off']];
// frühere Zustands-Werte werden den Stufen zugeordnet
const ZUST_ALT = { 'Gesund': '0', 'Leicht geschädigt': '1', 'Stark geschädigt': '3', 'gesund/leicht geschädigt': '0', 'stärker geschädigt': '3' };
const zNorm = z => z == null || z === '' ? null : String(ZUST_ALT[z] ?? z);
const vital = z => VITAL.find(v => v[0] === zNorm(z));
const vitL = z => vital(z) ? vital(z)[1] : '';
const CHK = [
  ['In der Krone', ['K1 Astab-/ausbrüche', 'K2 Astrisse', 'K3 Wunden/Fäulen', 'K4 Fremder Bewuchs', 'K5 Belaubung auffällig', 'K6 Fehlentwicklungen', 'K7 Höhlungen', 'K8 Kappungsstellen', 'K9 Kronensicherungen', 'K10 Lichtraumprofil', 'K11 Pilzbefall', 'K12 Rindenschäden', 'K13 Totholzbildung', 'K14 Zwiesel/Vergabelung', 'K15 Wipfeldürre']],
  ['Am Stamm', ['S1 Anfahrschäden', 'S2 Astungswunden', 'S3 Fremder Bewuchs', 'S4 Fäulen', 'S5 Gewindestangen/Plomben', 'S6 Höhlungen', 'S7 Pilzbefall', 'S8 Rindenschäden', 'S9 Risse', 'S10 Schadinsekten', 'S11 Schrägstand', 'S12 Stammaustriebe', 'S13 Verletzungen', 'S14 Wuchsanomalien', 'S15 Zwiesel']],
  ['Am Stammfuß/Wurzelanlauf', ['W1 Adventiv-, Würgewurzeln', 'W2 Höhlungen', 'W3 Pilzbefall', 'W4 Rindenschäden', 'W5 Risse', 'W6 Stammfußverbreiterung', 'W7 Stockaustriebe', 'W8 Wuchsanomalien']],
  ['Im Wurzelbereich', ['Wu1 Bodenaufwölbungen', 'Wu2 Bodenrisse', 'Wu3 Pilzbefall']],
  ['Veränderungen im Baumumfeld', ['V1 Baugruben, -gräben', 'V2 Bodenauf- oder -abtrag', 'V3 Bodenverdichtung', 'V4 Bodenversiegelung', 'V5 Freistellung', 'V6 Grundwasserabsenkung/anstau']]
];


// Vorschlagsliste für das Feld Baumart (eigene Eingaben bleiben möglich). Einfach ergänzen oder kürzen.
const BAUMARTEN = [
  "Spitzahorn (Acer platanoides)", "Bergahorn (Acer pseudoplatanus)", "Feldahorn (Acer campestre)",
  "Silberahorn (Acer saccharinum)", "Rotahorn (Acer rubrum)", "Eschenahorn (Acer negundo)",
  "Kugelahorn (Acer platanoides 'Globosum')", "Französischer Ahorn (Acer monspessulanum)", "Stieleiche (Quercus robur)",
  "Traubeneiche (Quercus petraea)", "Roteiche (Quercus rubra)", "Sumpfeiche (Quercus palustris)",
  "Zerreiche (Quercus cerris)", "Rotbuche (Fagus sylvatica)", "Blutbuche (Fagus sylvatica 'Purpurea')",
  "Hainbuche (Carpinus betulus)", "Winterlinde (Tilia cordata)", "Sommerlinde (Tilia platyphyllos)",
  "Holländische Linde (Tilia x vulgaris)", "Krimlinde (Tilia x euchlora)", "Silberlinde (Tilia tomentosa)",
  "Gemeine Esche (Fraxinus excelsior)", "Blumenesche (Fraxinus ornus)", "Spitzblättrige Esche (Fraxinus angustifolia)",
  "Sandbirke (Betula pendula)", "Moorbirke (Betula pubescens)", "Himalaya-Birke (Betula utilis)",
  "Schwarzerle (Alnus glutinosa)", "Grauerle (Alnus incana)", "Roterle (Alnus rubra)",
  "Hasel (Corylus avellana)", "Baumhasel (Corylus colurna)", "Platane (Platanus x hispanica)",
  "Rosskastanie (Aesculus hippocastanum)", "Rotblühende Rosskastanie (Aesculus x carnea)", "Esskastanie (Castanea sativa)",
  "Robinie (Robinia pseudoacacia)", "Gleditschie (Gleditsia triacanthos)", "Schnurbaum (Styphnolobium japonicum)",
  "Götterbaum (Ailanthus altissima)", "Tulpenbaum (Liriodendron tulipifera)", "Amberbaum (Liquidambar styraciflua)",
  "Ginkgo (Ginkgo biloba)", "Silberweide (Salix alba)", "Trauerweide (Salix x sepulcralis)",
  "Salweide (Salix caprea)", "Korbweide (Salix viminalis)", "Zitterpappel (Populus tremula)",
  "Schwarzpappel (Populus nigra)", "Pyramidenpappel (Populus nigra 'Italica')", "Hybridpappel (Populus x canadensis)",
  "Silberpappel (Populus alba)", "Bergulme (Ulmus glabra)", "Feldulme (Ulmus minor)",
  "Flatterulme (Ulmus laevis)", "Zürgelbaum (Celtis australis)", "Vogelkirsche (Prunus avium)",
  "Traubenkirsche (Prunus padus)", "Zierkirsche (Prunus serrulata)", "Blutpflaume (Prunus cerasifera 'Nigra')",
  "Kirschpflaume (Prunus cerasifera)", "Japanische Blütenkirsche (Prunus x yedoensis)", "Zierapfel (Malus 'Evereste')",
  "Wildapfel (Malus sylvestris)", "Apfelbaum (Malus domestica)", "Birnbaum (Pyrus communis)",
  "Stadtbirne (Pyrus calleryana 'Chanticleer')", "Walnuss (Juglans regia)", "Eberesche (Sorbus aucuparia)",
  "Mehlbeere (Sorbus aria)", "Elsbeere (Sorbus torminalis)", "Weißdorn (Crataegus monogyna)",
  "Rotdorn (Crataegus laevigata 'Paul's Scarlet')", "Kornelkirsche (Cornus mas)", "Schwarzer Holunder (Sambucus nigra)",
  "Eibe (Taxus baccata)", "Gemeine Kiefer (Pinus sylvestris)", "Schwarzkiefer (Pinus nigra)",
  "Weymouthskiefer (Pinus strobus)", "Gemeine Fichte (Picea abies)", "Blaufichte (Picea pungens)",
  "Serbische Fichte (Picea omorika)", "Weißtanne (Abies alba)", "Douglasie (Pseudotsuga menziesii)",
  "Europäische Lärche (Larix decidua)", "Lebensbaum (Thuja occidentalis)", "Scheinzypresse (Chamaecyparis lawsoniana)",
  "Mammutbaum (Sequoiadendron giganteum)", "Urweltmammutbaum (Metasequoia glyptostroboides)", "Sumpfzypresse (Taxodium distichum)",
  "Zeder (Cedrus atlantica)", "Magnolie (Magnolia x soulangeana)", "Trompetenbaum (Catalpa bignonioides)",
  "Blauglockenbaum (Paulownia tomentosa)", "Judasbaum (Cercis siliquastrum)", "Perückenstrauch (Cotinus coggygria)",
  "Felsenbirne (Amelanchier lanceolata)", "Liguster (Ligustrum vulgare)", "Buchsbaum (Buxus sempervirens)",
  "Stechpalme (Ilex aquifolium)", "Wacholder (Juniperus communis)", "Schwarznuss (Juglans nigra)",
  "Hopfenbuche (Ostrya carpinifolia)", "Eisenholzbaum (Parrotia persica)", "Silberahorn-Hybride (Acer x freemanii)",
  "Feldahorn 'Elsrijk' (Acer campestre 'Elsrijk')"
];

const artInput = v => `<input type="text" list="baumarten" ${A('t', 'art')} value="${esc(v)}" placeholder="Tippen, z. B. „Esch“ …" autocomplete="off" aria-label="Baumart">`;

TYPES.baum = {
    label: 'Baum', plural: 'Bäume', artLabel: 'Baumart', months: 12, keyLabel: 'Baumhöhe',
    keyValue: o => o.aktuell?.hoehe, keyFmt: v => v == null ? '–' : fmtN(v) + ' m',
    defaultDaten: () => ({ phase: 'Jugendphase', zustand: '0', intervall: 1, befunde: [] }),
    flags: o => { const a = o.aktuell || {}; return [a.faellung && ['red', 'Fällung erforderlich'], o.letzte_pruefung && vital(a.zustand) && [vital(a.zustand)[2], 'Vitalität ' + vitL(a.zustand)], o.letzte_pruefung && a.phase && ['neu', a.phase], a.umfang != null && ['neu', 'Stammumfang ' + fmtN(a.umfang, 0) + ' cm'], a.breite != null && ['neu', 'Krone ' + fmtN(a.breite) + ' m']].filter(Boolean); },
    badges: o => o.aktuell?.faellung ? '<span class="badge red">Fällung</span>' : '',
    isFlagged: o => !!o.aktuell?.faellung,
    csv: ['hoehe', 'breite', 'umfang', 'phase', 'zustand', 'faellung'],
    // zusätzliche Spalten für die PDF-Liste: [Schlüssel, Überschrift, Breite (Gewicht), Wert, in der Standardauswahl?]
    listTitle: 'Baumliste',
    listCols: [
      ['hoehe', 'Höhe', 1.1, o => o.aktuell?.hoehe == null ? '' : fmtN(o.aktuell.hoehe) + ' m', true],
      ['breite', 'Krone', 1.1, o => o.aktuell?.breite == null ? '' : fmtN(o.aktuell.breite) + ' m', false],
      ['umfang', 'Stammumfang', 1.3, o => o.aktuell?.umfang == null ? '' : fmtN(o.aktuell.umfang, 0) + ' cm', false],
      ['phase', 'Entwicklungsphase', 1.7, o => o.letzte_pruefung ? o.aktuell?.phase || '' : '', false],
      ['zustand', 'Vitalitätsstufe', 1.7, o => o.letzte_pruefung ? vitL(o.aktuell?.zustand) : '', false],
      ['faellung', 'Fällung erforderlich', 1.2, o => o.aktuell?.faellung ? 'ja' : '', false]
    ],
    stammForm: o => field('Alter / Standzeit', 's', 'alter_standort', o.stamm?.alter_standort),
    stammNotiz: o => area('Besonderheiten', 's', 'besonderheiten', o.stamm?.besonderheiten),
    form(k) {
      const D = { ...this.defaultDaten(), ...(k.daten || {}) }, bf = D.befunde || [];
      const groups = CHK.map(([h, l]) => { const c = l.filter(x => bf.includes(x.split(' ')[0])).length; return `<details class="chk" ${c ? 'open' : ''}><summary><span>${h}<span class="cnt ${c ? '' : 'z'}">${c}</span></span></summary><div class="cg">${l.map(x => `<label class="ck"><input type="checkbox" data-chk="${x.split(' ')[0]}" ${bf.includes(x.split(' ')[0]) ? 'checked' : ''}>${esc(x)}</label>`).join('')}</div></details>`; }).join('');
      return `
      <h4>Baumdaten zum Zeitpunkt der Prüfung</h4>
      <div class="g3">${num('Baumhöhe', 'd', 'hoehe', D.hoehe, 1, 'm', 0.1)}${num('Kronenbreite', 'd', 'breite', D.breite, 1, 'm', 0.1)}${num('Stammumfang', 'd', 'umfang', D.umfang, 0, 'cm', 1)}</div>
      <h4>${this.artLabel}</h4>${artInput(S.sel.art)}
      <div class="g2" style="margin-top:8px">${field('Prüfdatum', 'k', 'datum', k.datum, 'date')}${field('Prüfer', 'k', 'pruefer', k.pruefer)}${num('Kontrollintervall', 'd', 'intervall', D.intervall, 0, 'Jahre', 1)}${field('Weitere Kontrollstellen', 'd', 'weitere_stellen', D.weitere_stellen)}</div>
      <hr>
      <h4>Entwicklungsphase</h4>${seg('d', 'phase', D.phase, PHASE)}
      <h4>Zustand <span class="unit">(Vitalitätsstufe)</span></h4>${segC('d', 'zustand', zNorm(D.zustand), VITAL)}
      <h4>Verkehrssicherheit</h4>${segC('k', 'sicherheit', SICH[k.sicherheit] ? k.sicherheit : 'sicher', Object.entries(SICH).map(([v, x]) => [v, x.l, x.c]))}
      ${massForm(k)}
      ${cb('d', 'abstimmung_fachabt', D.abstimmung_fachabt, 'Abstimmung mit Fachabteilung')}${cb('d', 'eingehende_untersuchung', D.eingehende_untersuchung, 'Eingehende Untersuchung erforderlich')}
      ${area('Maßnahmen Beschreibung', 'k', 'massnahmen', k.massnahmen)}
      ${cb('d', 'faellung', D.faellung, 'Fällung erforderlich', 'warn')}
      ${area('Anmerkungen', 'k', 'anmerkungen', k.anmerkungen)}
      <hr><h3>Regelkontrolle <small>nur verdächtige Umstände ankreuzen</small></h3>${groups}
      <div style="margin-top:10px">${area('Sonstiges, Anmerkungen zu verdächtigen Umständen', 'd', 'sonstiges', D.sonstiges)}</div>`;
    },
    pdf: {
      stamm(o, P) { P.row('Alter / Standzeit:', P.blank ? '' : o.stamm?.alter_standort); P.row('Besonderheiten:', P.blank ? '' : o.stamm?.besonderheiten); },
      aktuell(o, P) { const a = o.aktuell || {}; P.row('Baumhöhe:', P.m(a.hoehe, 1, 'm')); P.row('Kronenbreite:', P.m(a.breite, 1, 'm')); P.row('Stammumfang:', P.m(a.umfang, 0, 'cm')); },
      pruef(k, P) {
        const D = k.daten || {};
        P.row('Kunde:', k.kunde); P.row('Prüfer:', k.pruefer); P.row('Intervall (Jahre):', D.intervall);
        P.row('Baumhöhe:', P.m(D.hoehe, 1, 'm')); P.row('Kronenbreite:', P.m(D.breite, 1, 'm')); P.row('Stammumfang:', P.m(D.umfang, 0, 'cm'));
        P.row('Entwicklungsphase:', P.opts(PHASE, D.phase)); P.row('Vitalitätsstufe:', P.optsL(VITAL, zNorm(D.zustand)));
        P.pruefStd(k);
        P.row('Abstimmung Fachabteilung:', P.yn(D.abstimmung_fachabt)); P.row('Eingehende Untersuchung:', P.yn(D.eingehende_untersuchung));
        P.row('Fällung erforderlich:', { o: [['ja', !P.blank && !!D.faellung]] });
        P.row('Anmerkungen:', k.anmerkungen); P.row('Weitere Kontrollstellen:', D.weitere_stellen);
        P.gap(3); P.H('Regelkontrolle: nur verdächtige Umstände ankreuzen'); P.checklist(CHK, D.befunde || []);
        P.row('Sonstiges, Anmerkungen:', D.sonstiges); P.sign();
      }
    }
  };

$('baumarten').innerHTML = BAUMARTEN.map(a => `<option value="${esc(a)}">`).join('');

// =====================================================================
//  EINSTELLUNGEN – hier anpassen. Farben stehen in css/theme.css.
// =====================================================================
const CONFIG = {
  // --- Datenbank (Supabase: Project Settings > Data API / API Keys, nur den öffentlichen Key!) ---
  SUPABASE_URL: 'https://zjfdtuzadhfjahzzvsta.supabase.co',
  SUPABASE_KEY: 'sb_publishable_EnJZSLzF4gphSFuiCtPQVg_QdMOXEmZ',

  // --- Erscheinungsbild ---
  APP_NAME: 'Baumkataster',          // Titel in Kopfzeile, Anmeldung und Browser-Tab
  FIRMA: '',                         // Firmenname, erscheint in allen PDFs (z. B. 'Mustermann GaLaBau GmbH')
  LOGO: 'img/logo.svg',              // Bild in Kopfzeile und Anmeldung (SVG, PNG oder JPG). Leer = kein Bild
  PDF_LOGO: '',                      // optional: Logo oben rechts in PDFs, nur PNG oder JPG (z. B. 'img/logo.png')

  // --- Karte ---
  START_ADRESSE: 'Eisenwerkstraße, Schwelm',   // Startpunkt der Karte
  START_FALLBACK: [51.2866, 7.3011],           // falls die Adresssuche nicht erreichbar ist

  // --- Fristen (Tage vor Fälligkeit) ---
  WARN_TAGE: 90,                     // gelb: fällig in höchstens 3 Monaten
  DRINGEND_TAGE: 30,                 // orange: fällig in höchstens 1 Monat

  // --- Sperre von Prüfungen ---
  // Nur die Anzeige. Die eigentliche Sperre (12 Stunden) setzt die Datenbank durch, siehe setup.sql.
  SPERRE_STUNDEN: 12
};

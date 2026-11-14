# 🌳 Baumkataster

Webanwendung für Baumkontrollen im GaLaBau: Bäume auf der Karte erfassen, Prüfungen dokumentieren, fällige Kontrollen auf einen Blick sehen und Protokolle als PDF ausgeben.

**Aufruf:** https://adamsalato.github.io/Baumkataster/

![Dashboard](docs/dashboard.png)

## Funktionen

- Dashboard mit Karte und Baumliste, dringende Bäume stehen oben
- Ampel nach Prüfintervall: überfällig (rot), ≤ 30 Tage (orange), ≤ 3 Monate (gelb)
- Automatische Baum-IDs (B-001, B-002, …)
- Kunde je Prüfung (frühere Kunden bleiben in der Historie sichtbar), Filter und Suche nach Kunde
- Neue Prüfung übernimmt die Werte der letzten Prüfung
- Prüfungen sind 12 Stunden nach dem Anlegen abgeschlossen, danach kann nur ein Admin sie ändern
- Bäume als „Entfernt“ markieren (bleiben dokumentiert, eigene Kachel)
- Verkehrssicherheit in vier Stufen und Vitalitätsstufen 0–4
- Maßnahmen mit Dringlichkeit und Frist, „erledigt am“ und Kachel „Offene Maßnahmen“
- Regelkontrolle mit Checkliste und Prüfhistorie
- PDF-Protokoll (letzte Prüfung, alle Prüfungen oder eine einzelne Prüfung)
- PDF-Liste der aktuellen Auswahl als Tabelle mit frei wählbaren Spalten
- Für Tablet und Handy geeignet, die Karte lässt sich ausblenden

![Baumansicht](docs/baum.png)

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Seitengerüst der Anwendung |
| **`config.js`** | **Einstellungen:** Supabase-Zugang, Name, Firma, Logo, Startadresse, Fristen |
| **`css/theme.css`** | **Farben** (Corporate Design) |
| `img/logo.svg` | Logo in Kopfzeile und Anmeldung |
| `css/app.css` | Aufbau und Layout |
| `js/basis.js` | Helfer, Formular-Bausteine, Prüfstatus |
| `js/baum.js` | Objekttyp Baum: Felder, Formular, Baumarten-Liste |
| `js/app.js` | Anmeldung, Karte, Dashboard, Detailseite |
| `js/pdf.js` | PDF-Protokoll und PDF-Liste |
| `js/mock.js` | Testversion ohne Datenbank |
| `test.html` | Öffnet die Testversion (`index.html?test`), Login `admin` / `admin` oder `pruefer` / `pruefer` |
| `setup.sql` | Neue Datenbank in Supabase einrichten |
| `update_2026-11.sql`, `update_2026-11b.sql`, `update_2026-11c.sql` | Bestehende Datenbank aktualisieren (ohne Datenverlust), in dieser Reihenfolge |

## Aussehen anpassen

- **Farben:** in `css/theme.css` die Werte oben ändern (`--brand` = Hausfarbe, `--accent` = Aktions-Buttons).
- **Logo:** eigene Datei nach `img/` legen und in `config.js` bei `LOGO` eintragen (SVG, PNG oder JPG).
- **Name und Firma:** `APP_NAME` und `FIRMA` in `config.js`. Die Firma erscheint in allen PDFs.
- **Logo in PDFs:** `PDF_LOGO` in `config.js` (nur PNG oder JPG).

## Einrichtung

1. Bei [Supabase](https://supabase.com) ein kostenloses Projekt anlegen.
    - Enable Data API: Muss angehakt bleiben, sonst kann die App nicht auf die Datenbank zugreifen.
    - Automatically expose new tables: Kann abgewählt werden.
2. Im SQL Editor den Inhalt von `setup.sql` ausführen.
3. Unter Authentication → Users die Benutzer anlegen und die freie Registrierung abschalten.
    - Display Name so hinzufügen im SQL Editor:
    ```sql
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || '{"full_name": "NAME"}'
    WHERE email = 'asd@mail.de';
    ```
    - Admin-Recht vergeben (darf abgeschlossene Prüfungen ändern und löschen). Danach neu anmelden:
    ```sql
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'
    WHERE email = 'asd@mail.de';
    ```
4. In `config.js` entsprechend `SUPABASE_URL` und `SUPABASE_KEY` eintragen.
    - URL unter Integrations --> Data API
    - Key unter Project Settings --> API Keys (Nur Public!)
5. GitHub Pages aktivieren: Settings → Pages → Branch `master`, Ordner `/ (root)`.
6. Login mit Zugangsdaten von Supabase

## Weitere Objekttypen (z. B. Zäune)

1. In Supabase: `insert into objekttypen (code, bezeichnung, praefix, intervall_monate) values ('zaun', 'Zaun', 'Z', 12);`
2. `js/baum.js` als `js/zaun.js` kopieren, anpassen (`TYPES.zaun = …`) und in `index.html` einbinden.

## Alte Desktop-Version

Die frühere Python-Anwendung ist unter [Releases](../../releases) weiterhin verfügbar.

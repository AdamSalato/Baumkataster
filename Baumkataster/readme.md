## 🌳 Baumkataster

![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)
![License](https://img.shields.io/badge/Lizenz-MIT-green.svg)
![GUI](https://img.shields.io/badge/GUI-Tkinter-orange.svg)

Ein Desktop-basiertes Management-Tool für den Garten- und Landschaftsbau zur digitalen Erfassung und Verwaltung von Baumbeständen inklusive geografischer Kartierung und automatisierter PDF-Protokollerstellung.

## ✨ Features

* **Interaktive Kartenansicht:** Visualisierung der Bäume via `tkintermapview` (OpenStreetMap).
* **Geocoding:** Automatische Ermittlung von Koordinaten basierend auf der Adresse.
* **Rechtssichere Dokumentation:** Erstellung von detaillierten Kontrollprotokollen (FLL-konform orientiert).
* **Blanko-Export:** Generierung leerer Begehungsprotokolle für die Arbeit vor Ort.
* **Risiko-Management:** Farblich kodierte Marker (Grün, Gelb, Rot) je nach Sicherheitszustand des Baumes.
* **Historisierung:** Speicherung beliebig vieler Kontrollgänge pro Baum in einer lokalen SQLite-Datenbank.

---

## 📥 Download & Nutzung (Windows EXE)

Du musst kein Python installiert haben, um das Programm zu nutzen. Für Windows gibt es eine fertige Anwendung:

1. Klick rechts auf dieser Seite auf **[Releases](https://github.com/AdamSalato/Baumkataster/releases)**.
2. Lade dir dort unter "Assets" die Datei `Baumkataster.exe` herunter.
3. Starte die Datei einfach per Doppelklick.
   * **Hinweis:** Da die App (noch) nicht offiziell signiert ist, zeigt Windows beim ersten Start eventuell einen blauen Warnhinweis. Klick einfach auf **"Weitere Informationen"** und dann auf **"Trotzdem ausführen"**.

---

## 🚀 Installation

1.  **Repository klonen** (oder die `.py` Datei herunterladen):
    ```bash
    git clone [https://github.com/AdamSalato/baumkataster.git](https://github.com/dein-nutzername/baumkataster.git)
    cd baumkataster
    ```

2.  **Abhängigkeiten installieren:**
    Das Programm benötigt einige Bibliotheken, die über `pip` installiert werden können:
    ```bash
    pip install tkintermapview requests reportlab
    ```

3.  **Programm starten:**
    ```bash
    python Baumkataster.py
    ```

## 📂 Projektstruktur

* `Baumkataster.py` - Die Hauptanwendung (GUI, Logik & Datenbank).
* `baumkataster.db` - SQLite Datenbank (wird beim ersten Start automatisch erstellt).
* `resources/` - Ordner für Beispiel-PDFs, Icons und Dokumentationen.

## 🛠 Technologien

* **Sprache:** Python 3
* **GUI-Framework:** Tkinter
* **Karten:** TkinterMapView (OpenStreetMap API)
* **PDF-Engine:** ReportLab
* **Datenbank:** SQLite3

## 📝 Nutzungshinweis

Beim ersten Start wird automatisch eine Datenbankdatei im selben Verzeichnis angelegt. Um Bäume direkt auf der Karte zu platzieren, nutzen Sie den **Rechtsklick** auf die gewünschte Position in der Kartenansicht.

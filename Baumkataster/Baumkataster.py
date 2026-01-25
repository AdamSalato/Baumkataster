import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime
import sqlite3
import tkintermapview
import requests
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from tkinter import filedialog

# Globalen User-Agent für tkintermapview setzen
tkintermapview.canvas_position_marker.CanvasPositionMarker.user_agent = "BaumkatasterProfi_GaLaBau/1.0"

class BaumkatasterApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Baumkataster")
        self.root.geometry("1500x900")
        
        self.init_database()
        self.current_entry_id = None
        self.current_kontroll_id = None 
        self.marker_list = {} 
        
        self.setup_gui()
        self.load_table()
        self.update_map()

    def init_database(self):
        self.conn = sqlite3.connect('baumkataster.db')
        self.conn.row_factory = sqlite3.Row 
        self.cursor = self.conn.cursor()
        
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS baeume (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                name TEXT NOT NULL,
                                baumart TEXT,
                                strasse TEXT, hausnummer TEXT, plz TEXT, stadt TEXT,
                                latitude REAL, longitude REAL,
                                sicherheit TEXT DEFAULT 'gering',
                                hoehe TEXT, breite TEXT, umfang TEXT, alter_standort TEXT,
                                phase TEXT DEFAULT 'Jugendphase', zustand TEXT DEFAULT 'gesund/leicht geschädigt',
                                besonderheiten TEXT,
                                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS baum_versionen (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                baum_id INTEGER,
                                version_date TEXT,
                                FOREIGN KEY(baum_id) REFERENCES baeume(id))''')
        
        # Migration Stammdaten
        b_cols = [("besonderheiten", "TEXT"), ("phase", "TEXT"), ("zustand", "TEXT"), 
                  ("hoehe", "TEXT"), ("breite", "TEXT"), ("umfang", "TEXT"), ("alter_standort", "TEXT")]
        for name, typ in b_cols:
            try: self.cursor.execute(f'ALTER TABLE baeume ADD COLUMN {name} {typ}')
            except sqlite3.OperationalError: pass

        # Migration Kontrolldaten
        v_cols = [
            ("kontrolleur", "TEXT"), ("intervall", "TEXT"), ("handlungsbedarf", "TEXT"), 
            ("abstimmung_fachabt", "INTEGER"), ("eingehende_untersuchung", "INTEGER"),
            ("massnahmen", "TEXT"), ("faellung", "INTEGER"), ("erledigung_sofort", "INTEGER"),
            ("erledigung_wochen", "TEXT"), ("anmerkungen", "TEXT"), ("weitere_stellen", "TEXT"),
            ("sonstiges_regelkontrolle", "TEXT") # Neues Feld für Anmerkungen Regelkontrolle
        ]
        
        for i in range(1, 16): v_cols.append((f"k{i}", "INTEGER"))
        for i in range(1, 16): v_cols.append((f"s{i}", "INTEGER"))
        for i in range(1, 9): v_cols.append((f"w{i}", "INTEGER"))
        for i in range(1, 4): v_cols.append((f"wu{i}", "INTEGER"))
        for i in range(1, 7): v_cols.append((f"v{i}", "INTEGER"))

        for name, typ in v_cols:
            try: self.cursor.execute(f'ALTER TABLE baum_versionen ADD COLUMN {name} {typ}')
            except sqlite3.OperationalError: pass
            
        self.conn.commit()

    def get_color_by_risk(self, risk):
        if risk == "hoch": return "#c0392b"
        if risk == "mittel": return "#e67e22"
        return "#27ae60"

    def setup_gui(self):
        top_frame = tk.Frame(self.root, height=60, bg='#2c3e50')
        top_frame.pack(side=tk.TOP, fill=tk.X)
        top_frame.pack_propagate(False)
        
        tk.Button(top_frame, text="+ Neuer Baum", command=lambda: self.neuer_eintrag_dialog(),
                  bg='#27ae60', fg='white', font=('Arial', 9, 'bold')).pack(side=tk.LEFT, padx=10, pady=10)
        tk.Button(top_frame, text="🗑 Baum löschen", command=self.eintrag_loeschen,
                  bg='#c0392b', fg='white', font=('Arial', 9, 'bold')).pack(side=tk.LEFT, padx=5, pady=10)
        tk.Button(top_frame, text="📄 PDF Export", command=self.pdf_export,
          bg='#3498db', fg='white', font=('Arial', 9, 'bold')).pack(side=tk.LEFT, padx=5, pady=10)
        tk.Button(top_frame, text="📄 PDF LEER Export", command=self.pdf_blank_export,
          bg='#7f8c8d', fg='white', font=('Arial', 9, 'bold')).pack(side=tk.LEFT, padx=5, pady=10)

        search_container = tk.Frame(top_frame, bg='#2c3e50')
        search_container.pack(side=tk.RIGHT, padx=20)
        tk.Label(search_container, text="Suche:", fg='white', bg='#2c3e50', font=('Arial', 9, 'bold')).pack(side=tk.LEFT, padx=(0, 5))
        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", lambda *args: self.load_table())
        tk.Entry(search_container, textvariable=self.search_var, width=25).pack(side=tk.LEFT)

        self.main_paned = tk.PanedWindow(self.root, orient=tk.HORIZONTAL, sashwidth=5)
        self.main_paned.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        left_container = tk.Frame(self.main_paned)
        self.main_paned.add(left_container, width=800)

        map_frame = tk.LabelFrame(left_container, text="Karte", bg='white')
        map_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        self.map_widget = tkintermapview.TkinterMapView(map_frame, corner_radius=0)
        self.map_widget.pack(fill=tk.BOTH, expand=True)
        self.map_widget.set_position(51.2853133, 7.2980063) 
        self.map_widget.set_zoom(15)
        self.map_widget.add_right_click_menu_command(label="Baum hier hinzufügen", command=self.add_tree_at_click, pass_coords=True)

        table_frame = tk.LabelFrame(left_container, text="Baumliste", bg='white')
        table_frame.pack(fill=tk.X, padx=5, pady=5)
        self.tree = ttk.Treeview(table_frame, columns=('ID', 'Name', 'Baumart', 'Strasse', 'Stadt'), show='headings', height=6)
        for col in ('ID', 'Name', 'Baumart', 'Strasse', 'Stadt'): 
            self.tree.heading(col, text=col); self.tree.column(col, width=120)
        self.tree.pack(fill=tk.BOTH, expand=True)
        self.tree.bind('<<TreeviewSelect>>', self.on_tree_select)

        self.right_frame = tk.Frame(self.main_paned, bg='white')
        self.main_paned.add(self.right_frame, width=650)
        self.show_empty_attributes()

    def show_attributes(self, b_id):
        for w in self.right_frame.winfo_children(): w.destroy()
        self.current_entry_id = b_id
        self.cursor.execute('SELECT * FROM baeume WHERE id=?', (b_id,))
        b = self.cursor.fetchone()
        if not b: return

        canvas = tk.Canvas(self.right_frame, bg='white', borderwidth=0, highlightthickness=0)
        scrollbar = ttk.Scrollbar(self.right_frame, orient="vertical", command=canvas.yview)
        scrollable_frame = tk.Frame(canvas, bg='white')
        
        canvas_window = canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        
        def _on_frame_configure(event):
            canvas.configure(scrollregion=canvas.bbox("all"))
        def _on_canvas_configure(event):
            canvas.itemconfig(canvas_window, width=event.width)

        scrollable_frame.bind("<Configure>", _on_frame_configure)
        canvas.bind("<Configure>", _on_canvas_configure)
        canvas.configure(yscrollcommand=scrollbar.set)
        
        def _on_mousewheel(event):
            canvas.yview_scroll(int(-1*(event.delta/120)), "units")
        canvas.bind_all("<MouseWheel>", _on_mousewheel)

        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        header = tk.Frame(scrollable_frame, bg='#2c3e50', pady=10)
        header.pack(fill=tk.X)
        tk.Label(header, text=f"Baum: {b['name']}", fg='white', bg='#2c3e50', font=('Arial', 12, 'bold')).pack()

        # --- SEKTION: STAMMDATEN ---
        stamm_f = tk.LabelFrame(scrollable_frame, text="Stammdaten", bg='white', padx=10, pady=10)
        stamm_f.pack(fill=tk.X, padx=10, pady=5)
        
        fields_cfg = [("Name:", "name", 0, 0, 3), ("Baumart:", "baumart", 1, 0, 3), ("Straße:", "strasse", 2, 0, 1), ("Nr.:", "hausnummer", 2, 2, 1), ("PLZ:", "plz", 3, 0, 1), ("Stadt:", "stadt", 3, 2, 1)]
        for label, col, r, c, span in fields_cfg:
            tk.Label(stamm_f, text=label, bg='white').grid(row=r, column=c, sticky="w")
            e = tk.Entry(stamm_f); e.insert(0, b[col] or ""); e.grid(row=r, column=c+1, columnspan=span, sticky="ew", pady=2)
            e.bind('<FocusOut>', lambda event, cn=col, ent=e: self.update_db('baeume', cn, ent.get(), b_id))

        tk.Label(stamm_f, text="Sicherheitsrisiko:", bg='white', font=('Arial', 9, 'bold')).grid(row=4, column=0, sticky="w", pady=5)
        sec_var = tk.StringVar(value=b['sicherheit'] or "gering")
        def upd_sec():
            self.update_db('baeume', 'sicherheit', sec_var.get(), b_id); self.update_map()
        rb_s = tk.Frame(stamm_f, bg='white'); rb_s.grid(row=4, column=1, columnspan=3, sticky="w")
        for v in ["gering", "mittel", "hoch"]:
            tk.Radiobutton(rb_s, text=v, variable=sec_var, value=v, bg='white', command=upd_sec).pack(side=tk.LEFT)

        # --- SEKTION: BAUMDATEN ---
        baum_f = tk.LabelFrame(scrollable_frame, text="Baumdaten", bg='white', padx=10, pady=10)
        baum_f.pack(fill=tk.X, padx=10, pady=5)

        tk.Label(baum_f, text="Baumhöhe (m):", bg='white').grid(row=0, column=0, sticky="w")
        e_h = tk.Entry(baum_f, width=12); e_h.insert(0, b['hoehe'] or "")
        e_h.grid(row=0, column=1, sticky="w", padx=(5, 15)); e_h.bind('<FocusOut>', lambda e: self.update_db('baeume', 'hoehe', e_h.get(), b_id))

        tk.Label(baum_f, text="Kronenbreite (m):", bg='white').grid(row=0, column=2, sticky="w")
        e_b = tk.Entry(baum_f, width=12); e_b.insert(0, b['breite'] or "")
        e_b.grid(row=0, column=3, sticky="w", padx=(5, 5)); e_b.bind('<FocusOut>', lambda e: self.update_db('baeume', 'breite', e_b.get(), b_id))

        tk.Label(baum_f, text="Stammumfang (cm):", bg='white').grid(row=1, column=0, sticky="w", pady=5)
        e_u = tk.Entry(baum_f, width=12); e_u.insert(0, b['umfang'] or "")
        e_u.grid(row=1, column=1, sticky="w", padx=(5, 15), pady=5); e_u.bind('<FocusOut>', lambda e: self.update_db('baeume', 'umfang', e_u.get(), b_id))

        tk.Label(baum_f, text="Alter/Standzeit:", bg='white').grid(row=1, column=2, sticky="w", pady=5)
        e_a = tk.Entry(baum_f, width=12); e_a.insert(0, b['alter_standort'] or "")
        e_a.grid(row=1, column=3, sticky="w", padx=(5, 5), pady=5); e_a.bind('<FocusOut>', lambda e: self.update_db('baeume', 'alter_standort', e_a.get(), b_id))

        tk.Label(baum_f, text="Entwicklungsphase:", bg='white', font=('Arial', 9, 'bold')).grid(row=2, column=0, sticky="w", pady=(10, 2))
        phase_var = tk.StringVar(value=b['phase'] or "Jugendphase")
        p_frame = tk.Frame(baum_f, bg='white'); p_frame.grid(row=2, column=1, columnspan=3, sticky="w")
        for p in ["Jugendphase", "Reifephase", "Alterungsphase"]:
            tk.Radiobutton(p_frame, text=p, variable=phase_var, value=p, bg='white', 
                           command=lambda: self.update_db('baeume', 'phase', phase_var.get(), b_id)).pack(side=tk.LEFT)

        tk.Label(baum_f, text="Zustand:", bg='white', font=('Arial', 9, 'bold')).grid(row=3, column=0, sticky="w", pady=(5, 2))
        zust_var = tk.StringVar(value=b['zustand'] or "gesund/leicht geschädigt")
        z_frame = tk.Frame(baum_f, bg='white'); z_frame.grid(row=3, column=1, columnspan=3, sticky="w")
        for z in ["gesund/leicht geschädigt", "stärker geschädigt"]:
            tk.Radiobutton(z_frame, text=z, variable=zust_var, value=z, bg='white', 
                           command=lambda: self.update_db('baeume', 'zustand', zust_var.get(), b_id)).pack(side=tk.LEFT)

        # --- SEKTION: KONTROLLE ---
        kont_f = tk.LabelFrame(scrollable_frame, text="Kontrolle", bg='#f9f9f9', padx=10, pady=10)
        kont_f.pack(fill=tk.X, padx=10, pady=5)
        
        btn_f = tk.Frame(kont_f, bg='#f9f9f9'); btn_f.pack(fill=tk.X)
        tk.Button(btn_f, text="+ Neue Kontrolle", bg='#27ae60', fg='white', command=lambda: self.neue_version(b_id)).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=2)
        
        self.cursor.execute('SELECT * FROM baum_versionen WHERE baum_id=? ORDER BY version_date DESC', (b_id,))
        self.vers_rows = self.cursor.fetchall()
        if self.vers_rows:
            sel_f = tk.Frame(kont_f, bg='#f9f9f9'); sel_f.pack(fill=tk.X, pady=5)
            cb = ttk.Combobox(sel_f, values=[r['version_date'] for r in self.vers_rows], state="readonly")
            cb.current(0); cb.pack(side=tk.LEFT, fill=tk.X, expand=True)
            
            tk.Button(sel_f, text="🗑 Löschen", bg='#e74c3c', fg='white', font=('Arial', 8), 
                      command=lambda: self.version_loeschen(self.vers_rows[cb.current()]['id'], b_id)).pack(side=tk.RIGHT, padx=5)
            
            v_container = tk.Frame(kont_f, bg='#f9f9f9'); v_container.pack(fill=tk.X)
            self.render_kontroll_fields(v_container, self.vers_rows[0])
            cb.bind('<<ComboboxSelected>>', lambda e: self.render_kontroll_fields(v_container, self.vers_rows[cb.current()]))

    def render_kontroll_fields(self, container, k_row):
        for w in container.winfo_children(): w.destroy()
        k_id = k_row['id']
        self.current_kontroll_id = k_id
        container.columnconfigure(0, weight=0); container.columnconfigure(1, weight=1)

        # Kontrolleur / Intervall
        tk.Label(container, text="Kontrolleur:", bg='#f9f9f9').grid(row=0, column=0, sticky="w", pady=1)
        e_k = tk.Entry(container); e_k.insert(0, k_row['kontrolleur'] or ""); e_k.grid(row=0, column=1, sticky="w", pady=1, padx=(2, 5))
        e_k.bind('<FocusOut>', lambda e: self.update_v_db(k_id, 'kontrolleur', e_k.get()))

        tk.Label(container, text="Kontrollintervall (Jahre):", bg='#f9f9f9', font=('Arial', 8)).grid(row=1, column=0, sticky="w", pady=1)
        e_int = tk.Entry(container, width=10); e_int.insert(0, k_row['intervall'] or ""); e_int.grid(row=1, column=1, sticky="w", pady=1, padx=(2, 5))
        e_int.bind('<FocusOut>', lambda e: self.update_v_db(k_id, 'intervall', e_int.get()))

        # Handlungsbedarf
        tk.Label(container, text="Handlungsbedarf:", bg='#f9f9f9', font=('Arial', 9, 'bold')).grid(row=2, column=0, sticky="w", pady=1)
        h_var = tk.StringVar(value=k_row['handlungsbedarf'] or "nein")
        h_f = tk.Frame(container, bg='#f9f9f9'); h_f.grid(row=2, column=1, sticky="w", pady=1, padx=(2, 0))
        for txt in ["ja", "nein"]:
            tk.Radiobutton(h_f, text=txt, variable=h_var, value=txt, bg='#f9f9f9', padx=2, command=lambda: self.update_v_db(k_id, 'handlungsbedarf', h_var.get())).pack(side=tk.LEFT)

        # Checkboxen
        f_var = tk.IntVar(value=k_row['abstimmung_fachabt'] or 0)
        tk.Checkbutton(container, text="Abstimmung mit Fachabteilung", variable=f_var, bg='#f9f9f9', command=lambda: self.update_v_db(k_id, 'abstimmung_fachabt', f_var.get())).grid(row=3, column=0, columnspan=2, sticky="w")
        u_var = tk.IntVar(value=k_row['eingehende_untersuchung'] or 0)
        tk.Checkbutton(container, text="Eingehende Untersuchung erforderlich", variable=u_var, bg='#f9f9f9', command=lambda: self.update_v_db(k_id, 'eingehende_untersuchung', u_var.get())).grid(row=4, column=0, columnspan=2, sticky="w")

        # Maßnahmen / Fällung / Erledigung
        tk.Label(container, text="Baumpflegerische Maßnahmen:", bg='#f9f9f9', font=('Arial', 9, 'bold')).grid(row=5, column=0, columnspan=2, sticky="w", pady=(5,0))
        t_mass = tk.Text(container, height=4, font=('Arial', 10), relief=tk.SOLID, borderwidth=1)
        t_mass.insert("1.0", k_row['massnahmen'] or ""); t_mass.grid(row=6, column=0, columnspan=2, sticky="ew", pady=2)
        t_mass.bind('<FocusOut>', lambda e: self.update_v_db(k_id, 'massnahmen', t_mass.get("1.0", "end-1c")))

        fael_var = tk.IntVar(value=k_row['faellung'] or 0)
        tk.Checkbutton(container, text="Fällung erforderlich", variable=fael_var, bg='#f9f9f9', font=('Arial', 9, 'bold'), fg='#c0392b', command=lambda: self.update_v_db(k_id, 'faellung', fael_var.get())).grid(row=7, column=0, columnspan=2, sticky="w")

        erl_f = tk.Frame(container, bg='#f9f9f9'); erl_f.grid(row=8, column=0, columnspan=2, sticky="w", pady=5)
        tk.Label(erl_f, text="Erledigung:", bg='#f9f9f9', font=('Arial', 9, 'bold')).pack(side=tk.LEFT)
        sof_var = tk.IntVar(value=k_row['erledigung_sofort'] or 0)
        tk.Checkbutton(erl_f, text="sofort", variable=sof_var, bg='#f9f9f9', command=lambda: self.update_v_db(k_id, 'erledigung_sofort', sof_var.get())).pack(side=tk.LEFT, padx=5)
        tk.Label(erl_f, text="oder in (Wochen):", bg='#f9f9f9').pack(side=tk.LEFT)
        e_wo = tk.Entry(erl_f, width=8); e_wo.insert(0, k_row['erledigung_wochen'] or ""); e_wo.pack(side=tk.LEFT, padx=2)
        e_wo.bind('<FocusOut>', lambda e: self.update_v_db(k_id, 'erledigung_wochen', e_wo.get()))

        # Anmerkungen / Weitere Stellen
        tk.Label(container, text="Anmerkungen:", bg='#f9f9f9', font=('Arial', 9, 'bold')).grid(row=9, column=0, sticky="w", pady=(5,0))
        t_anm = tk.Text(container, height=3, font=('Arial', 10), relief=tk.SOLID, borderwidth=1)
        t_anm.insert("1.0", k_row['anmerkungen'] or ""); t_anm.grid(row=10, column=0, columnspan=2, sticky="ew", pady=2)
        t_anm.bind('<FocusOut>', lambda e: self.update_v_db(k_id, 'anmerkungen', t_anm.get("1.0", "end-1c")))

        tk.Label(container, text="Weitere Kontrollstellen:", bg='#f9f9f9').grid(row=11, column=0, sticky="w", pady=5)
        e_weit = tk.Entry(container); e_weit.insert(0, k_row['weitere_stellen'] or ""); e_weit.grid(row=11, column=1, sticky="ew", pady=5, padx=(2, 5))
        e_weit.bind('<FocusOut>', lambda e: self.update_v_db(k_id, 'weitere_stellen', e_weit.get()))

        # --- SEKTION: REGELKONTROLLE ---
        ttk.Separator(container, orient='horizontal').grid(row=12, column=0, columnspan=2, sticky="ew", pady=10)
        tk.Label(container, text="Regelkontrolle - Nur verdächtige Umstände ankreuzen", 
                 bg='#f9f9f9', font=('Arial', 10, 'bold'), fg='#2c3e50').grid(row=13, column=0, columnspan=2, sticky="w")

        # 1. IN DER KRONE
        tk.Label(container, text="In der Krone", bg='#f9f9f9', font=('Arial', 9, 'italic', 'underline')).grid(row=14, column=0, columnspan=2, sticky="w", pady=(5,2))
        k_labels = [
            ("K1 Astab-/ausbrüche", "k1"), ("K2 Astrisse", "k2"), ("K3 Wunden/Fäulen", "k3"), ("K4 Fremder Bewuchs", "k4"),
            ("K5 Belaubung auffällig", "k5"), ("K6 Fehlentwicklungen", "k6"), ("K7 Höhlungen", "k7"), ("K8 Kappungsstellen", "k8"),
            ("K9 Kronensicherungen", "k9"), ("K10 Lichtraumprofil", "k10"), ("K11 Pilzbefall", "k11"), ("K12 Rindenschäden", "k12"),
            ("K13 Totholzbildung", "k13"), ("K14 Zwiesel/Vergabelung", "k14"), ("K15 Wipfeldürre", "k15")
        ]
        grid_k = tk.Frame(container, bg='#f9f9f9'); grid_k.grid(row=15, column=0, columnspan=2, sticky="ew")
        grid_k.columnconfigure(0, weight=1); grid_k.columnconfigure(1, weight=1)
        for i, (txt, col) in enumerate(k_labels):
            v = tk.IntVar(value=k_row[col] or 0)
            cb = tk.Checkbutton(grid_k, text=txt, variable=v, bg='#f9f9f9', font=('Arial', 8), command=lambda var=v, c=col: self.update_v_db(k_id, c, var.get()))
            cb.grid(row=i//2, column=i%2, sticky="w"); cb.var = v

        # 2. AM STAMM
        tk.Label(container, text="Am Stamm", bg='#f9f9f9', font=('Arial', 9, 'italic', 'underline')).grid(row=16, column=0, columnspan=2, sticky="w", pady=(10,2))
        s_labels = [
            ("S1 Anfahrschäden", "s1"), ("S2 Astungswunden", "s2"), ("S3 Fremder Bewuchs", "s3"), ("S4 Fäulen", "s4"),
            ("S5 Gewindestangen/Plomben", "s5"), ("S6 Höhlungen", "s6"), ("S7 Pilzbefall", "s7"), ("S8 Rindenschäden", "s8"),
            ("S9 Risse", "s9"), ("S10 Schadinsekten", "s10"), ("S11 Schrägstand", "s11"), ("S12 Stammaustriebe", "s12"),
            ("S13 Verletzungen", "s13"), ("S14 Wuchsanomalien", "s14"), ("S15 Zwiesel", "s15")
        ]
        grid_s = tk.Frame(container, bg='#f9f9f9'); grid_s.grid(row=17, column=0, columnspan=2, sticky="ew")
        grid_s.columnconfigure(0, weight=1); grid_s.columnconfigure(1, weight=1)
        for i, (txt, col) in enumerate(s_labels):
            v = tk.IntVar(value=k_row[col] or 0)
            cb = tk.Checkbutton(grid_s, text=txt, variable=v, bg='#f9f9f9', font=('Arial', 8), command=lambda var=v, c=col: self.update_v_db(k_id, c, var.get()))
            cb.grid(row=i//2, column=i%2, sticky="w"); cb.var = v

        # 3. AM STAMMFUSS/WURZELANLAUF
        tk.Label(container, text="Am Stammfuß/Wurzelanlauf", bg='#f9f9f9', font=('Arial', 9, 'italic', 'underline')).grid(row=18, column=0, columnspan=2, sticky="w", pady=(10,2))
        w_labels = [
            ("W1 Adventiv-, Würgewurzeln", "w1"), ("W2 Höhlungen", "w2"), ("W3 Pilzbefall", "w3"), ("W4 Rindenschäden", "w4"),
            ("W5 Risse", "w5"), ("W6 Stammfußverbreiterung", "w6"), ("W7 Stockaustriebe", "w7"), ("W8 Wuchsanomalien", "w8")
        ]
        grid_w = tk.Frame(container, bg='#f9f9f9'); grid_w.grid(row=19, column=0, columnspan=2, sticky="ew")
        grid_w.columnconfigure(0, weight=1); grid_w.columnconfigure(1, weight=1)
        for i, (txt, col) in enumerate(w_labels):
            v = tk.IntVar(value=k_row[col] or 0)
            cb = tk.Checkbutton(grid_w, text=txt, variable=v, bg='#f9f9f9', font=('Arial', 8), command=lambda var=v, c=col: self.update_v_db(k_id, c, var.get()))
            cb.grid(row=i//2, column=i%2, sticky="w"); cb.var = v

        # 4. IM WURZELBEREICH
        tk.Label(container, text="Im Wurzelbereich", bg='#f9f9f9', font=('Arial', 9, 'italic', 'underline')).grid(row=20, column=0, columnspan=2, sticky="w", pady=(10,2))
        wu_labels = [("Wu1 Bodenaufwölbungen", "wu1"), ("Wu2 Bodenrisse", "wu2"), ("Wu3 Pilzbefall", "wu3")]
        grid_wu = tk.Frame(container, bg='#f9f9f9'); grid_wu.grid(row=21, column=0, columnspan=2, sticky="ew")
        grid_wu.columnconfigure(0, weight=1); grid_wu.columnconfigure(1, weight=1)
        for i, (txt, col) in enumerate(wu_labels):
            v = tk.IntVar(value=k_row[col] or 0)
            cb = tk.Checkbutton(grid_wu, text=txt, variable=v, bg='#f9f9f9', font=('Arial', 8), command=lambda var=v, c=col: self.update_v_db(k_id, c, var.get()))
            cb.grid(row=i//2, column=i%2, sticky="w"); cb.var = v

        # 5. VERÄNDERUNGEN IM BAUMUMFELD
        tk.Label(container, text="Veränderungen im Baumumfeld", bg='#f9f9f9', font=('Arial', 9, 'italic', 'underline')).grid(row=22, column=0, columnspan=2, sticky="w", pady=(10,2))
        v_labels = [
            ("V1 Baugruben, -gräben", "v1"), ("V2 Bodenauf- oder -abtrag", "v2"), ("V3 Bodenverdichtung", "v3"),
            ("V4 Bodenversiegelung", "v4"), ("V5 Freistellung", "v5"), ("V6 Grundwasserabsenkung/anstau", "v6")
        ]
        grid_v = tk.Frame(container, bg='#f9f9f9'); grid_v.grid(row=23, column=0, columnspan=2, sticky="ew")
        grid_v.columnconfigure(0, weight=1); grid_v.columnconfigure(1, weight=1)
        for i, (txt, col) in enumerate(v_labels):
            v = tk.IntVar(value=k_row[col] or 0)
            cb = tk.Checkbutton(grid_v, text=txt, variable=v, bg='#f9f9f9', font=('Arial', 8), command=lambda var=v, c=col: self.update_v_db(k_id, c, var.get()))
            cb.grid(row=i//2, column=i%2, sticky="w"); cb.var = v

        # --- NEUE SEKTION: ABSCHLUSS REGELKONTROLLE ---
        ttk.Separator(container, orient='horizontal').grid(row=24, column=0, columnspan=2, sticky="ew", pady=15)
        
        tk.Label(container, text="Sonstiges, Anmerkungen zu verdächtigen Umständen:", bg='#f9f9f9', font=('Arial', 9, 'bold')).grid(row=25, column=0, columnspan=2, sticky="w")
        t_sonst = tk.Text(container, height=3, font=('Arial', 10), relief=tk.SOLID, borderwidth=1)
        t_sonst.insert("1.0", k_row['sonstiges_regelkontrolle'] or "")
        t_sonst.grid(row=26, column=0, columnspan=2, sticky="ew", pady=5)
        t_sonst.bind('<FocusOut>', lambda e: self.update_v_db(k_id, 'sonstiges_regelkontrolle', t_sonst.get("1.0", "end-1c")))

        tk.Label(container, text="Datum, Unterschrift:", bg='#f9f9f9', font=('Arial', 9, 'bold')).grid(row=27, column=0, sticky="w", pady=(10,0))
        e_sig = tk.Entry(container, state='disabled', bg='#eeeeee') # Ausgegraut
        e_sig.grid(row=27, column=1, sticky="ew", pady=(10,0), padx=(2,5))
        
        tk.Label(container, text="Für die Druckversion", bg='#f9f9f9', font=('Arial', 7, 'italic'), fg='gray').grid(row=28, column=1, sticky="e", padx=5)

        tk.Frame(container, height=60, bg='#f9f9f9').grid(row=29, column=0) # Finaler Spacer

    def update_db(self, table, field, val, row_id):
        self.cursor.execute(f'UPDATE {table} SET {field}=? WHERE id=?', (val, row_id))
        self.conn.commit()
        if field in ['name', 'baumart', 'stadt']: self.load_table()

    def update_v_db(self, k_id, field, val):
        self.cursor.execute(f'UPDATE baum_versionen SET {field}=? WHERE id=?', (val, k_id))
        self.conn.commit()

    def neue_version(self, b_id):
        now = datetime.now().strftime('%d.%m.%Y %H:%M')
        self.cursor.execute('INSERT INTO baum_versionen (baum_id, version_date, handlungsbedarf) VALUES (?,?,?)', (b_id, now, "nein"))
        self.conn.commit(); self.show_attributes(b_id)

    def version_loeschen(self, v_id, b_id):
        if messagebox.askyesno("Löschen", "Dieses Kontroll-Protokoll wirklich löschen?"):
            self.cursor.execute('DELETE FROM baum_versionen WHERE id=?', (v_id,))
            self.conn.commit(); self.show_attributes(b_id)

    def pdf_blank_export(self):
        # Ein leeres Baum-Objekt für den Blanko-Export
        blank_tree = {
            'name': '', 'baumart': '', 'strasse': '', 'hausnummer': '', 
            'plz': '', 'stadt': '', 'sicherheit': '', 'hoehe': '', 
            'breite': '', 'umfang': '', 'alter_standort': '',
            'phase': '', 'zustand': ''
        }
        filename = filedialog.asksaveasfilename(
            defaultextension=".pdf",
            filetypes=[("PDF files", "*.pdf")],
            initialfile="Baumprotokoll_Blanko.pdf"
        )
        if filename:
            self.create_pdf(filename, blank_tree, is_blank=True)
            messagebox.showinfo("Erfolg", "Leeres PDF wurde erstellt!")

    def pdf_export(self):
        if not self.current_entry_id:
            return messagebox.showwarning("Export", "Bitte erst einen Baum auswählen.")
        self.cursor.execute('SELECT * FROM baeume WHERE id=?', (self.current_entry_id,))
        baum = dict(self.cursor.fetchone())
        filename = filedialog.asksaveasfilename(
            defaultextension=".pdf",
            filetypes=[("PDF files", "*.pdf")],
            initialfile=f"Protokoll_{baum['name']}.pdf"
        )
        if filename:
            self.create_pdf(filename, baum, is_blank=False)
            messagebox.showinfo("Erfolg", "PDF wurde erfolgreich erstellt!")

    def create_pdf(self, filename, baum, is_blank=False):
        doc = SimpleDocTemplate(filename, pagesize=A4, 
                               rightMargin=2*cm, leftMargin=2*cm,
                               topMargin=2*cm, bottomMargin=2*cm)
        story = []
        styles = getSampleStyleSheet()
        
        # --- FARBEN & STYLES ---
        primary_color = colors.HexColor('#2c3e50')
        bg_color = colors.HexColor('#f8f9f9')
        
        title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], 
                                   fontSize=14, textColor=primary_color, spaceAfter=12, alignment=0)
        heading_style = ParagraphStyle('CustomHeading', parent=styles['Heading2'], 
                                     fontSize=12, textColor=primary_color, spaceAfter=8, 
                                     spaceBefore=12, backColor=colors.HexColor('#ecf0f1'), borderPadding=4)
        normal_style = styles['Normal']
        normal_style.fontSize = 9
        normal_style.leading = 11

        # 1. TITEL
        story.append(Paragraph(f"Baum: {baum['name']}", title_style))

        # 2. STAMMDATEN
        story.append(Paragraph("<b>Stammdaten</b>", heading_style))
        s_val = baum.get('sicherheit', '')
        if is_blank:
            sicherheit_txt = "[ ] gering   [ ] mittel   [ ] hoch"
        else:
            sicherheit_txt = f"{'[X]' if s_val=='gering' else '[ ]'} gering   " \
                             f"{'[X]' if s_val=='mittel' else '[ ]'} mittel   " \
                             f"{'[X]' if s_val=='hoch' else '[ ]'} hoch"

        stammdaten = [
            ['Name:', baum.get('name', '')],
            ['Baumart:', baum.get('baumart', '')],
            ['Straße / Nr.:', f"{baum.get('strasse', '')} {baum.get('hausnummer', '')}"],
            ['PLZ / Stadt:', f"{baum.get('plz', '')} {baum.get('stadt', '')}"],
            ['Sicherheitsrisiko:', sicherheit_txt],
        ]
        t1 = Table(stammdaten, colWidths=[5*cm, 12*cm])
        t1.setStyle(TableStyle([('BACKGROUND', (0, 0), (0, -1), bg_color), ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'), ('FONTSIZE', (0,0), (-1,-1), 9), ('GRID', (0,0), (-1,-1), 0.5, colors.grey), ('BOTTOMPADDING', (0,0), (-1,-1), 4)]))
        story.append(t1)

        # 3. BAUMDATEN
        story.append(Paragraph("<b>Baumdaten</b>", heading_style))
        p_val = baum.get('phase', '')
        z_val = baum.get('zustand', '')
        
        if is_blank:
            phase_txt = "[ ] Jugendphase   [ ] Reifephase   [ ] Alterungsphase"
            zustand_txt = "[ ] gesund/leicht geschädigt   [ ] stärker geschädigt"
        else:
            phase_txt = f"{'[X]' if p_val=='Jugendphase' else '[ ]'} Jugendphase   " \
                        f"{'[X]' if p_val=='Reifephase' else '[ ]'} Reifephase   " \
                        f"{'[X]' if p_val=='Alterungsphase' else '[ ]'} Alterungsphase"
            zustand_txt = f"{'[X]' if z_val=='gesund/leicht geschädigt' else '[ ]'} gesund/leicht geschädigt   " \
                          f"{'[X]' if z_val=='stärker geschädigt' else '[ ]'} stärker geschädigt"

        baumdaten = [
            ['Baumhöhe (m):', baum.get('hoehe', '')],
            ['Kronenbreite (m):', baum.get('breite', '')],
            ['Stammumfang (cm):', baum.get('umfang', '')],
            ['Alter/Standzeit:', baum.get('alter_standort', '')],
            ['Entwicklungsphase:', phase_txt],
            ['Zustand:', zustand_txt],
        ]
        t2 = Table(baumdaten, colWidths=[5*cm, 12*cm])
        t2.setStyle(TableStyle([('BACKGROUND', (0, 0), (0, -1), bg_color), ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'), ('FONTSIZE', (0,0), (-1,-1), 9), ('GRID', (0,0), (-1,-1), 0.5, colors.grey), ('BOTTOMPADDING', (0,0), (-1,-1), 4)]))
        story.append(t2)

        # 4. KONTROLL-VERSIONEN
        if is_blank:
            # Erzeuge ein künstliches leeres Protokoll
            versionen = [{
                'version_date': '________________', 'kontrolleur': '', 'intervall': '', 
                'handlungsbedarf': '', 'abstimmung_fachabt': 0, 'eingehende_untersuchung': 0,
                'faellung': 0, 'erledigung_sofort': 0, 'erledigung_wochen': '',
                'massnahmen': '', 'anmerkungen': '', 'weitere_stellen': '', 'sonstiges_regelkontrolle': ''
            }]
            for key in [f"k{i}" for i in range(1,16)] + [f"s{i}" for i in range(1,16)] + [f"w{i}" for i in range(1,9)] + [f"wu{i}" for i in range(1,4)] + [f"v{i}" for i in range(1,7)]:
                versionen[0][key] = 0
        else:
            self.cursor.execute('SELECT * FROM baum_versionen WHERE baum_id=? ORDER BY version_date DESC', (self.current_entry_id,))
            versionen = [dict(v) for v in self.cursor.fetchall()]

        for idx, v in enumerate(versionen):
            story.append(Paragraph(f"<b>Kontrollprotokoll vom: {v['version_date']}</b>", heading_style))
            
            # Handlungsbedarf Logik
            if is_blank:
                h_txt = "[ ] ja   [ ] nein"
                abst_txt = "[ ] Ja   [ ] Nein"
                unters_txt = "[ ] Ja   [ ] Nein"
                faellung_check = "[ ]"
                erledigung_sofort = "[ ]"
            else:
                h_txt = f"{'[X]' if v['handlungsbedarf']=='ja' else '[ ]'} ja   {'[X]' if v['handlungsbedarf']=='nein' else '[ ]'} nein"
                abst_txt = f"{'[X]' if v['abstimmung_fachabt'] else '[ ]'} Ja   {'[ ]' if v['abstimmung_fachabt'] else '[X]'} Nein"
                unters_txt = f"{'[X]' if v['eingehende_untersuchung'] else '[ ]'} Ja   {'[ ]' if v['eingehende_untersuchung'] else '[X]'} Nein"
                faellung_check = "[X]" if v['faellung'] else "[ ]"
                erledigung_sofort = "[X]" if v['erledigung_sofort'] else "[ ]"
            
            kontroll_data = [
                ['Kontrolleur:', v['kontrolleur'] or ''],
                ['Intervall (Jahre):', v['intervall'] or ''],
                ['Handlungsbedarf:', h_txt],
                ['Abstimmung Fachabt.:', abst_txt],
                ['Eingehende Unters.:', unters_txt],
                ['Baumpflegerische Maßnahmen:', Paragraph(v['massnahmen'] or ' ', normal_style)],
                ['Fällung erforderlich:', faellung_check],
                ['Erledigung:', f"{erledigung_sofort} Sofort  /  in Wochen: {v['erledigung_wochen'] or ' '}"],
                ['Anmerkungen:', Paragraph(v['anmerkungen'] or ' ', normal_style)],
                ['Weitere Kontrollstellen:', Paragraph(v['weitere_stellen'] or ' ', normal_style)]
            ]
            
            ka_table = Table(kontroll_data, colWidths=[6*cm, 11*cm])
            ka_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), bg_color),
                ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
                ('FONTSIZE', (0,0), (-1,-1), 9),
                ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
                ('VALIGN', (0,0), (-1,-1), 'TOP'),
                ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ]))
            story.append(ka_table)
   
            # SEITE 2: CHECKLISTE
            story.append(PageBreak())
            story.append(Paragraph(f"Baum: {baum.get('name', '')} - Checkliste Kontrolle", title_style))
            story.append(Paragraph("<b>Regelkontrolle - Nur verdächtige Umstände ankreuzen</b>", 
                                 ParagraphStyle('RegelTitle', parent=styles['Normal'], fontSize=12, textColor=primary_color, spaceBefore=10, spaceAfter=5)))
            
            # (Innere Hilfsfunktion für Checkbox-Tabellen)
            def create_mini_table(labels, version_row):
                items = [[f"{'[X]' if version_row[col] else '[ ]'} {txt}" for txt, col in labels[i:i+2]] for i in range(0, len(labels), 2)]
                for r in items: 
                    if len(r) < 2: r.append("")
                t = Table(items, colWidths=[8.5*cm, 8.5*cm])
                t.setStyle(TableStyle([('FONTSIZE', (0, 0), (-1, -1), 9), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('BOTTOMPADDING', (0, 0), (-1, -1), 2)]))
                return t

            sections = [
                ("In der Krone", [("K1 Astab-/ausbrüche", "k1"), ("K2 Astrisse", "k2"), ("K3 Wunden/Fäulen", "k3"), ("K4 Fremder Bewuchs", "k4"), ("K5 Belaubung auffällig", "k5"), ("K6 Fehlentwicklungen", "k6"), ("K7 Höhlungen", "k7"), ("K8 Kappungsstellen", "k8"), ("K9 Kronensicherungen", "k9"), ("K10 Lichtraumprofil", "k10"), ("K11 Pilzbefall", "k11"), ("K12 Rindenschäden", "k12"), ("K13 Totholzbildung", "k13"), ("K14 Zwiesel/Vergabelung", "k14"), ("K15 Wipfeldürre", "k15")]),
                ("Am Stamm", [("S1 Anfahrschäden", "s1"), ("S2 Astungswunden", "s2"), ("S3 Fremder Bewuchs", "s3"), ("S4 Fäulen", "s4"), ("S5 Gewindestangen/Plomben", "s5"), ("S6 Höhlungen", "s6"), ("S7 Pilzbefall", "s7"), ("S8 Rindenschäden", "s8"), ("S9 Risse", "s9"), ("S10 Schadinsekten", "s10"), ("S11 Schrägstand", "s11"), ("S12 Stammaustriebe", "s12"), ("S13 Verletzungen", "s13"), ("S14 Wuchsanomalien", "s14"), ("S15 Zwiesel", "s15")]),
                ("Am Stammfuß/Wurzelanlauf", [("W1 Adventiv-, Würgewurzeln", "w1"), ("W2 Höhlungen", "w2"), ("W3 Pilzbefall", "w3"), ("W4 Rindenschäden", "w4"), ("W5 Risse", "w5"), ("W6 Stammfußverbreiterung", "w6"), ("W7 Stockaustriebe", "w7"), ("W8 Wuchsanomalien", "w8")]),
                ("Im Wurzelbereich", [("Wu1 Bodenaufwölbungen", "wu1"), ("Wu2 Bodenrisse", "wu2"), ("Wu3 Pilzbefall", "wu3")]),
                ("Veränderungen im Baumumfeld", [("V1 Baugruben, -gräben", "v1"), ("V2 Bodenauf- oder -abtrag", "v2"), ("V3 Bodenverdichtung", "v3"), ("V4 Bodenversiegelung", "v4"), ("V5 Freistellung", "v5"), ("V6 Grundwasserabsenkung/anstau", "v6")])
            ]

            for s_title, s_labels in sections:
                story.append(Paragraph(f"<b><i>{s_title}</i></b>", normal_style))
                story.append(create_mini_table(s_labels, v))
                story.append(Spacer(1, 0.2*cm))
            
            story.append(Paragraph("<b>Sonstiges, Anmerkungen zu verdächtigen Umständen:</b>", normal_style))
            story.append(Paragraph(v['sonstiges_regelkontrolle'] or ' ', normal_style))
            story.append(Spacer(1, 0.8*cm))
            story.append(Paragraph("<b>Datum, Unterschrift:</b>", normal_style)); story.append(Paragraph("_" * 60, normal_style))
            
            if idx < len(versionen) - 1:
                story.append(PageBreak())
    
        doc.build(story)

    def get_checked_items(self, version, prefix, labels):
        """Hilfsfunktion zum Sammeln angekreuzter Items für PDF"""
        checked = []
        for i, label in enumerate(labels, 1):
            col_name = f"{prefix}{i}"
            if version[col_name]:
                checked.append(label)
        return ", ".join(checked) if checked else ""

    def update_map(self):
        for m in self.marker_list.values(): m.delete()
        self.marker_list = {}
        self.cursor.execute('SELECT id, name, latitude, longitude, sicherheit FROM baeume')
        for b in self.cursor.fetchall():
            if b['latitude'] and b['longitude']:
                color = self.get_color_by_risk(b['sicherheit'] or "gering")
                marker = self.map_widget.set_marker(b['latitude'], b['longitude'], text=b['name'], 
                                                   marker_color_outside=color, marker_color_circle="white", command=self.on_marker_click)
                marker.data = b['id']; self.marker_list[b['id']] = marker

    def on_tree_select(self, event):
        sel = self.tree.selection()
        if sel:
            b_id = int(sel[0]); self.show_attributes(b_id)
            self.cursor.execute('SELECT latitude, longitude FROM baeume WHERE id=?', (b_id,))
            c = self.cursor.fetchone()
            if c and c['latitude']: self.map_widget.set_position(c['latitude'], c['longitude'])

    def on_marker_click(self, marker):
        self.show_attributes(marker.data); self.tree.selection_set(marker.data)

    def load_table(self):
        for i in self.tree.get_children(): self.tree.delete(i)
        q = f"%{self.search_var.get()}%"
        self.cursor.execute('SELECT id, name, baumart, strasse, stadt FROM baeume WHERE name LIKE ? OR baumart LIKE ? OR stadt LIKE ?', (q, q, q))
        for r in self.cursor.fetchall(): self.tree.insert('', 'end', iid=r['id'], values=(r['id'], r['name'], r['baumart'], r['strasse'], r['stadt']))

    def show_empty_attributes(self):
        for w in self.right_frame.winfo_children(): w.destroy()
        tk.Label(self.right_frame, text="Bitte Baum wählen.", bg='white', fg='gray').pack(expand=True)

    def get_coords_from_address(self, address_string):
        try:
            url = "https://nominatim.openstreetmap.org/search"
            params = {'q': address_string, 'format': 'json', 'limit': 1}
            headers = {'User-Agent': 'BaumkatasterApp/1.0'}
            response = requests.get(url, params=params, headers=headers, timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data: return float(data[0]['lat']), float(data[0]['lon'])
        except: return None
        return None

    def add_tree_at_click(self, coords):
        try: addr = tkintermapview.convert_coordinates_to_address(coords[0], coords[1])
        except: addr = None
        self.neuer_eintrag_dialog(lat_hidden=coords[0], lon_hidden=coords[1], address_obj=addr)

    def neuer_eintrag_dialog(self, lat_hidden=None, lon_hidden=None, address_obj=None):
        dialog = tk.Toplevel(self.root); dialog.title("Neuer Baum"); dialog.geometry("400x450")
        fields = ['Name*', 'Baumart', 'Strasse', 'Hausnr', 'PLZ', 'Stadt']
        ents = {}
        for i, f in enumerate(fields):
            tk.Label(dialog, text=f).grid(row=i, column=0, padx=20, pady=8, sticky="w")
            e = tk.Entry(dialog, width=25); e.grid(row=i, column=1, padx=20, pady=8); ents[f] = e
        
        if address_obj and hasattr(address_obj, 'address'):
            raw = address_obj.address
            ents['Strasse'].insert(0, raw.get('road', ''))
            ents['Hausnr'].insert(0, raw.get('house_number', ''))
            ents['PLZ'].insert(0, raw.get('postcode', ''))
            ents['Stadt'].insert(0, raw.get('city', raw.get('town', '')))

        def save():
            name = ents['Name*'].get()
            if not name: return messagebox.showerror("Fehler", "Name fehlt")
            f_lat, f_lon = lat_hidden, lon_hidden
            if f_lat is None:
                full_addr = f"{ents['Strasse'].get()} {ents['Hausnr'].get()}, {ents['PLZ'].get()} {ents['Stadt'].get()}"
                found = self.get_coords_from_address(full_addr)
                if found: f_lat, f_lon = found
                else: return messagebox.showerror("Fehler", "Adresse nicht gefunden.")
            
            self.cursor.execute('''INSERT INTO baeume (name, baumart, strasse, hausnummer, plz, stadt, latitude, longitude, sicherheit) 
                                VALUES (?,?,?,?,?,?,?,?,?)''', 
                                (name, ents['Baumart'].get(), ents['Strasse'].get(), ents['Hausnr'].get(), ents['PLZ'].get(), ents['Stadt'].get(), f_lat, f_lon, "gering"))
            self.conn.commit(); self.load_table(); self.update_map(); dialog.destroy()
        tk.Button(dialog, text="Speichern", command=save, bg='#27ae60', fg='white').grid(row=len(fields), columnspan=2, pady=25)

    def eintrag_loeschen(self):
        if not self.current_entry_id: return
        if messagebox.askyesno("Löschen", "Gesamten Baum und alle zugehörigen Protokolle löschen?"):
            self.cursor.execute('DELETE FROM baum_versionen WHERE baum_id=?', (self.current_entry_id,))
            self.cursor.execute('DELETE FROM baeume WHERE id=?', (self.current_entry_id,))
            self.conn.commit(); self.load_table(); self.update_map(); self.show_empty_attributes()

if __name__ == "__main__":
    root = tk.Tk(); app = BaumkatasterApp(root); root.mainloop()
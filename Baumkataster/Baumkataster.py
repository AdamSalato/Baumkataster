import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime
import sqlite3
import tkintermapview
import requests

# Globalen User-Agent für tkintermapview setzen, um 403 Forbidden zu vermeiden
tkintermapview.canvas_position_marker.CanvasPositionMarker.user_agent = "BaumkatasterProfi_GaLaBau/1.0"

class BaumkatasterApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Baumkataster Profi - GaLa Bau")
        self.root.geometry("1500x900")
        
        self.init_database()
        self.current_entry_id = None
        self.current_kontroll_id = None 
        
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
                                latitude REAL, longitude REAL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        
        try:
            self.cursor.execute('ALTER TABLE baeume ADD COLUMN baumart TEXT')
        except sqlite3.OperationalError: pass

        self.cursor.execute('''CREATE TABLE IF NOT EXISTS baum_versionen (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                baum_id INTEGER, version_date DATETIME NOT NULL,
                                zustand TEXT, massnahmen TEXT,
                                FOREIGN KEY (baum_id) REFERENCES baeume (id))''')
        self.conn.commit()

    def setup_gui(self):
        # Top Bar
        top_frame = tk.Frame(self.root, height=60, bg='#2c3e50')
        top_frame.pack(side=tk.TOP, fill=tk.X)
        top_frame.pack_propagate(False)
        
        tk.Button(top_frame, text="+ Neuer Baum", command=lambda: self.neuer_eintrag_dialog(),
                  bg='#27ae60', fg='white', font=('Arial', 9, 'bold')).pack(side=tk.LEFT, padx=10, pady=10)
        
        tk.Button(top_frame, text="🗑 Baum löschen", command=self.eintrag_loeschen,
                  bg='#c0392b', fg='white', font=('Arial', 9, 'bold')).pack(side=tk.LEFT, padx=5, pady=10)

        search_container = tk.Frame(top_frame, bg='#2c3e50')
        search_container.pack(side=tk.RIGHT, padx=20)
        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", lambda *args: self.load_table())
        tk.Entry(search_container, textvariable=self.search_var, width=25).pack(side=tk.LEFT, padx=20)
        tk.Label(search_container, text="Suche:", fg='white', bg='#2c3e50').pack(side=tk.LEFT)

        # Main Layout
        self.main_paned = tk.PanedWindow(self.root, orient=tk.HORIZONTAL, sashwidth=5)
        self.main_paned.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        left_container = tk.Frame(self.main_paned)
        self.main_paned.add(left_container, width=950)

        # Map
        map_frame = tk.LabelFrame(left_container, text="Karte", bg='white')
        map_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        self.map_widget = tkintermapview.TkinterMapView(map_frame, corner_radius=0)
        self.map_widget.pack(fill=tk.BOTH, expand=True)
        
        # Startposition Schwelm
        self.map_widget.set_position(51.2853133, 7.2980063) 
        self.map_widget.set_zoom(15)
        self.map_widget.add_right_click_menu_command(label="Baum hier hinzufügen", command=self.add_tree_at_click, pass_coords=True)

        # Table
        table_frame = tk.LabelFrame(left_container, text="Baumliste", bg='white')
        table_frame.pack(fill=tk.X, padx=5, pady=5)
        self.tree = ttk.Treeview(table_frame, columns=('ID', 'Name', 'Baumart', 'Strasse', 'Stadt'), show='headings', height=6)
        for col in ('ID', 'Name', 'Baumart', 'Strasse', 'Stadt'): 
            self.tree.heading(col, text=col)
            self.tree.column(col, width=120)
        self.tree.pack(fill=tk.BOTH, expand=True)
        self.tree.bind('<<TreeviewSelect>>', self.on_tree_select)

        # Sidebar
        self.right_frame = tk.Frame(self.main_paned, bg='white')
        self.main_paned.add(self.right_frame, width=500)
        self.show_empty_attributes()

    def get_coords_from_address(self, address_string):
        """Ermittelt Koordinaten via Nominatim mit User-Agent Header"""
        try:
            url = "https://nominatim.openstreetmap.org/search"
            params = {'q': address_string, 'format': 'json', 'limit': 1}
            headers = {'User-Agent': 'BaumkatasterApp_GaLaBau_v1.0'}
            response = requests.get(url, params=params, headers=headers, timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data:
                    return float(data[0]['lat']), float(data[0]['lon'])
        except Exception as e:
            print(f"Geocoding Fehler: {e}")
        return None

    def add_tree_at_click(self, coords):
        """Wird bei Rechtsklick auf Karte aufgerufen"""
        try:
            addr = tkintermapview.convert_coordinates_to_address(coords[0], coords[1])
        except:
            addr = None
        self.neuer_eintrag_dialog(lat_hidden=coords[0], lon_hidden=coords[1], address_obj=addr)

    def neuer_eintrag_dialog(self, lat_hidden=None, lon_hidden=None, address_obj=None):
        dialog = tk.Toplevel(self.root)
        dialog.title("Neuer Baum")
        dialog.geometry("400x450")
        
        fields = ['Name*', 'Baumart', 'Strasse', 'Hausnr', 'PLZ', 'Stadt']
        ents = {}
        for i, f in enumerate(fields):
            tk.Label(dialog, text=f).grid(row=i, column=0, padx=20, pady=8, sticky="w")
            e = tk.Entry(dialog, width=25)
            e.grid(row=i, column=1, padx=20, pady=8)
            ents[f] = e

        if address_obj and hasattr(address_obj, 'address'):
            raw = address_obj.address
            ents['Strasse'].insert(0, raw.get('road', ''))
            ents['Hausnr'].insert(0, raw.get('house_number', ''))
            ents['PLZ'].insert(0, raw.get('postcode', ''))
            ents['Stadt'].insert(0, raw.get('city', raw.get('town', '')))

        def save():
            name = ents['Name*'].get()
            if not name: return messagebox.showerror("Fehler", "Name fehlt")
            
            final_lat, final_lon = lat_hidden, lon_hidden
            
            if final_lat is None:
                full_addr = f"{ents['Strasse'].get()} {ents['Hausnr'].get()}, {ents['PLZ'].get()} {ents['Stadt'].get()}"
                found = self.get_coords_from_address(full_addr)
                if found:
                    final_lat, final_lon = found
                else:
                    return messagebox.showerror("Fehler", "Adresse nicht gefunden. Bitte prüfen oder Rechtsklick nutzen.")

            self.cursor.execute('''INSERT INTO baeume (name, baumart, strasse, hausnummer, plz, stadt, latitude, longitude) 
                                VALUES (?,?,?,?,?,?,?,?)''',
                               (name, ents['Baumart'].get(), ents['Strasse'].get(), 
                                ents['Hausnr'].get(), ents['PLZ'].get(), ents['Stadt'].get(), 
                                final_lat, final_lon))
            self.conn.commit()
            self.load_table()
            self.update_map()
            dialog.destroy()

        tk.Button(dialog, text="Baum speichern", command=save, bg='#27ae60', fg='white', font=('Arial', 10, 'bold')).grid(row=len(fields), columnspan=2, pady=25)

    def show_attributes(self, b_id):
        for w in self.right_frame.winfo_children(): w.destroy()
        self.current_entry_id = b_id
        self.cursor.execute('SELECT * FROM baeume WHERE id=?', (b_id,))
        b = self.cursor.fetchone()
        if not b: return
        
        scroll_f = tk.Frame(self.right_frame, bg='white'); scroll_f.pack(fill=tk.BOTH, expand=True)
        header = tk.Frame(scroll_f, bg='#2c3e50', pady=10); header.pack(fill=tk.X)
        tk.Label(header, text=f"Baum: {b['name']}", fg='white', bg='#2c3e50', font=('Arial', 12, 'bold')).pack()
        
        stamm_f = tk.LabelFrame(scroll_f, text="Stammdaten", bg='white', padx=10, pady=10)
        stamm_f.pack(fill=tk.X, padx=10, pady=10)
        
        fields_cfg = [("Name:", "name", 0, 0, 3), ("Baumart:", "baumart", 1, 0, 3), ("Straße:", "strasse", 2, 0, 1), ("Nr.:", "hausnummer", 2, 2, 1), ("PLZ:", "plz", 3, 0, 1), ("Stadt:", "stadt", 3, 2, 1)]
        for label, col, r, c, span in fields_cfg:
            tk.Label(stamm_f, text=label, bg='white').grid(row=r, column=c, sticky="w")
            e = tk.Entry(stamm_f); e.insert(0, b[col] or ""); e.grid(row=r, column=c+1, columnspan=span, sticky="ew", pady=2)
            e.bind('<FocusOut>', lambda event, cn=col, ent=e: self.update_db('baeume', cn, ent.get(), b_id))
        
        def format_coord(v):
            if v is None or v == "":
                return ""
            try:
                return f"{round(float(v), 6)}"
            except (TypeError, ValueError):
                return ""

        lat_text = format_coord(b['latitude'])
        lon_text = format_coord(b['longitude'])
        tk.Label(stamm_f, text=f"📍 {lat_text}, {lon_text}", bg='white', fg='gray', font=('Arial', 8)).grid(row=4, column=0, columnspan=4, pady=5)
        stamm_f.columnconfigure(1, weight=1); stamm_f.columnconfigure(3, weight=1)
        
        kont_f = tk.LabelFrame(scroll_f, text="Kontroll-Historie", bg='white', padx=10, pady=10); kont_f.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        btn_f = tk.Frame(kont_f, bg='white'); btn_f.pack(fill=tk.X)
        tk.Button(btn_f, text="+ Neue Kontrolle", bg='#27ae60', fg='white', command=lambda: self.neue_version(b_id)).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=2)
        self.del_btn = tk.Button(btn_f, text="🗑 Löschen", bg='#e67e22', fg='white', command=lambda: self.kontrolle_loeschen(b_id))
        self.del_btn.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=2)
        
        self.cursor.execute('SELECT id, version_date FROM baum_versionen WHERE baum_id=? ORDER BY version_date DESC', (b_id,))
        self.vers_rows = self.cursor.fetchall()
        if self.vers_rows:
            self.del_btn.config(state=tk.NORMAL)
            cb = ttk.Combobox(kont_f, values=[r['version_date'] for r in self.vers_rows], state="readonly"); cb.current(0); cb.pack(fill=tk.X, pady=5)
            self.current_kontroll_id = self.vers_rows[0]['id']
            v_detail_f = tk.Frame(kont_f, bg='white'); v_detail_f.pack(fill=tk.BOTH, expand=True)
            self.render_kontroll_text(v_detail_f, self.current_kontroll_id)
            cb.bind('<<ComboboxSelected>>', lambda e: self.on_combo_change(v_detail_f, cb.current()))
        else:
            self.del_btn.config(state=tk.DISABLED)
            tk.Label(kont_f, text="Keine Kontrollen", bg='white', fg='gray').pack(pady=10)

    def render_kontroll_text(self, container, k_id):
        for w in container.winfo_children(): w.destroy()
        self.cursor.execute('SELECT massnahmen FROM baum_versionen WHERE id=?', (k_id,))
        res = self.cursor.fetchone()
        t = tk.Text(container, height=8, font=('Arial', 10), relief=tk.SOLID, borderwidth=1)
        t.insert("1.0", res['massnahmen'] if res and res['massnahmen'] else "")
        t.pack(fill=tk.BOTH, expand=True, pady=5)
        t.bind('<FocusOut>', lambda e: self.update_v_db(k_id, 'massnahmen', t.get("1.0", "end-1c")))

    def on_combo_change(self, container, index):
        self.current_kontroll_id = self.vers_rows[index]['id']
        self.render_kontroll_text(container, self.current_kontroll_id)

    def update_db(self, table, field, val, row_id):
        self.cursor.execute(f'UPDATE {table} SET {field}=? WHERE id=?', (val, row_id))
        self.conn.commit()
        if field in ['name', 'baumart', 'stadt']: self.load_table()

    def update_v_db(self, k_id, field, val):
        self.cursor.execute(f'UPDATE baum_versionen SET {field}=? WHERE id=?', (val, k_id))
        self.conn.commit()

    def neue_version(self, b_id):
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        self.cursor.execute('INSERT INTO baum_versionen (baum_id, version_date, massnahmen) VALUES (?,?,?)', (b_id, now, ""))
        self.conn.commit(); self.show_attributes(b_id)

    def kontrolle_loeschen(self, b_id):
        if messagebox.askyesno("Löschen", "Dieses Protokoll entfernen?"):
            self.cursor.execute('DELETE FROM baum_versionen WHERE id=?', (self.current_kontroll_id,))
            self.conn.commit(); self.show_attributes(b_id)

    def load_table(self):
        for i in self.tree.get_children(): self.tree.delete(i)
        q = f"%{self.search_var.get()}%"
        self.cursor.execute('SELECT id, name, baumart, strasse, stadt FROM baeume WHERE name LIKE ? OR baumart LIKE ? OR stadt LIKE ?', (q, q, q))
        for r in self.cursor.fetchall(): self.tree.insert('', 'end', iid=r['id'], values=(r['id'], r['name'], r['baumart'], r['strasse'], r['stadt']))

    def update_map(self):
        self.map_widget.delete_all_marker()
        self.cursor.execute('SELECT id, name, latitude, longitude FROM baeume')
        for b in self.cursor.fetchall():
            if b['latitude'] and b['longitude']:
                marker = self.map_widget.set_marker(b['latitude'], b['longitude'], text=b['name'], marker_color_outside="#c0392b", marker_color_circle="white", command=self.on_marker_click)
                marker.data = b['id']

    def on_tree_select(self, event):
        sel = self.tree.selection()
        if sel:
            b_id = int(sel[0])
            self.show_attributes(b_id)
            self.cursor.execute('SELECT latitude, longitude FROM baeume WHERE id=?', (b_id,))
            c = self.cursor.fetchone()
            if c and c['latitude']: self.map_widget.set_position(c['latitude'], c['longitude'])

    def on_marker_click(self, marker):
        self.show_attributes(marker.data)
        self.tree.selection_set(marker.data)

    def eintrag_loeschen(self):
        if not self.current_entry_id: return
        if messagebox.askyesno("Löschen", "Baum und alle Protokolle löschen?"):
            self.cursor.execute('DELETE FROM baum_versionen WHERE baum_id=?', (self.current_entry_id,))
            self.cursor.execute('DELETE FROM baeume WHERE id=?', (self.current_entry_id,))
            self.conn.commit(); self.load_table(); self.update_map(); self.show_empty_attributes()

    def show_empty_attributes(self):
        for w in self.right_frame.winfo_children(): w.destroy()
        tk.Label(self.right_frame, text="Baum auswählen", bg='white', fg='gray').pack(expand=True)

if __name__ == "__main__":
    root = tk.Tk(); app = BaumkatasterApp(root); root.mainloop()
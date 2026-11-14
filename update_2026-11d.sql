-- Baumkataster: Update "Gruppen" (keine Daten gehen verloren).
-- Voraussetzung: update_2026-11.sql, -11b.sql und -11c.sql wurden bereits ausgeführt.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen. Mehrfaches Ausführen schadet nicht.

-- Neuer Objekttyp: Gruppen erhalten die IDs G-001, G-002, ...
insert into objekttypen (code, bezeichnung, praefix, intervall_monate)
  values ('gruppe', 'Gruppe', 'G', 12) on conflict (code) do nothing;

-- Ein Baum gehört zu höchstens einer Gruppe. Wird die Gruppe gelöscht, bleibt der Baum erhalten.
alter table objekte add column if not exists gruppe_id uuid references objekte(id) on delete set null;
create index if not exists objekte_gruppe_idx on objekte(gruppe_id);

-- Baumkataster: BESTEHENDE Datenbank auf den Stand November 2026 bringen (keine Daten gehen verloren).
-- Im Supabase-Dashboard unter "SQL Editor" einmalig ausführen. Mehrfaches Ausführen schadet nicht.
-- Neu: Kunde, "Entfernt", Maßnahmen/Anmerkungen am Objekt (für die PDF-Liste), 12-Stunden-Sperre, Admin-Recht.
-- Für eine ganz neue Datenbank stattdessen setup.sql verwenden.

-- ===== Neue Spalten =====
alter table objekte add column if not exists kunde text;
alter table objekte add column if not exists massnahmen text;
alter table objekte add column if not exists anmerkungen text;
alter table objekte add column if not exists entfernt boolean not null default false;
alter table objekte add column if not exists entfernt_am date;
create index if not exists objekte_kunde_idx on objekte(kunde);

-- ===== Automatik 2: neueste Prüfung bestimmt die aktuellen Werte des Objekts =====
create or replace function sync_objekt() returns trigger
language plpgsql as $$
declare bid uuid := coalesce(new.objekt_id, old.objekt_id); n pruefungen%rowtype;
begin
  select * into n from pruefungen where objekt_id = bid order by datum desc, created_at desc limit 1;
  if found then
    update objekte set aktuell = n.daten, sicherheit = n.sicherheit, handlungsbedarf = n.handlungsbedarf,
      pruefer = n.pruefer, letzte_pruefung = n.datum, massnahmen = n.massnahmen, anmerkungen = n.anmerkungen where id = bid;
  else
    update objekte set aktuell = '{}', sicherheit = 'gering', handlungsbedarf = 'nein',
      pruefer = null, letzte_pruefung = null, massnahmen = null, anmerkungen = null where id = bid;
  end if;
  return null;
end $$;
drop trigger if exists pruefungen_sync on pruefungen;
create trigger pruefungen_sync after insert or update or delete on pruefungen
  for each row execute function sync_objekt();

-- ===== Admin-Recht =====
-- Admin ist, wer in Supabase die Rolle "admin" hat. So vergeben (danach muss sich die Person neu anmelden):
--   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = 'name@beispiel.de';
-- Wieder entziehen:
--   update auth.users set raw_app_meta_data = raw_app_meta_data - 'role' where email = 'name@beispiel.de';
-- Im SQL Editor selbst (kein angemeldeter App-Benutzer) gilt man ebenfalls als Admin.
create or replace function is_admin() returns boolean
language sql stable as $$
  select auth.uid() is null or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

-- ===== Automatik 3: Prüfungen sind 12 Stunden nach dem Anlegen abgeschlossen =====
-- Danach kann nur noch ein Admin sie ändern oder löschen (gilt auch für das Löschen eines Objekts mit solchen Prüfungen).
-- Die Frist steht in der Zeile "interval '12 hours'"; bei Änderung auch SPERRE_STUNDEN in config.js anpassen.
create or replace function pruefung_sperre() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if not is_admin() then new.created_at := now(); end if;       -- Anlegezeit lässt sich nicht vorgeben
    return new;
  end if;
  if old.created_at < now() - interval '12 hours' and not is_admin() then
    raise exception 'Diese Prüfung ist gesperrt (älter als 12 Stunden). Änderungen sind nur als Admin möglich.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if not is_admin() then new.created_at := old.created_at; new.objekt_id := old.objekt_id; end if;
  return new;
end $$;
drop trigger if exists pruefungen_sperre on pruefungen;
create trigger pruefungen_sperre before insert or update or delete on pruefungen
  for each row execute function pruefung_sperre();

-- ===== Vorhandene Daten nachziehen: Maßnahmen und Anmerkungen der jeweils neuesten Prüfung =====
update objekte o set massnahmen = p.massnahmen, anmerkungen = p.anmerkungen
from (select distinct on (objekt_id) objekt_id, massnahmen, anmerkungen from pruefungen order by objekt_id, datum desc, created_at desc) p
where p.objekt_id = o.id;

-- ===== WICHTIG: mindestens einen Admin festlegen (E-Mail anpassen, dann die Zeile ohne "--" ausführen) =====
-- update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = 'name@beispiel.de';

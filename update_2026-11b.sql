-- Baumkataster: Update "Kunde je Prüfung" (keine Daten gehen verloren).
-- Voraussetzung: update_2026-11.sql wurde bereits ausgeführt. Im Supabase-Dashboard unter "SQL Editor" EINMAL ausführen.
-- Der Kunde wird ab jetzt in jeder Prüfung gespeichert; der aktuelle Kunde eines Objekts ist der Kunde der neuesten Prüfung.

alter table pruefungen add column if not exists kunde text;

-- Bisherige Prüfungen erhalten den Kunden, der heute am Objekt eingetragen ist
update pruefungen p set kunde = o.kunde from objekte o where o.id = p.objekt_id and p.kunde is null and o.kunde is not null;

-- ===== Automatik 2: neueste Prüfung bestimmt die aktuellen Werte des Objekts =====
create or replace function sync_objekt() returns trigger
language plpgsql as $$
declare bid uuid := coalesce(new.objekt_id, old.objekt_id); n pruefungen%rowtype;
begin
  select * into n from pruefungen where objekt_id = bid order by datum desc, created_at desc limit 1;
  if found then
    update objekte set aktuell = n.daten, sicherheit = n.sicherheit, handlungsbedarf = n.handlungsbedarf,
      pruefer = n.pruefer, letzte_pruefung = n.datum, massnahmen = n.massnahmen, anmerkungen = n.anmerkungen, kunde = n.kunde where id = bid;
  else
    update objekte set aktuell = '{}', sicherheit = 'gering', handlungsbedarf = 'nein',
      pruefer = null, letzte_pruefung = null, massnahmen = null, anmerkungen = null where id = bid;
  end if;
  return null;
end $$;
drop trigger if exists pruefungen_sync on pruefungen;
create trigger pruefungen_sync after insert or update or delete on pruefungen
  for each row execute function sync_objekt();


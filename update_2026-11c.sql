-- Baumkataster: Update "Verkehrssicherheit, Maßnahmen mit Dringlichkeit, Vitalitätsstufen" (keine Daten gehen verloren).
-- Voraussetzung: update_2026-11.sql und update_2026-11b.sql wurden bereits ausgeführt.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen. Mehrfaches Ausführen schadet nicht.
--
-- Was mit den vorhandenen Daten passiert:
--   Sicherheitsrisiko  gering -> verkehrssicher | mittel -> verkehrssicher nach Maßnahme | hoch -> nicht verkehrssicher
--                      (der alte Wert bleibt in der Spalte "sicherheit_alt" der Prüfung erhalten)
--   Handlungsbedarf    nein -> keine Maßnahme | "Erledigung sofort" -> Sofortmaßnahme | "in Wochen": bis 4 -> sehr hohe,
--                      bis 13 -> hohe, bis 26 -> geringe Dringlichkeit, darüber -> Pflegemaßnahme | ja ohne Angabe -> hohe Dringlichkeit
--   Die alten Spalten handlungsbedarf, erledigung_sofort, erledigung_wochen bleiben unbenutzt in der Datenbank stehen.
--   Zustand (Gesund / Leicht / Stark geschädigt) wird in der App als Vitalitätsstufe 0 / 1 / 3 angezeigt, die Daten bleiben unverändert.

-- ===== Neue Spalten =====
alter table pruefungen add column if not exists sicherheit_alt text;
alter table pruefungen add column if not exists dringlichkeit text not null default 'keine';
alter table pruefungen add column if not exists erledigt_am date;
alter table pruefungen add column if not exists erledigt_von text;
alter table objekte add column if not exists dringlichkeit text not null default 'keine';
alter table objekte add column if not exists erledigt_am date;
alter table objekte add column if not exists erledigt_von text;

-- alte Wertebereiche aufheben
alter table pruefungen drop constraint if exists pruefungen_sicherheit_check;
alter table objekte drop constraint if exists objekte_sicherheit_check;
alter table pruefungen drop constraint if exists pruefungen_dringlichkeit_check;
alter table objekte drop constraint if exists objekte_dringlichkeit_check;

-- ===== Automatik 2: neueste Prüfung bestimmt die aktuellen Werte des Objekts =====
create or replace function sync_objekt() returns trigger
language plpgsql as $$
declare bid uuid := coalesce(new.objekt_id, old.objekt_id); n pruefungen%rowtype;
begin
  select * into n from pruefungen where objekt_id = bid order by datum desc, created_at desc limit 1;
  if found then
    update objekte set aktuell = n.daten, sicherheit = n.sicherheit, dringlichkeit = n.dringlichkeit, erledigt_am = n.erledigt_am, erledigt_von = n.erledigt_von,
      pruefer = n.pruefer, letzte_pruefung = n.datum, massnahmen = n.massnahmen, anmerkungen = n.anmerkungen, kunde = n.kunde where id = bid;
  else
    update objekte set aktuell = '{}', sicherheit = 'sicher', dringlichkeit = 'keine', erledigt_am = null, erledigt_von = null,
      pruefer = null, letzte_pruefung = null, massnahmen = null, anmerkungen = null where id = bid;
  end if;
  return null;
end $$;
drop trigger if exists pruefungen_sync on pruefungen;
create trigger pruefungen_sync after insert or update or delete on pruefungen
  for each row execute function sync_objekt();

-- ===== Automatik 3: Prüfungen sind 12 Stunden nach dem Anlegen abgeschlossen =====
-- Danach kann nur noch ein Admin sie ändern oder löschen (gilt auch für das Löschen eines Objekts mit solchen Prüfungen).
-- Ausnahme: "Maßnahme erledigt am / von" darf jeder Benutzer auch später noch eintragen.
-- Die Frist steht in der Zeile "interval '12 hours'"; bei Änderung auch SPERRE_STUNDEN in config.js anpassen.
create or replace function pruefung_sperre() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if not is_admin() then new.created_at := now(); end if;       -- Anlegezeit lässt sich nicht vorgeben
    return new;
  end if;
  if old.created_at < now() - interval '12 hours' and not is_admin() then
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'erledigt_am' - 'erledigt_von') = (to_jsonb(old) - 'erledigt_am' - 'erledigt_von') then
      return new;                                                   -- nur "erledigt" geändert: erlaubt
    end if;
    raise exception 'Diese Prüfung ist gesperrt (älter als 12 Stunden). Änderungen sind nur als Admin möglich.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if not is_admin() then new.created_at := old.created_at; new.objekt_id := old.objekt_id; end if;
  return new;
end $$;
drop trigger if exists pruefungen_sperre on pruefungen;
create trigger pruefungen_sperre before insert or update or delete on pruefungen
  for each row execute function pruefung_sperre();

-- ===== Vorhandene Prüfungen umstellen (nur Zeilen mit den alten Werten, daher gefahrlos wiederholbar) =====
update pruefungen set
  sicherheit_alt = sicherheit,
  dringlichkeit = case
    when erledigung_sofort then 'sofort'
    when substring(erledigung_wochen from '[0-9]+')::int <= 4 then 'sehr_hoch'
    when substring(erledigung_wochen from '[0-9]+')::int <= 13 then 'hoch'
    when substring(erledigung_wochen from '[0-9]+')::int <= 26 then 'gering'
    when substring(erledigung_wochen from '[0-9]+')::int > 26 then 'pflege'
    when handlungsbedarf = 'ja' then 'hoch'
    else 'keine' end,
  sicherheit = case sicherheit when 'gering' then 'sicher' when 'mittel' then 'nach_massnahme' else 'unsicher' end
where sicherheit in ('gering', 'mittel', 'hoch');

-- Objekte ohne Prüfung (alle anderen hat die Automatik oben schon übernommen)
update objekte set sicherheit = case sicherheit when 'gering' then 'sicher' when 'mittel' then 'nach_massnahme' else 'unsicher' end
where sicherheit in ('gering', 'mittel', 'hoch');

-- ===== Neue Wertebereiche und Vorgaben =====
alter table pruefungen alter column sicherheit set default 'sicher';
alter table objekte alter column sicherheit set default 'sicher';
alter table pruefungen add constraint pruefungen_sicherheit_check check (sicherheit in ('sicher','nach_massnahme','unklar','unsicher'));
alter table objekte add constraint objekte_sicherheit_check check (sicherheit in ('sicher','nach_massnahme','unklar','unsicher'));
alter table pruefungen add constraint pruefungen_dringlichkeit_check check (dringlichkeit in ('keine','sofort','sehr_hoch','hoch','gering','pflege'));
alter table objekte add constraint objekte_dringlichkeit_check check (dringlichkeit in ('keine','sofort','sehr_hoch','hoch','gering','pflege'));

-- Später, wenn alles passt, können die alten Spalten entfernt werden (optional, nicht umkehrbar):
-- alter table pruefungen drop column handlungsbedarf, drop column erledigung_sofort, drop column erledigung_wochen, drop column sicherheit_alt;
-- alter table objekte drop column handlungsbedarf;

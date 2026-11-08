-- Baumkataster v3: im Supabase-Dashboard unter "SQL Editor" einmalig ausführen.
-- Falls eine ältere Version schon eingerichtet wurde, vorher diese Zeile ausführen (löscht alle Daten!):
-- drop table if exists kontrollen, baeume, pruefungen, objekte, objekttypen cascade;

-- ===== Objekttypen: Grundlage für spätere Erweiterung (Zäune, Rasenpflege, ...) =====
-- praefix + zaehler erzeugen die fortlaufende ID (Baum: B-001, B-002, ... B-112).
create table if not exists objekttypen (
  code text primary key,
  bezeichnung text not null,
  praefix text not null unique,
  intervall_monate int not null default 12,
  zaehler int not null default 0
);
insert into objekttypen (code, bezeichnung, praefix, intervall_monate)
  values ('baum', 'Baum', 'B', 12) on conflict (code) do nothing;
-- Später z. B.:  insert into objekttypen (code, bezeichnung, praefix, intervall_monate) values ('zaun','Zaun','Z',12);

-- ===== Objekte (aktuell: Bäume) =====
create table if not exists objekte (
  id uuid primary key default gen_random_uuid(),
  typ text not null references objekttypen(code),
  kennung text not null unique,               -- wird automatisch vergeben, z. B. B-112
  name text not null,                         -- optional bei der Anlage, sonst = Kennung
  art text,                                   -- Baum: Baumart
  strasse text, hausnummer text, plz text, stadt text,
  lat double precision not null,
  lng double precision not null,
  pos_quelle text not null default 'karte' check (pos_quelle in ('adresse','karte','gps')),
  stamm jsonb not null default '{}',          -- typspezifische Stammdaten (Baum: alter_standort, besonderheiten)
  aktuell jsonb not null default '{}',        -- typspezifische Werte der neuesten Prüfung (automatisch)
  sicherheit text not null default 'gering' check (sicherheit in ('gering','mittel','hoch')),
  handlungsbedarf text not null default 'nein',
  pruefer text,
  letzte_pruefung date,
  created_at timestamptz not null default now()
);
create index if not exists objekte_typ_idx on objekte(typ);

-- ===== Prüfungen =====
create table if not exists pruefungen (
  id uuid primary key default gen_random_uuid(),
  objekt_id uuid not null references objekte(id) on delete cascade,
  datum date not null default current_date,
  pruefer text,
  sicherheit text not null default 'gering' check (sicherheit in ('gering','mittel','hoch')),
  handlungsbedarf text not null default 'nein' check (handlungsbedarf in ('ja','nein')),
  massnahmen text,
  anmerkungen text,
  erledigung_sofort boolean not null default false,
  erledigung_wochen text,
  daten jsonb not null default '{}',          -- typspezifisch (Baum: Höhe, Krone, Umfang, Phase, Zustand, Befunde, ...)
  created_at timestamptz not null default now()
);
create index if not exists pruefungen_objekt_idx on pruefungen(objekt_id, datum desc);

-- ===== Automatik 1: ID vergeben, leere Bezeichnung mit ID füllen =====
create or replace function objekt_kennung() returns trigger
language plpgsql security definer set search_path = public as $$
declare p text; z int;
begin
  if new.kennung is null or new.kennung = '' then
    update objekttypen set zaehler = zaehler + 1 where code = new.typ returning praefix, zaehler into p, z;
    if p is null then raise exception 'Unbekannter Objekttyp: %', new.typ; end if;
    new.kennung := p || '-' || lpad(z::text, 3, '0');
  end if;
  if new.name is null or btrim(new.name) = '' then new.name := new.kennung; end if;
  return new;
end $$;
drop trigger if exists objekte_kennung on objekte;
create trigger objekte_kennung before insert on objekte for each row execute function objekt_kennung();

-- ===== Automatik 2: neueste Prüfung bestimmt die aktuellen Werte des Objekts =====
create or replace function sync_objekt() returns trigger
language plpgsql as $$
declare bid uuid := coalesce(new.objekt_id, old.objekt_id); n pruefungen%rowtype;
begin
  select * into n from pruefungen where objekt_id = bid order by datum desc, created_at desc limit 1;
  if found then
    update objekte set aktuell = n.daten, sicherheit = n.sicherheit, handlungsbedarf = n.handlungsbedarf,
      pruefer = n.pruefer, letzte_pruefung = n.datum where id = bid;
  else
    update objekte set aktuell = '{}', sicherheit = 'gering', handlungsbedarf = 'nein',
      pruefer = null, letzte_pruefung = null where id = bid;
  end if;
  return null;
end $$;
drop trigger if exists pruefungen_sync on pruefungen;
create trigger pruefungen_sync after insert or update or delete on pruefungen
  for each row execute function sync_objekt();

-- ===== Zugriff: nur angemeldete Benutzer =====
-- Rechte ausdrücklich vergeben (funktioniert dadurch auch, wenn "Automatically expose new tables" aus ist)
grant usage on schema public to authenticated;
grant select on objekttypen to authenticated;
grant select, insert, update, delete on objekte, pruefungen to authenticated;
revoke all on objekttypen, objekte, pruefungen from anon;
alter table objekttypen enable row level security;
alter table objekte enable row level security;
alter table pruefungen enable row level security;
drop policy if exists "angemeldet: lesen" on objekttypen;
drop policy if exists "angemeldet: alles" on objekte;
drop policy if exists "angemeldet: alles" on pruefungen;
create policy "angemeldet: lesen" on objekttypen for select to authenticated using (true);
create policy "angemeldet: alles" on objekte for all to authenticated using (true) with check (true);
create policy "angemeldet: alles" on pruefungen for all to authenticated using (true) with check (true);

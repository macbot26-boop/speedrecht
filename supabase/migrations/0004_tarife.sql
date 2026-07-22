-- Phase 3 — Tarif-Datenbank.
--
-- Quelle: die offiziellen Produktinformationsblätter (PIB) der Anbieter.
-- § 1 TK-Transparenzverordnung verpflichtet jeden Anbieter, je Tarif genau
-- sechs Geschwindigkeits-Werte zu veröffentlichen (Download & Upload:
-- maximal / normalerweise / minimal) — die Grundlage für "was steht dir
-- vertraglich zu".
--
-- Die Daten sind öffentlich → lesend für alle offen. Geschrieben wird
-- ausschließlich über unser Sammel-Skript (Entwicklungszeit), nie von
-- Nutzern — daher keinerlei Schreibrechte für anon.

create table public.tarife (
  id uuid primary key default gen_random_uuid(),

  anbieter  text not null check (char_length(anbieter)  <= 64),
  slug      text not null check (char_length(slug)      <= 160),
  tarifname text not null check (char_length(tarifname) <= 160),
  zugang    text          check (char_length(zugang)    <= 80),
  technologie text check (
    technologie in ('dsl', 'vdsl', 'glasfaser', 'glasfaser-gfast', 'kabel', 'unbekannt')
  ),

  download_max_mbps    numeric(8,3) not null check (download_max_mbps    between 0 and 100000),
  download_normal_mbps numeric(8,3)          check (download_normal_mbps between 0 and 100000),
  download_min_mbps    numeric(8,3)          check (download_min_mbps    between 0 and 100000),
  upload_max_mbps      numeric(8,3) not null check (upload_max_mbps      between 0 and 100000),
  upload_normal_mbps   numeric(8,3)          check (upload_normal_mbps   between 0 and 100000),
  upload_min_mbps      numeric(8,3)          check (upload_min_mbps      between 0 and 100000),

  monatspreis_eur numeric(7,2) check (monatspreis_eur between 0 and 10000),

  quelle_url    text not null check (char_length(quelle_url) <= 300),
  versionsstand date,
  erfasst_am    timestamptz not null default now(),

  unique (anbieter, slug)
);

comment on table public.tarife is
  'Festnetz-Tarife aus den offiziellen Produktinformationsblättern (§ 1 TK-Transparenzverordnung). Öffentliche Daten.';

alter table public.tarife enable row level security;
revoke all on public.tarife from anon, authenticated;
grant select on public.tarife to anon;

create policy tarife_oeffentlich_lesbar
  on public.tarife for select
  to anon
  using (true);

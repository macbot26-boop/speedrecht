-- Speedrecht — anonyme Messergebnisse (Phase 1)
--
-- Datenschutz-Grundsätze (Produktgesetz):
--   * KEINE IP-Adressen, keine Nutzerkennungen, keine Cookies-IDs.
--   * Nur technische Messwerte + grobe Geräteklasse (OS/Browser).
--   * Schreibzugriff ausschließlich über die RPC-Funktion mit Ingest-Token
--     (das Token liegt NICHT im Repo; es wird separat in ingest_config
--     eingetragen und lebt sonst nur in der Server-Umgebung).

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Selbstauskunft vor der Messung (ein Browser kann das nicht verifizieren)
  connection_declared text not null
    check (connection_declared in ('wifi', 'lan', 'unknown')),

  download_mbps numeric(10, 2) check (download_mbps between 0 and 100000),
  upload_mbps   numeric(10, 2) check (upload_mbps   between 0 and 100000),
  rtt_avg_ms    numeric(10, 2) check (rtt_avg_ms    between 0 and 60000),
  rtt_med_ms    numeric(10, 2) check (rtt_med_ms    between 0 and 60000),

  download_bytes       bigint  check (download_bytes       between 0 and 1000000000000),
  upload_bytes         bigint  check (upload_bytes         between 0 and 1000000000000),
  download_duration_ms integer check (download_duration_ms between 0 and 600000),
  upload_duration_ms   integer check (upload_duration_ms   between 0 and 600000),

  ip_version text check (ip_version in ('v4', 'v6')),

  client_os              text check (char_length(client_os)              <= 64),
  client_os_version      text check (char_length(client_os_version)      <= 64),
  client_browser         text check (char_length(client_browser)         <= 64),
  client_browser_version text check (char_length(client_browser_version) <= 64),
  ias_version            text check (char_length(ias_version)            <= 32),

  -- Gegen welchen Messserver gemessen wurde (z. B. dev.localhost)
  peer text not null check (char_length(peer) <= 253)
);

comment on table public.measurements is
  'Anonyme Speedtest-Ergebnisse (offizielle Messmethodik, eigener Peer). Keine IPs, keine Nutzerkennungen.';

-- Tabelle komplett abriegeln: kein direkter API-Zugriff, keine Policies.
alter table public.measurements enable row level security;
revoke all on public.measurements from anon, authenticated;

-- Ingest-Token-Ablage (einzeilig); Wert wird außerhalb der Migration gesetzt.
create table public.ingest_config (
  singleton boolean primary key default true check (singleton),
  token text not null check (char_length(token) between 32 and 128)
);

alter table public.ingest_config enable row level security;
revoke all on public.ingest_config from anon, authenticated;

-- Einziger Schreibweg: RPC mit Token-Prüfung. SECURITY DEFINER umgeht RLS
-- kontrolliert; die eigentliche Validierung passiert zusätzlich in der App
-- (Route Handler) — die DB-Constraints sind das Sicherheitsnetz.
create or replace function public.insert_measurement(p jsonb, p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_token text;
begin
  select token into v_token from ingest_config where singleton;
  if v_token is null or p_token is distinct from v_token then
    raise exception 'unauthorized';
  end if;

  insert into measurements (
    connection_declared,
    download_mbps, upload_mbps, rtt_avg_ms, rtt_med_ms,
    download_bytes, upload_bytes, download_duration_ms, upload_duration_ms,
    ip_version,
    client_os, client_os_version, client_browser, client_browser_version,
    ias_version, peer
  ) values (
    p->>'connection_declared',
    (p->>'download_mbps')::numeric,
    (p->>'upload_mbps')::numeric,
    (p->>'rtt_avg_ms')::numeric,
    (p->>'rtt_med_ms')::numeric,
    (p->>'download_bytes')::bigint,
    (p->>'upload_bytes')::bigint,
    (p->>'download_duration_ms')::integer,
    (p->>'upload_duration_ms')::integer,
    p->>'ip_version',
    p->>'client_os',
    p->>'client_os_version',
    p->>'client_browser',
    p->>'client_browser_version',
    p->>'ias_version',
    p->>'peer'
  )
  returning id into v_id;

  return v_id;
end
$$;

revoke execute on function public.insert_measurement(jsonb, text) from public;
grant execute on function public.insert_measurement(jsonb, text) to anon;

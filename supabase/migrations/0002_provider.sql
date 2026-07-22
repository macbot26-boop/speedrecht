-- Phase 2 — Anbieter-Erkennung.
--
-- Zwei neue Spalten an den anonymen Messergebnissen:
--   * provider_detected  — serverseitig aus dem Netz der Anfrage erkannt
--                          (nur der Anbietername, z. B. "Vodafone" — nie die IP)
--   * provider_confirmed — vom Nutzer per Tap bestätigte Angabe
--
-- Datenschutz unverändert: keine IPs, keine Nutzerkennungen. Ein
-- Anbietername ist grobkörnig (Millionen Anschlüsse je Anbieter).

alter table public.measurements
  add column provider_detected  text check (char_length(provider_detected)  <= 64),
  add column provider_confirmed text check (char_length(provider_confirmed) <= 64);

-- insert_measurement: nimmt provider_detected zusätzlich entgegen.
-- (Signatur unverändert — bewusst komplette Neufassung statt Patch.)
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
    ias_version, peer,
    provider_detected
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
    p->>'peer',
    p->>'provider_detected'
  )
  returning id into v_id;

  return v_id;
end
$$;

-- Bestätigung des Anbieters: nur mit Ingest-Token, nur einmal pro Messung
-- (write-once) und nur für frische Zeilen — ein alter Messungs-Verweis
-- kann nicht nachträglich umgeschrieben werden.
create or replace function public.confirm_provider(p_id uuid, p_anbieter text, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_geaendert integer;
begin
  select token into v_token from ingest_config where singleton;
  if v_token is null or p_token is distinct from v_token then
    raise exception 'unauthorized';
  end if;

  if p_anbieter is null or char_length(p_anbieter) > 64 then
    return false;
  end if;

  update measurements
     set provider_confirmed = p_anbieter
   where id = p_id
     and provider_confirmed is null
     and created_at > now() - interval '1 hour';

  get diagnostics v_geaendert = row_count;
  return v_geaendert = 1;
end
$$;

revoke execute on function public.confirm_provider(uuid, text, text) from public;
grant execute on function public.confirm_provider(uuid, text, text) to anon;

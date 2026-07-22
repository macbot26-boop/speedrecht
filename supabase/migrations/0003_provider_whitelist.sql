-- Sicherheits-Review-Fund: confirm_provider akzeptierte jeden ≤64-Zeichen-
-- Text — die Whitelist lebte nur in der App. Die DB soll aber laut
-- Grundsatz (0001) das Sicherheitsnetz sein. Diese Fassung prüft die
-- kanonische Liste auch hier.
--
-- Die maßgebliche Liste steht in src/lib/netz/anbieter.ts — diese SQL-Liste
-- ist ihr Spiegel und wird bei Änderungen mitgepflegt.

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

  if p_anbieter is null or p_anbieter not in (
    'Telekom', 'Vodafone', 'o2', '1&1', 'PŸUR',
    'Deutsche Glasfaser', 'NetCologne', 'EWE', 'M-net', 'Sonstiger'
  ) then
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

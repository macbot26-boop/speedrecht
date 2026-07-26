-- Phase 6 — Klicks auf das Wechsel-Angebot.
--
-- Wozu die Tabelle da ist: Die Provision zahlt der Partner, und er zählt auch
-- selbst. Diese Tabelle ist die GEGENRECHNUNG — nur wer weiß, wie viele Klicks
-- hinausgingen, erkennt, ob die Abrechnung des Partners plausibel ist. Und sie
-- beantwortet die Frage, die über das Produkt entscheidet: Wie viele Menschen
-- mit schlechtem Urteil gehen den bezahlten Weg überhaupt?
--
-- Datenschutz-Grundsätze wie überall im Projekt:
--   * KEINE IP-Adressen, keine Nutzerkennungen, keine Cookie-IDs.
--   * Keine Adresse, kein Name, keine Kundennummer — nichts davon berührt
--     diesen Weg.
--   * Schreibzugriff ausschließlich über die RPC-Funktion mit Ingest-Token.

create table public.wechsel_klicks (
  -- KEIN Vorgabewert: Die Kennung erzeugt der Server, weil sie mit zum
  -- Partner geht. Erzeugte die Datenbank sie, wüssten wir hier eine andere
  -- Nummer als die, unter der die Provision später verbucht wird.
  id uuid primary key,
  erfasst_am timestamptz not null default now(),

  -- Anzeigename des Partners, wie er im Ergebnis stand (z. B. "CHECK24").
  -- Steht mit in der Zeile, damit ein späterer Partnerwechsel die alten
  -- Klicks nicht rückwirkend umdeutet.
  partner text not null check (char_length(partner) <= 64),

  -- Der Zusammenhang, aus dem der Klick kam.
  anbieter   text check (char_length(anbieter)   <= 64),
  tarif_slug text check (char_length(tarif_slug) <= 160),
  urteil     text check (urteil in ('gut', 'unter_norm', 'unter_min')),
  download_mbps numeric(10, 2) check (download_mbps between 0 and 100000),

  -- Verweis auf die Messung, die zu dem Klick geführt hat. Beides ist anonym;
  -- die Verbindung macht daraus keine Person, aber sie macht die Trichter-
  -- Rechnung möglich (Messungen → schlechte Urteile → Klicks).
  messung_id uuid references public.measurements(id) on delete set null
);

comment on table public.wechsel_klicks is
  'Klicks auf das Wechsel-Angebot (Affiliate). Anonym: keine IPs, keine Nutzerkennungen. Die id ist zugleich die Unterkennung, die an den Partner geht.';

-- Tabelle komplett abriegeln: kein direkter API-Zugriff, keine Policies.
alter table public.wechsel_klicks enable row level security;
revoke all on public.wechsel_klicks from anon, authenticated;

-- Einziger Schreibweg — dieselbe Bauart wie insert_measurement (0001):
-- SECURITY DEFINER umgeht RLS kontrolliert, das Token prüft die Herkunft,
-- die Spalten-Constraints sind das Sicherheitsnetz hinter der Validierung
-- im Route Handler.
create or replace function public.insert_wechsel_klick(p jsonb, p_token text)
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

  insert into wechsel_klicks (
    id, partner, anbieter, tarif_slug, urteil, download_mbps, messung_id
  ) values (
    (p->>'id')::uuid,
    p->>'partner',
    p->>'anbieter',
    p->>'tarif_slug',
    p->>'urteil',
    (p->>'download_mbps')::numeric,
    (p->>'messung_id')::uuid
  )
  returning id into v_id;

  return v_id;
end
$$;

revoke execute on function public.insert_wechsel_klick(jsonb, text) from public;
grant execute on function public.insert_wechsel_klick(jsonb, text) to anon;

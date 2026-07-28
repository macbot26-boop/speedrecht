"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  PEER_HOST,
  useIasMeasurement,
} from "@/lib/ias/use-ias-measurement";
import type { ConnectionType, IasCompletedKpis } from "@/lib/ias/types";
import { ANBIETER_SONSTIGE, FESTNETZ_ANBIETER } from "@/lib/netz/anbieter";
import tarifDaten from "@/lib/tarife/tarife.generated.json";
import { aufAnzeige, formatMbps } from "@/lib/tarife/anzeige.ts";
import { angebote } from "@/lib/tarife/angebote.ts";
import {
  tarifKlassen,
  tarifVorschlaege,
  type Tarif,
  type TarifDaten,
  type TarifVorschlag,
} from "@/lib/tarife/vorschlag";
import { tarifUrteil, type UrteilTon } from "@/lib/tarife/urteil";
import {
  MINDEST_MESSTAGE,
  MINDEST_MESSUNGEN_UEBLICH,
  vorpruefung,
  type KriteriumName,
  type Messwert,
  type Vorpruefung,
} from "@/lib/tarife/kriterien";
import { urteilsFenster, type Fenster, type VerlaufEintrag } from "@/lib/verlauf/fenster.ts";
import {
  lokalerTag,
  neueKennung,
  verlaufEintragen,
} from "@/lib/verlauf/speicher.ts";
import { MAX_UPLOAD_BYTES } from "@/lib/rechnung/dateipruefung.ts";
import { scanSchritt, type ScanSchritt } from "@/lib/rechnung/scan-fluss.ts";
import { briefBauen, type Verbindung } from "@/lib/brief/text.ts";
import { anschriftZeilen, kontaktFuer } from "@/lib/brief/kontakte.ts";
import { briefHtml, mailtoUrl } from "@/lib/brief/versand.ts";
import { klickPfad } from "@/lib/wechsel/klick.ts";

// Statische Tarif-Tabelle (aus den Produktinformationsblättern erzeugt).
// Der JSON-Import ist strukturell die TarifDaten-Form.
const TARIFE = tarifDaten as TarifDaten;

// Die Verbindungsart wird NICHT vorab abgefragt (Founder-Feedback: kein
// Quiz vor der Messung). Stattdessen: zwei optionale Chips während der
// ~30 Sekunden Messzeit; ohne Antwort gilt ehrlich "unknown".
const VERBINDUNGS_CHIPS: { value: ConnectionType; title: string }[] = [
  { value: "wifi", title: "WLAN" },
  { value: "lan", title: "LAN-Kabel" },
];

// Ohne konfigurierten öffentlichen Messserver (Produktion vor dem
// Server-Anschluss) wäre jede Messung zum Scheitern verurteilt — dann
// lieber ehrlich sagen, was Phase ist, statt einen Fehler zu zeigen.
const OHNE_PEER =
  process.env.NODE_ENV === "production" &&
  (PEER_HOST === "localhost" || PEER_HOST.endsWith(".localhost"));

const PHASE_LABELS: Record<string, string> = {
  loading: "Messtechnik wird geladen …",
  ip: "Verbindung zum Messserver …",
  rtt: "Laufzeit wird gemessen (Ping) …",
  download: "Download läuft — 4 parallele Datenströme",
  upload: "Upload läuft — 4 parallele Datenströme",
};

type SaveState = "idle" | "saving" | "saved" | "failed";

/**
 * Was eine abgeschlossene Messung im Messverlauf ausweist.
 *
 * Erst im Browser gesetzt: Kennung und Uhrzeit gibt es beim Rendern auf dem
 * Server nicht in einer Form, die zum Gerät passt.
 */
interface Messstempel {
  id: string;
  /** Millisekunden seit 1970 (UTC). */
  zeit: number;
  /** Kalendertag "JJJJ-MM-TT" in der lokalen Zeit des Geräts. */
  tag: string;
}

/** Antwort von GET /api/netz — in welchem Netz sind wir gerade? */
interface NetzInfo {
  anbieter: string | null;
  kategorie: "festnetz" | "mobilfunk" | "hosting_vpn" | "unbekannt";
}

// Zusatzsignal mancher Browser (v. a. Android): sind wir im Mobilfunknetz?
// Über useSyncExternalStore eingebunden: hydrationssicher (Server sagt
// immer "nein") und reagiert live auf Netzwechsel.
interface BrowserVerbindung {
  type?: string;
  addEventListener?: (typ: "change", cb: () => void) => void;
  removeEventListener?: (typ: "change", cb: () => void) => void;
}

function browserVerbindung(): BrowserVerbindung | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as { connection?: BrowserVerbindung }).connection;
}

function zellularAbo(callback: () => void): () => void {
  const verbindung = browserVerbindung();
  verbindung?.addEventListener?.("change", callback);
  return () => verbindung?.removeEventListener?.("change", callback);
}

function zellularErkannt(): boolean {
  return browserVerbindung()?.type === "cellular";
}

// Anzeige-Genauigkeit kommt aus @/lib/tarife/anzeige — dieselbe Quelle, auf
// der Urteil und Tarif-Bündelung rechnen.

export function MessungFlow({ wechselPartner }: { wechselPartner: string | null }) {
  const { phase, rttMs, downloadMbps, uploadMbps, result, error, eingeschraenkt, start } =
    useIasMeasurement();
  const [connection, setConnection] = useState<ConnectionType | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [netz, setNetz] = useState<NetzInfo | null>(null);
  const zellular = useSyncExternalStore(zellularAbo, zellularErkannt, () => false);
  const savedForResult = useRef<IasCompletedKpis | null>(null);
  // Kennung, Zeit und Kalendertag dieser einen Messung — zusammen der Stempel,
  // unter dem sie in den Messverlauf des Geräts geht.
  const [stempel, setStempel] = useState<Messstempel | null>(null);
  const gestempeltFor = useRef<IasCompletedKpis | null>(null);

  // Einmal beim Öffnen: In welchem Netz sind wir? (Für Warnhinweise vor der
  // Messung und den Anbieter-Vorschlag nach dem Ergebnis.)
  useEffect(() => {
    let aktiv = true;
    // ?test_ip=… wird nur in der lokalen Entwicklung vom Server beachtet —
    // damit lassen sich alle Anbieter-Fälle ohne echte Anschlüsse durchspielen.
    const testIp = new URLSearchParams(window.location.search).get("test_ip");
    fetch(`/api/netz${testIp ? `?test_ip=${encodeURIComponent(testIp)}` : ""}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((info: NetzInfo | null) => {
        if (aktiv && info) setNetz(info);
      })
      .catch(() => {});
    return () => {
      aktiv = false;
    };
  }, []);

  const mobilfunk = netz?.kategorie === "mobilfunk" || zellular;
  const vpnOderHosting = netz?.kategorie === "hosting_vpn";
  const erkanntFestnetz = netz?.kategorie === "festnetz" ? netz.anbieter : null;

  const begin = useCallback(() => {
    setSaveState("idle");
    setSavedId(null);
    // Verspätete Speicher-Antworten der VORHERIGEN Messung dürfen ab jetzt
    // nichts mehr setzen (sonst hinge die Anbieter-Bestätigung an der
    // falschen Messung).
    savedForResult.current = null;
    // Und die neue Messung bekommt einen eigenen Stempel — sonst liefe sie
    // unter der Kennung der vorherigen und überschriebe sie im Verlauf.
    gestempeltFor.current = null;
    setStempel(null);
    void start();
  }, [start]);

  // Genau einmal je abgeschlossener Messung: Kennung, Zeitpunkt, Kalendertag.
  // Bewusst hier im Effekt und nicht beim Rendern — beides hängt an der Uhr
  // des Geräts, und beim Rendern auf dem Server gäbe es dafür keinen Wert,
  // der zum Browser passt. Bewusst getrennt vom anonymen Speichern weiter
  // unten: Der Messverlauf gehört dem Gerät und darf nicht daran hängen, ob
  // unser Server gerade erreichbar ist.
  useEffect(() => {
    if (phase !== "done" || !result || gestempeltFor.current === result) return;
    gestempeltFor.current = result;
    const jetzt = new Date();
    setStempel({ id: neueKennung(), zeit: jetzt.getTime(), tag: lokalerTag(jetzt) });
  }, [phase, result]);

  // Ein-Tap-Start: Der „Jetzt messen“-Knopf der Startseite verlinkt auf
  // /messung?start=1 — dann geht es hier ohne weiteren Klick los. Der
  // Parameter wird sofort entfernt, damit ein Neuladen nicht ungefragt
  // erneut misst (eine Messung überträgt viele Megabyte).
  const autoGestartet = useRef(false);
  useEffect(() => {
    if (autoGestartet.current || OHNE_PEER) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("start") !== "1") return;
    autoGestartet.current = true;
    params.delete("start");
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (rest ? `?${rest}` : "")
    );
    // Kein kaskadierendes Re-Rendern: Das hier ist die nachgeholte Reaktion
    // auf den einen Nutzer-Tap von der Startseite (?start=1) — einmalig per
    // Ref abgesichert, danach ist der Parameter entfernt.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    begin();
  }, [begin]);

  // Ergebnis anonym speichern, genau einmal pro abgeschlossener Messung.
  //
  // Eine gedrosselte Messung geht NICHT hinaus. Ihre Zahlen sind zu niedrig,
  // und in unserer anonymen Statistik wären sie später von einer echten
  // Störung nicht mehr zu unterscheiden — ein Anbieter sähe dort schlechte
  // Werte, die in Wahrheit sein Netz nie berührt haben.
  useEffect(() => {
    if (phase !== "done" || !result || eingeschraenkt || savedForResult.current === result)
      return;
    savedForResult.current = result;
    setSaveState("saving");
    fetch("/api/messungen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connection_declared: connection ?? "unknown",
        download_mbps: result.download_rate_avg_mbps,
        upload_mbps: result.upload_rate_avg_mbps,
        rtt_avg_ms: result.rtt_avg,
        rtt_med_ms: result.rtt_med,
        download_bytes: result.download_data,
        upload_bytes: result.upload_data,
        download_duration_ms: result.download_duration,
        upload_duration_ms: result.upload_duration,
        ip_version: result.ip_version,
        client_os: result.client_os,
        client_os_version: result.client_os_version,
        client_browser: result.client_browser,
        client_browser_version: result.client_browser_version,
        ias_version: result.client_ias_version,
        peer: PEER_HOST,
      }),
    })
      .then(async (res) => {
        if (savedForResult.current !== result) return; // veraltete Antwort
        if (!res.ok) {
          setSaveState("failed");
          return;
        }
        // Die Antwort enthält die anonyme Messungs-Nummer — sie brauchen
        // wir gleich für die Ein-Tap-Anbieterbestätigung.
        const data: unknown = await res.json().catch(() => null);
        const id =
          data && typeof data === "object" && "id" in data && typeof data.id === "string"
            ? data.id
            : null;
        setSavedId(id);
        setSaveState("saved");
      })
      .catch(() => {
        if (savedForResult.current !== result) return; // veraltete Antwort
        setSaveState("failed");
      });
  }, [phase, result, connection, eingeschraenkt]);

  // ---- Testphase ohne öffentlichen Messserver: ehrlich sagen, statt in
  // einen sicheren Fehler laufen zu lassen. ----
  if (OHNE_PEER) {
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Der Messserver ist noch nicht angeschlossen
        </h1>
        <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Du bist ganz früh dabei: In dieser privaten Testphase steht der
          öffentliche Messserver noch nicht bereit — Messungen sind deshalb
          hier noch nicht möglich. Sobald er angeschlossen ist, geht es an
          dieser Stelle mit einem Tap los.
        </p>
        <p className="max-w-md text-xs leading-5 text-zinc-500">
          Gemessen wird dann mit der offiziellen Open-Source-Messmethodik der
          Breitbandmessung gegen unseren eigenen Server — Ergebnisse sind ein
          Indiz, rechtsgültige Nachweise erzeugt nur die offizielle
          Desktop-App.
        </p>
      </div>
    );
  }

  // ---- Schritt 1: ein Tap, sonst nichts ----
  if (phase === "idle") {
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Bereit? Ein Tap genügt.
          </h1>
          <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
            Die Messung dauert etwa eine halbe Minute und überträgt dabei
            einige Megabyte — am besten nicht im Datentarif.
          </p>
        </div>
        {vpnOderHosting && (
          <Warnkarte titel="VPN oder Firmennetz erkannt.">
            Deine Verbindung läuft gerade über ein Rechenzentrum (z. B. VPN,
            iCloud Privat-Relay oder Firmennetz). So misst du das VPN — nicht
            deinen Anschluss. Am besten kurz ausschalten und neu laden; messen
            kannst du trotzdem.
          </Warnkarte>
        )}
        {mobilfunk && (
          <Warnkarte titel="Mobilfunk erkannt.">
            Du bist gerade über das Handynetz unterwegs (z. B. Hotspot). Über
            Mobilfunk sagt die Messung nichts über deinen Festnetzanschluss
            aus. Für den Anschluss-Check: zu Hause ins WLAN oder ans Kabel.
          </Warnkarte>
        )}
        <button
          onClick={begin}
          className="rounded-full bg-[#0b57d0] px-10 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          Messung starten
        </button>
        <p className="max-w-md text-xs leading-5 text-zinc-500">
          Gemessen wird mit der offiziellen Open-Source-Messmethodik der
          Breitbandmessung (4 parallele Datenströme, 10-Sekunden-Fenster) gegen
          unseren eigenen Messserver. Ergebnisse sind ein Indiz — rechtsgültige
          Nachweise erzeugt nur die offizielle Desktop-App.
        </p>
      </div>
    );
  }

  // ---- Fehler ----
  if (phase === "error") {
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Die Messung hat nicht geklappt
        </h1>
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error?.message}
        </p>
        <button
          onClick={begin}
          className="rounded-full bg-[#0b57d0] px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Nochmal versuchen
        </button>
      </div>
    );
  }

  // ---- Schritt 3: Ergebnis ----
  if (phase === "done" && result) {
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Dein Ergebnis
        </h1>

        {/* Bewusst GANZ oben, noch vor den drei Zahlen: Gedrosselt ist nicht
            das Urteil falsch, sondern schon die Messung. Wer erst unten
            erführe, dass die 12 Mbit/s nie stimmten, hätte sie längst
            geglaubt. */}
        {eingeschraenkt && (
          <Warnkarte titel="Unter eingeschränkten Bedingungen gemessen.">
            Dieser Tab lief im Hintergrund — dann bremst der Browser die Seite
            aus, und die Zahlen fallen zu niedrig aus, vor allem der Ping. Du
            siehst das Ergebnis trotzdem, aber es zählt nicht: Es geht weder in
            deine Messreihe noch in das Schreiben an deinen Anbieter, und
            gespeichert wird es auch nicht. Miss noch einmal, während die Seite
            im Vordergrund ist.
          </Warnkarte>
        )}

        <div className="grid w-full grid-cols-3 gap-3">
          <ResultCard
            label="Download"
            value={formatMbps(
              typeof result.download_rate_avg_mbps === "number"
                ? result.download_rate_avg_mbps
                : null
            )}
            unit="Mbit/s"
          />
          <ResultCard
            label="Upload"
            value={formatMbps(
              typeof result.upload_rate_avg_mbps === "number"
                ? result.upload_rate_avg_mbps
                : null
            )}
            unit="Mbit/s"
          />
          <ResultCard
            label="Ping"
            value={
              typeof result.rtt_med === "number"
                ? result.rtt_med.toFixed(0)
                : "–"
            }
            unit="ms"
          />
        </div>

        {/* Vertrag vs. Realität: benannter Tarif + Klartext-Urteil */}
        <TarifClaim
          anbieter={erkanntFestnetz}
          gemessenMbps={
            typeof result.download_rate_avg_mbps === "number"
              ? result.download_rate_avg_mbps
              : null
          }
          connection={connection}
          wechselPartner={wechselPartner}
          messungId={savedId}
          stempel={stempel}
          eingeschraenkt={eingeschraenkt}
        />

        {/* Ehrlichkeits-Labels — Produktgesetz, nicht verhandelbar */}
        <div className="flex w-full flex-col gap-2 text-left">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <span className="font-semibold">Indiz, kein Rechtsbeweis.</span>{" "}
            Gemessen mit der offiziellen Messmethodik, aber gegen unseren
            eigenen Server. Vor Gericht zählt nur die offizielle{" "}
            <a
              href="https://breitbandmessung.de"
              className="underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            >
              Breitbandmessung
            </a>{" "}
            der Bundesnetzagentur.
          </div>
          {connection === "wifi" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <span className="font-semibold">Über WLAN gemessen.</span> Dieser
              Wert enthält dein Heim-WLAN — es kann dein Internet ausbremsen,
              ohne dass dein Anbieter etwas dafür kann. Für einen belastbaren
              Wert: einmal per LAN-Kabel messen.
            </div>
          )}
          {(connection === "unknown" || connection === null) && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              Verbindungsart unbekannt — falls du über WLAN gemessen hast, kann
              dein Heim-WLAN das Ergebnis beeinflussen.
            </div>
          )}
          {connection === "lan" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              <span className="font-semibold">Per Kabel gemessen</span> — die
              aussagekräftigste Art, im Browser zu messen.
            </div>
          )}
          {vpnOderHosting && (
            <Warnkarte titel="Über VPN/Firmennetz gemessen.">
              Das Ergebnis kann durch den Umweg verfälscht sein — für einen
              Anschluss-Check bitte ohne VPN messen.
            </Warnkarte>
          )}
          {mobilfunk && (
            <Warnkarte titel="Über Mobilfunk gemessen.">
              Dieses Ergebnis beschreibt das Handynetz, nicht deinen
              Festnetzanschluss.
            </Warnkarte>
          )}
        </div>

        <AnbieterBestaetigung erkannt={erkanntFestnetz} messungId={savedId} />

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={begin}
            className="rounded-full bg-[#0b57d0] px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Nochmal messen
          </button>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {saveState === "saved" &&
              "Ergebnis anonym gespeichert (ohne IP-Adresse)."}
            {saveState === "saving" && "Ergebnis wird gespeichert …"}
            {saveState === "failed" &&
              "Ergebnis konnte nicht gespeichert werden — deine Messung oben bleibt davon unberührt."}
          </p>
        </div>
      </div>
    );
  }

  // ---- Schritt 2: Messung läuft ----
  const liveValue =
    phase === "upload"
      ? uploadMbps
      : phase === "download"
        ? downloadMbps
        : null;

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Messung läuft …
      </h1>

      <div className="flex flex-col items-center gap-1">
        <p className="font-mono text-6xl font-semibold tabular-nums text-[#0b57d0] dark:text-blue-400">
          {phase === "rtt"
            ? (rttMs !== null ? rttMs.toFixed(0) : "–")
            : formatMbps(liveValue)}
        </p>
        <p className="text-sm text-zinc-500">
          {phase === "rtt" ? "ms" : "Mbit/s"}
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <p
          className="text-sm font-medium text-zinc-600 dark:text-zinc-300"
          aria-live="polite"
        >
          {PHASE_LABELS[phase] ?? "…"}
        </p>
        <div className="flex gap-2" aria-hidden>
          {(["ip", "rtt", "download", "upload"] as const).map((p) => (
            <span
              key={p}
              className={`h-1.5 w-10 rounded-full transition ${
                phase === p
                  ? "animate-pulse bg-[#0b57d0] dark:bg-blue-400"
                  : "bg-zinc-200 dark:bg-zinc-800"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Optionale Selbstauskunft — genau in der Wartezeit, wo sie nicht stört */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Nebenbei: Wie ist dieses Gerät mit dem Router verbunden?
        </p>
        <div className="flex gap-2">
          {VERBINDUNGS_CHIPS.map((chip) => (
            <button
              key={chip.value}
              onClick={() => setConnection(chip.value)}
              aria-pressed={connection === chip.value}
              className={
                connection === chip.value
                  ? "rounded-full bg-[#0b57d0] px-5 py-2 text-sm font-semibold text-white"
                  : "rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 transition hover:border-[#0b57d0] hover:text-[#0b57d0] dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-blue-400 dark:hover:text-blue-400"
              }
            >
              {chip.title}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Keine Angabe? Kein Problem — der Hinweis kommt mit dem Ergebnis.
        </p>
      </div>

      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Bitte lass diese Seite offen — die Messung dauert etwa 30 Sekunden.
      </p>
    </div>
  );
}

function Warnkarte({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <span className="font-semibold">{titel}</span> {children}
    </div>
  );
}

// „Dein Netz: Vodafone — stimmt das?“ — Ein-Tap-Bestätigung des Anbieters.
// Erscheint nur, wenn das Ergebnis gespeichert wurde (sonst gibt es nichts,
// woran die Bestätigung hängen könnte).
function AnbieterBestaetigung({
  erkannt,
  messungId,
}: {
  erkannt: string | null;
  messungId: string | null;
}) {
  const [status, setStatus] = useState<
    "offen" | "liste" | "sendet" | "fertig" | "fehler"
  >("offen");
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);

  if (!messungId) return null;

  const bestaetigen = (anbieter: string) => {
    setGewaehlt(anbieter);
    setStatus("sendet");
    fetch("/api/messungen/bestaetigen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: messungId, anbieter }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { ok?: boolean } | null) =>
        setStatus(data?.ok ? "fertig" : "fehler")
      )
      .catch(() => setStatus("fehler"));
  };

  if (status === "fertig") {
    return (
      <p className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm leading-6 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        ✓ Danke — <span className="font-semibold">{gewaehlt}</span> als dein
        Anbieter vermerkt (weiterhin anonym).
      </p>
    );
  }
  if (status === "fehler") {
    return (
      <p className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        Dein Anbieter konnte gerade nicht vermerkt werden — für deine Messung
        oben ändert das nichts.
      </p>
    );
  }

  const listeZeigen = status === "liste" || !erkannt;

  return (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-left dark:border-zinc-800 dark:bg-zinc-950">
      {listeZeigen ? (
        <>
          <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold">Wer ist dein Internetanbieter?</span>{" "}
            Ein Tap genügt — das hilft, Messungen je Anbieter einzuordnen
            (weiterhin anonym).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[...FESTNETZ_ANBIETER, ANBIETER_SONSTIGE].map((anbieter) => (
              <button
                key={anbieter}
                disabled={status === "sendet"}
                onClick={() => bestaetigen(anbieter)}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-[#0b57d0] hover:text-[#0b57d0] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-blue-400 dark:hover:text-blue-400"
              >
                {anbieter}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold">Dein Netz: {erkannt}.</span> Ist das
            dein Internetanbieter?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={status === "sendet"}
              onClick={() => erkannt && bestaetigen(erkannt)}
              className="rounded-full bg-[#0b57d0] px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              Ja, mein Anbieter
            </button>
            <button
              disabled={status === "sendet"}
              onClick={() => setStatus("liste")}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-[#0b57d0] hover:text-[#0b57d0] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-blue-400 dark:hover:text-blue-400"
            >
              Nein, anderer …
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function preisFormat(eur: number): string {
  return eur.toFixed(2).replace(".", ",");
}

// Balken: gemessene Rate als Füllung, Marken für Minimum + normalerweise,
// rechtes Ende = beworbene "bis-zu"-Rate. Farbe folgt dem Urteil.
function TarifDeltaBalken({
  tarif,
  gemessenMbps,
  ton,
}: {
  tarif: Tarif;
  gemessenMbps: number;
  ton: UrteilTon;
}) {
  const max = tarif.download_max_mbps;
  // Ohne sinnvolle Obergrenze kein Balken (schützt vor Division durch 0).
  if (!(max > 0)) return null;
  const anteil = (wert: number) => Math.max(0, Math.min(100, (wert / max) * 100));
  const breite = anteil(gemessenMbps);
  const fuellFarbe =
    ton === "gut"
      ? "bg-emerald-500"
      : ton === "unter_min"
        ? "bg-red-500"
        : "bg-amber-500";
  const marken = [
    tarif.download_min_mbps != null
      ? {
          pos: anteil(tarif.download_min_mbps),
          label: `Minimum ${formatMbps(tarif.download_min_mbps)}`,
        }
      : null,
    tarif.download_normal_mbps != null
      ? {
          pos: anteil(tarif.download_normal_mbps),
          label: `Normalerweise ${formatMbps(tarif.download_normal_mbps)}`,
        }
      : null,
  ].filter((m): m is { pos: number; label: string } => m !== null);

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex justify-between text-xs font-medium text-zinc-500">
        <span>Du bekommst</span>
        <span>Bestellt: bis zu {formatMbps(max)} Mbit/s</span>
      </div>
      <div className="relative h-10 rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
        <div
          className={`absolute inset-y-0 left-0 flex min-w-[46px] items-center justify-end rounded-lg pr-2.5 text-sm font-bold tabular-nums text-white ${fuellFarbe}`}
          style={{ width: `${breite}%` }}
        >
          {formatMbps(gemessenMbps)}
        </div>
        {marken.map((m) => (
          <div
            key={m.label}
            className="absolute -bottom-0.5 -top-0.5 w-0.5 rounded bg-zinc-500/60"
            style={{ left: `${m.pos}%` }}
            aria-hidden
          />
        ))}
      </div>
      {marken.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-zinc-400">
          {marken.map((m) => (
            <span key={m.label} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-0.5 rounded bg-zinc-400/70" aria-hidden />
              {m.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Vertrag vs. Realität: erkannter Anbieter → Ein-Tap-Tarifwahl →
// benannter Tarif mit Klartext-Urteil. Rein anzeigend (keine Speicherung).
function TarifClaim({
  anbieter,
  gemessenMbps,
  connection,
  wechselPartner,
  messungId,
  stempel,
  eingeschraenkt,
}: {
  anbieter: string | null;
  gemessenMbps: number | null;
  connection: ConnectionType | null;
  wechselPartner: string | null;
  messungId: string | null;
  stempel: Messstempel | null;
  eingeschraenkt: boolean;
}) {
  const [gewaehlt, setGewaehlt] = useState<Tarif | null>(null);
  const [alleZeigen, setAlleZeigen] = useState(false);
  // Stufe 2: Verträge einer Klasse, die verschieden heißen. Erst gesetzt, wenn
  // die Klasse mehrere Namen führt — sonst bliebe die Auswahl bei einem Tap.
  const [namensWahl, setNamensWahl] = useState<Tarif[] | null>(null);
  const [scanOffen, setScanOffen] = useState(false);
  // Gesetzt, sobald ein Vertrag aus einer gescannten Rechnung stammt. Der
  // Anbieter daraus schlägt den aus der IP-Erkennung: Auf der Rechnung steht,
  // mit wem der Vertrag besteht — die IP sagt nur, in wessen Netz gerade
  // gemessen wurde, und das können zwei verschiedene sein.
  const [ausRechnung, setAusRechnung] = useState<{
    anbieter: string;
    konflikt: string | null;
  } | null>(null);
  // Rein durchgereicht in den Kulanz-Brief. Bewusst getrennt von `ausRechnung`
  // gehalten: Die Kundennummer sagt nichts über den Tarif und darf an keiner
  // Stelle in die Tarifbestimmung geraten.
  const [kundennummerAusRechnung, setKundennummerAusRechnung] = useState<string | null>(null);
  // Das gescannte Rechnungsbild, nur im Arbeitsspeicher dieses Tabs. Es geht
  // NUR dann ein zweites Mal hinaus, wenn der Nutzer beim Brief ausdrücklich
  // einwilligt; beim Schließen der Seite ist es weg.
  const [rechnungsBild, setRechnungsBild] = useState<File | null>(null);
  // Der Messverlauf dieses Geräts, so weit er den gewählten Tarif betrifft.
  // Leer, solange kein Vertrag steht — vorher wüssten wir nicht, zu welchem
  // Produktinformationsblatt die Messung gehört.
  const [verlauf, setVerlauf] = useState<VerlaufEintrag[]>([]);

  /**
   * Der eine Weg, auf dem ein Vertrag gewählt wird — aus der Liste, aus der
   * Namensfrage oder aus einem Rechnungs-Scan.
   *
   * Dass die Messung hier in den Verlauf geht und nicht in einem Effekt
   * daneben, ist Absicht: Erst mit dem Vertrag steht fest, gegen welches
   * Produktinformationsblatt gemessen wurde — die Wahl IST das Ereignis.
   *
   * Korrigiert der Nutzer den Vertrag später, läuft das hier erneut, aber
   * unter derselben Kennung: Er hat nicht neu gemessen, dieselbe Messung
   * gehört nur zu einem anderen Vertrag.
   *
   * Eine gedrosselte Messung bleibt draussen. Eine Messreihe entscheidet
   * später darüber, ob jemand seinen Anbieter anschreibt — eine Zahl, von der
   * wir wissen, dass der Browser sie verdorben hat, darf da nicht hinein.
   */
  const tarifWaehlen = (tarif: Tarif) => {
    setGewaehlt(tarif);
    if (eingeschraenkt || !stempel || gemessenMbps == null || gemessenMbps <= 0) return;
    setVerlauf(
      verlaufEintragen({
        id: stempel.id,
        mbps: gemessenMbps,
        tag: stempel.tag,
        zeit: stempel.zeit,
        tarifSlug: tarif.slug,
        verbindung: connection ?? "unknown",
      })
    );
  };

  // "ändern" im Ergebnis fängt von vorn an; "zurück" aus der Namensfrage
  // behält dagegen die geöffnete Vollliste — wer sich durch 66 Vodafone-Knöpfe
  // gescrollt hat, will nach einem Fehlgriff nicht wieder oben anfangen.
  const zurueckZurAuswahl = () => {
    setGewaehlt(null);
    setNamensWahl(null);
    setAlleZeigen(false);
    setScanOffen(false);
    // NUR was die Tarifbestimmung betrifft, wird zurückgesetzt. Kundennummer
    // und Rechnungsbild bleiben: Sie sind Tatsachen über die Rechnung des
    // Nutzers und ändern sich nicht dadurch, dass er den Tarif korrigiert.
    // Würden sie mitfliegen, müsste jemand, der einmal den falschen Vertrag
    // erwischt hat, für den Brief dieselbe Rechnung noch einmal fotografieren.
    // Das Bild verlässt das Gerät dabei nicht — es geht nur bei ausdrücklicher
    // Einwilligung ein zweites Mal hinaus.
    setAusRechnung(null);
  };
  const zurueckAusNamensfrage = () => setNamensWahl(null);

  // Eine Klasse aus dem Scan geht denselben Weg wie ein Tap in der Auswahl:
  // ein Name darin heißt fertig, mehrere heißen Stufe 2. Sonst stünde nach
  // einem Scan ein Vertragsname im Ergebnis, den der Nutzer nie bestellt hat
  // — genau der Fehler, den die zweistufige Auswahl behoben hat.
  const klasseUebernehmen = (klasse: TarifVorschlag) => {
    setScanOffen(false);
    if (klasse.namensWahl.length <= 1) tarifWaehlen(klasse.tarif);
    else setNamensWahl(klasse.namensWahl);
  };

  if (!anbieter || gemessenMbps == null || gemessenMbps <= 0) return null;

  const anzeigeAnbieter = ausRechnung?.anbieter ?? anbieter;
  const konfliktWarnung = ausRechnung?.konflikt ? (
    <Warnkarte titel="Rechnung und Messung passen nicht zusammen.">
      {ausRechnung.konflikt} Das Urteil unten vergleicht dann zwei verschiedene
      Anschlüsse.
    </Warnkarte>
  ) : null;

  if (scanOffen) {
    return (
      <RechnungScan
        netzAnbieter={anbieter}
        onKlasse={(klasse, gelesenerAnbieter, konflikt, gelesenKundennummer) => {
          setAusRechnung({ anbieter: gelesenerAnbieter, konflikt });
          setKundennummerAusRechnung(gelesenKundennummer);
          klasseUebernehmen(klasse);
        }}
        onAnbieterOhneTarif={(gelesenerAnbieter, konflikt, gelesenKundennummer) => {
          setAusRechnung({ anbieter: gelesenerAnbieter, konflikt });
          setKundennummerAusRechnung(gelesenKundennummer);
          setScanOffen(false);
        }}
        onBild={setRechnungsBild}
        onAbbruch={() => setScanOffen(false)}
      />
    );
  }

  const vorschlaege = tarifVorschlaege(TARIFE, anzeigeAnbieter, gemessenMbps);

  // Anbieter erkannt, aber (noch) keine Tarife hinterlegt (Anbieter, deren
  // Tabelle noch nicht eingepflegt ist) — ehrlich sagen statt leerer Auswahl.
  if (vorschlaege.length === 0) {
    return (
      <div className="flex w-full flex-col gap-3">
        {konfliktWarnung}
        <div className="w-full rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-left text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          Für{" "}
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{anzeigeAnbieter}</span>{" "}
          haben wir die Tarife noch nicht hinterlegt — der direkte Vergleich mit deinem Vertrag
          kommt bald.
        </div>
      </div>
    );
  }

  // --- Stufe 2: die Klasse steht, aber sie führt mehrere Vertragsnamen ---
  // Ohne diese Rückfrage stünde der kürzeste Name der Klasse im Ergebnis und
  // später im Kulanz-Brief — auch bei dem, der einen anderen bestellt hat.
  if (!gewaehlt && namensWahl) {
    return (
      <div className="flex w-full flex-col gap-3">
        {konfliktWarnung}
        <div className="w-full rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-left dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold">Fast geschafft.</span> Diese Geschwindigkeit gibt es bei{" "}
            {anzeigeAnbieter} unter mehreren Namen. Welcher steht auf deiner Rechnung?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {namensWahl.map((tarif) => (
              <button
                key={tarif.slug}
                onClick={() => tarifWaehlen(tarif)}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-[#0b57d0] hover:text-[#0b57d0] dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-blue-400 dark:hover:text-blue-400"
              >
                {tarif.tarifname}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            Alle liefern dieselben zugesicherten Werte — dein Ergebnis ist also dasselbe. Der Name
            entscheidet nur, welcher Vertrag später im Schreiben an {anzeigeAnbieter} steht.{" "}
            <button
              onClick={zurueckAusNamensfrage}
              className="text-[#0b57d0] underline underline-offset-2 dark:text-blue-400"
            >
              zurück
            </button>
          </p>
        </div>
      </div>
    );
  }

  // --- Stufe 1: Geschwindigkeits-Klasse per Tap ---
  if (!gewaehlt) {
    const optionen = alleZeigen ? tarifKlassen(TARIFE, anzeigeAnbieter) : vorschlaege;
    return (
      <div className="flex w-full flex-col gap-3">
        {konfliktWarnung}
        <div className="w-full rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-left dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
            {ausRechnung ? (
              <>
                <span className="font-semibold">Deine Rechnung: {anzeigeAnbieter}.</span> Den
                Vertragsnamen konnten wir darauf nicht finden — welcher Tarif ist deiner?
              </>
            ) : (
              <>
                <span className="font-semibold">Dein Netz: {anzeigeAnbieter}.</span> Welcher Tarif
                ist deiner? Ein Tap zeigt dir, ob du bekommst, wofür du zahlst.
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {optionen.map((v) => (
              <KlassenKnopf
                key={v.tarif.slug}
                klasse={v}
                // Ein Name in der Klasse: fertig. Mehrere: erst fragen, welcher
                // — raten würde hier einen fremden Vertrag ins Ergebnis setzen.
                onClick={() =>
                  v.namensWahl.length === 1 ? tarifWaehlen(v.tarif) : setNamensWahl(v.namensWahl)
                }
              />
            ))}
            {!alleZeigen && (
              <button
                onClick={() => setAlleZeigen(true)}
                className="rounded-full px-4 py-2 text-sm font-medium text-[#0b57d0] underline underline-offset-2 dark:text-blue-400"
              >
                Meiner ist nicht dabei …
              </button>
            )}
          </div>

          {/* Die Abkürzung — bewusst UNTER der Auswahl, nicht darüber: Wie gut
              der Scan auf echten Handyfotos liest, ist noch nicht gemessen.
              Solange das offen ist, bleibt der bewährte Weg der erste. */}
          {!ausRechnung && (
            <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <button
                onClick={() => setScanOffen(true)}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-[#0b57d0] hover:text-[#0b57d0] dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-blue-400 dark:hover:text-blue-400"
              >
                📄 Rechnung scannen
              </button>
              <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">
                findet deinen Tarif automatisch
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Tarif gewählt: benannter Vertrag + Delta-Balken + Klartext-Urteil ---
  const ton = tarifUrteil(gewaehlt, gemessenMbps);
  const urteilStil =
    ton === "gut"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
      : ton === "unter_min"
        ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200";

  const claim =
    ton === "gut" ? (
      <>
        <span className="font-bold">Passt zu deinem Tarif.</span> {gewaehlt.tarifname} liefert, was es
        verspricht.
      </>
    ) : ton === "unter_min" ? (
      <>
        <span className="font-bold">Das passt nicht zu deinem Tarif.</span> Bei {gewaehlt.tarifname}{" "}
        sind mindestens {formatMbps(gewaehlt.download_min_mbps)} Mbit/s zugesichert — gemessen:{" "}
        {formatMbps(gemessenMbps)}.
      </>
    ) : (
      <>
        <span className="font-bold">Das passt nicht zu dem, was du bestellt hast.</span> Bei{" "}
        {gewaehlt.tarifname} sollten normalerweise {formatMbps(gewaehlt.download_normal_mbps)} Mbit/s
        anliegen — bei dir kommen {formatMbps(gemessenMbps)} an.
      </>
    );

  return (
    <div className="flex w-full flex-col gap-3">
      {konfliktWarnung}
      <div className="flex w-full flex-col gap-4 rounded-2xl border border-zinc-200 bg-white px-5 py-5 text-left dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-0.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            Dein bestellter Tarif
            {ausRechnung && " · von deiner Rechnung gelesen"}
          </div>
          <div className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            {gewaehlt.tarifname}{" "}
            <span className="font-normal text-zinc-400">· {anzeigeAnbieter}</span>
          </div>
          <div className="text-xs text-zinc-500">
            bis zu {formatMbps(gewaehlt.download_max_mbps)} Mbit/s
            {gewaehlt.monatspreis_eur != null &&
              ` · ${preisFormat(gewaehlt.monatspreis_eur)} €/Monat`}
            <button
              onClick={zurueckZurAuswahl}
              className="ml-2 text-[#0b57d0] underline underline-offset-2 dark:text-blue-400"
            >
              ändern
            </button>
          </div>
        </div>

        <TarifDeltaBalken tarif={gewaehlt} gemessenMbps={gemessenMbps} ton={ton} />

        <div className={`rounded-xl border px-4 py-3 text-sm leading-6 ${urteilStil}`}>{claim}</div>

        {/* Passt alles, gibt es nichts zu TUN — die Leiter bleibt weg. An ihre
            Stelle tritt die Preis-Einordnung, und zwar nur, wenn ein Partner
            eingerichtet ist: Ein Regal ohne Weg zum Vergleich wäre eine
            Sackgasse, genau wie der tote Knopf, den die vierte Stufe vermeidet.

            Nie beides auf einem Schirm — bei schlechtem Urteil steckt dasselbe
            Regal schon in der vierten Stufe. Zwei Werbeblöcke untereinander
            machten aus der Leiter eine Verkaufsstrecke.

            Und bei gedrosselter Messung tritt an die Stelle der Leiter der
            eine Schritt, der jetzt zählt: noch einmal messen. */}
        {ton !== "gut" ? (
          eingeschraenkt ? (
            <NochmalImVordergrund />
          ) : (
            <WieEsWeitergeht
              tarif={gewaehlt}
              gemessenMbps={gemessenMbps}
              connection={connection}
              kundennummerAusRechnung={kundennummerAusRechnung}
              rechnungsBild={rechnungsBild}
              ton={ton}
              wechselPartner={wechselPartner}
              messungId={messungId}
              fenster={urteilsFenster(verlauf, gewaehlt.slug)}
              heute={stempel?.tag ?? null}
            />
          )
        ) : (
          wechselPartner && (
            <PreisEinordnung
              partner={wechselPartner}
              tarif={gewaehlt}
              gemessenMbps={gemessenMbps}
              ton={ton}
              messungId={messungId}
            />
          )
        )}
      </div>
    </div>
  );
}

/**
 * Was nach einer gedrosselten Messung zu tun ist — anstelle der Handlungsleiter.
 *
 * Die Leiter fehlt hier mit Absicht: Jede ihrer Stufen baut auf der gemessenen
 * Zahl auf. Wer wegen einer Zahl, die der Browser verdorben hat, sein Gerät ans
 * LAN-Kabel schleppt, verliert einen Abend; wer deswegen seinen Anbieter
 * anschreibt, blamiert sich. Also erst die saubere Messung, dann der nächste
 * Schritt — es ist nur ein Tap.
 */
function NochmalImVordergrund() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-left dark:border-amber-900 dark:bg-amber-950">
      <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
        Was jetzt zu tun ist
      </div>
      <p className="text-sm leading-6 text-amber-900 dark:text-amber-200">
        <span className="font-semibold">Miss noch einmal — mit dieser Seite im Vordergrund.</span>{" "}
        Erst dann sagt die Zahl etwas über deine Leitung. Wie es weitergeht, zeigen wir dir
        danach: Für ein Schreiben an deinen Anbieter taugt diese Messung nicht.
      </p>
    </div>
  );
}

/**
 * Der ehrliche nächste Schritt nach einem schlechten Urteil.
 *
 * Ohne diesen Abschnitt endet das Ergebnis mit "das passt nicht zu deinem
 * Tarif" und lässt den Nutzer stehen. Die Leiter nennt den billigsten Schritt
 * zuerst — ein langsames WLAN sieht genauso aus wie eine langsame Leitung, und
 * wer deswegen seinen Anbieter anschreibt, blamiert sich — und führt dann zu
 * dem einzigen Weg, der rechtlich zählt.
 *
 * Die Schwellen stammen aus `vorpruefung()`, nicht aus einer zweiten Rechnung
 * an dieser Stelle: Was hier als Ziel steht, muss dasselbe sein, woran später
 * gemessen wird.
 */
function WieEsWeitergeht({
  tarif,
  gemessenMbps,
  connection,
  kundennummerAusRechnung,
  rechnungsBild,
  ton,
  wechselPartner,
  messungId,
  fenster,
  heute,
}: {
  tarif: Tarif;
  gemessenMbps: number;
  connection: ConnectionType | null;
  kundennummerAusRechnung: string | null;
  rechnungsBild: File | null;
  ton: UrteilTon;
  wechselPartner: string | null;
  messungId: string | null;
  fenster: Fenster;
  heute: string | null;
}) {
  // Die gerade gemessene Zahl steht IMMER im Urteil — auch wenn der Verlauf
  // leer ist. Das ist kein Sonderfall, sondern zwei ganz normale Lagen: Im
  // privaten Modus mancher Browser lässt sich nichts speichern, und im ersten
  // Bild nach der Vertragswahl hat der Verlauf noch nicht geschrieben.
  // Ohne diesen Rückfall stünde dort kurz "0 Messungen".
  const werte: Messwert[] =
    fenster.werte.length > 0
      ? fenster.werte
      : [{ mbps: gemessenMbps, tag: heute ?? "einzelmessung" }];
  const pruefung = vorpruefung(tarif, werte);
  const schwelle = (name: KriteriumName) =>
    pruefung.kriterien.find((k) => k.name === name)?.referenzMbps ?? null;
  const schwelle90 = schwelle("90_prozent");
  const schwelleNormal = schwelle("ueblich");
  const schwelleMin = schwelle("minimum");

  // Bei "lan" ist die billige Erklärung schon ausgeschlossen; dann beginnt die
  // Leiter direkt beim Brief an den Anbieter.
  const kabelSchrittNoetig = connection !== "lan";
  // Fortlaufend gezählt, statt an jeder Stufe die Nummer auszurechnen: Sobald
  // eine Stufe wegfällt, verschieben sich alle dahinter — von Hand gepflegte
  // Nummern liefen dabei irgendwann auseinander.
  let nummer = 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
        Wie es weitergeht
      </div>

      <ol className="flex flex-col gap-3">
        {kabelSchrittNoetig && (
          <Stufe nummer={++nummer} titel="Erst per Kabel gegenprüfen">
            Ein langsames WLAN sieht genauso aus wie eine langsame Leitung. Steck dein Gerät
            einmal per LAN-Kabel an den Router und miss erneut — bleibt der Wert niedrig, liegt
            es nicht am WLAN.
          </Stufe>
        )}
        {/* Der Brief steht VOR der offiziellen Messung: Er kostet nichts, und
            oft prüft der Anbieter die Leitung auf Zuruf. Erst wenn das nichts
            bringt, lohnt der Aufwand von drei Messtagen. */}
        <Stufe nummer={++nummer} titel="Deinen Anbieter fragen">
          Oft klärt sich das mit einer Nachricht — viele Anbieter prüfen die Leitung auf Zuruf.
          Den Text haben wir dir fertig geschrieben.
          <BriefKasten
            tarif={tarif}
            gemessenMbps={gemessenMbps}
            connection={connection}
            kundennummerAusRechnung={kundennummerAusRechnung}
            rechnungsBild={rechnungsBild}
          />
        </Stufe>
        {/* "Dann" verweist auf die Stufe davor — und davor steht jetzt immer
            der Brief, auch wenn die Kabel-Stufe wegfällt. */}
        <Stufe nummer={++nummer} titel="Dann offiziell messen">
          Für Minderung oder Kündigung zählt allein die{" "}
          <a
            href="https://breitbandmessung.de"
            target="_blank"
            rel="noreferrer"
            className="text-[#0b57d0] underline underline-offset-2 dark:text-blue-400"
          >
            Breitbandmessung
          </a>{" "}
          der Bundesnetzagentur: ein Desktop-Programm, 3 Messtage, je 10 Messungen. Unsere
          Messung zeigt dir nur, ob sich der Aufwand lohnt.
        </Stufe>
        {wechselPartner && (
          <Stufe nummer={++nummer} titel="Oder den Anbieter wechseln">
            <WechselKasten
              partner={wechselPartner}
              tarif={tarif}
              gemessenMbps={gemessenMbps}
              ton={ton}
              messungId={messungId}
            />
          </Stufe>
        )}
      </ol>

      <MessreiheStand pruefung={pruefung} fenster={fenster} />

      <details className="group">
        <summary className="cursor-pointer list-none text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
          Was dort geprüft wird
        </summary>
        <div className="mt-2 flex flex-col gap-2 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
          <p>
            Eines dieser drei Anzeichen genügt für eine erhebliche Abweichung (§ 57 Abs. 4 TKG)
            — bei {tarif.tarifname}:
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {schwelle90 !== null && (
              <li>
                An mindestens 2 von 3 Messtagen wird nie {formatMbps(schwelle90)} Mbit/s erreicht
                (90 % von {formatMbps(tarif.download_max_mbps)}).
              </li>
            )}
            {schwelleNormal !== null && (
              <li>
                Weniger als 90 % aller Messungen erreichen {formatMbps(schwelleNormal)} Mbit/s.
              </li>
            )}
            {schwelleMin !== null && (
              <li>
                An mindestens 2 von 3 Messtagen liegt der Wert unter {formatMbps(schwelleMin)}{" "}
                Mbit/s.
              </li>
            )}
          </ul>
          <p className="text-zinc-500 dark:text-zinc-500">
            Geprüft wird das über eine Messreihe, nicht über eine einzelne Zahl — deine läuft
            gerade{" "}
            {pruefung.kennzahlen.messtage <= 1
              ? "seit einem Messtag"
              : `über ${pruefung.kennzahlen.messtage} Messtage`}
            .
          </p>
        </div>
      </details>
    </div>
  );
}

/**
 * Wie weit die eigene Messreihe ist — und was sie schon hergibt.
 *
 * Das ersetzt ein nacktes „dafür reicht deine Messung nicht“. Der Unterschied
 * ist nicht kosmetisch: Ein Nutzer, der nicht weiß, WAS fehlt, misst kein
 * zweites Mal. Deshalb steht hier immer eine Zahl, die sich bewegen kann.
 *
 * Die zu dicht beieinander liegenden Messungen werden ausdrücklich genannt.
 * Wer gerade gemessen hat und den Zähler nicht steigen sieht, hält die App
 * sonst für kaputt — dabei hält sie sich nur an die Regel der offiziellen
 * Kampagne.
 */
function MessreiheStand({ pruefung, fenster }: { pruefung: Vorpruefung; fenster: Fenster }) {
  const { messtage, messungen } = pruefung.kennzahlen;
  const fehlendeTage = Math.max(0, MINDEST_MESSTAGE - messtage);

  const zaehler = [
    `Messtag ${Math.min(messtage, MINDEST_MESSTAGE)} von ${MINDEST_MESSTAGE}`,
    messungen >= MINDEST_MESSUNGEN_UEBLICH
      ? `${messungen} Messungen`
      : `${messungen} von ${MINDEST_MESSUNGEN_UEBLICH} Messungen`,
  ].join(" · ");

  // Bewusst kein Warnton bei "auffaellig": Das ist eine Vorabprüfung auf
  // unserem eigenen Server, kein Nachweis. Der Satz sagt, was der nächste
  // Schritt ist — nicht, dass ein Anspruch bestünde.
  const satz =
    pruefung.gesamt === "auffaellig"
      ? "Deine Messreihe zeigt eines der drei Anzeichen. Damit lohnt sich der Aufwand der offiziellen Messung."
      : pruefung.gesamt === "unauffaellig"
        ? "Deine Messreihe zeigt bisher keines der drei Anzeichen. Weitere Messtage machen das Bild sicherer."
        : pruefung.gesamt === "kein_referenzwert"
          ? "Das Produktinformationsblatt dieses Vertrags nennt keine Raten, gegen die sich prüfen ließe."
          : fehlendeTage > 0
            ? `Für ein Urteil ${fehlendeTage === 1 ? "fehlt noch ein Messtag" : `fehlen noch ${fehlendeTage} Messtage`} — miss an einem anderen Tag erneut. Deine Reihe bleibt auf diesem Gerät gespeichert.`
            : "Für ein Urteil fehlen noch Messungen — miss im Laufe des Tages erneut.";

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Deine Messreihe · {zaehler}
      </div>
      <p className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">{satz}</p>
      {fenster.zuDicht > 0 && (
        <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-500">
          {fenster.zuDicht === 1 ? "Eine Messung zählt" : `${fenster.zuDicht} Messungen zählen`}{" "}
          nicht mit: Zwischen zwei Messungen müssen mindestens 5 Minuten liegen — so schreibt es
          die offizielle Kampagne vor.
        </p>
      )}
    </div>
  );
}

/**
 * Das Angebots-Regal — "was es heute für deine Geschwindigkeit gibt".
 *
 * Warum hier KEINE Ersparnis steht: Wir kennen den Preis des Nutzers nur aus
 * seinem eigenen Blatt, und zwei von drei Verträgen tragen ein Blatt von vor
 * 2025. Eine Differenz gegen so einen Listenpreis wäre keine Ersparnis,
 * sondern Inflation — und eine Zahl, die wir nicht belegen können, ist hier
 * ein UWG-Problem, kein Textproblem. Also stehen die Angebote da, und die
 * Rechnung macht der Nutzer.
 *
 * Die drei Einschränkungen stehen bewusst UNTER dem Regal und nicht in einem
 * Aufklapp-Bereich: Sie sind der Grund, warum die Preise hier höher aussehen
 * können als beim Vergleich — wer sie erst nach dem Klick erführe, fühlte
 * sich getäuscht. Als sichtbarer Satz sind sie dagegen ein Grund zu klicken.
 */
function AngebotsRegal({ tarif }: { tarif: Tarif }) {
  const regal = angebote(TARIFE, tarif);
  if (regal.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {regal.map((angebot) => (
          <li
            key={angebot.slug}
            className="flex items-baseline justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <span className="min-w-0 text-sm text-zinc-700 dark:text-zinc-300">
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                {angebot.tarifname}
              </span>{" "}
              <span className="text-zinc-400">· {angebot.anbieter}</span>
              <span className="block text-xs text-zinc-500">
                normalerweise {formatMbps(angebot.download_normal_mbps)} Mbit/s
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {preisFormat(angebot.monatspreis_eur as number)} €
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-4 text-zinc-500 dark:text-zinc-500">
        Listenpreise aus den offiziellen Produktinformationsblättern der Anbieter, ohne
        Endgeräte — der Router kommt überall obendrauf. Beim Vergleich liegen die
        Aktionspreise oft darunter. Ob es an deiner Adresse verfügbar ist, prüft der
        Vergleich.
      </p>
    </div>
  );
}

/**
 * Der bezahlte Weg — und warum er als LETZTE Stufe steht.
 *
 * An dieser Stelle verdient das Produkt sein Geld. Genau deshalb steht der
 * Haken zuerst: Wer den Mangel offiziell nachweist, darf die Rechnung kürzen
 * und fristlos kündigen (§ 57 Abs. 4 TKG). Ein Wechsel ist dafür kein Ersatz,
 * sondern die Wahl derer, denen der Aufwand zu groß ist — oder deren Vertrag
 * ohnehin ausläuft.
 *
 * Die Reihenfolge auf dem Schirm ist damit keine Geschmacksfrage: Wir
 * verdienen am Wechsel, also muss der kostenlose Weg davor stehen. Sonst wäre
 * die Leiter eine Verkaufsstrecke, und die Glaubwürdigkeit ist hier das
 * Produkt.
 *
 * Die Werbekennzeichnung steht direkt am Verweis — § 5a UWG verlangt, den
 * kommerziellen Zweck erkennbar zu machen, und zwar dort, wo geklickt wird.
 */
function WechselKasten({
  partner,
  tarif,
  gemessenMbps,
  ton,
  messungId,
}: {
  partner: string;
  tarif: Tarif;
  gemessenMbps: number;
  ton: UrteilTon;
  messungId: string | null;
}) {
  const ziel = klickPfad({
    anbieter: tarif.anbieter,
    tarifSlug: tarif.slug,
    urteil: ton,
    // Bewusst der ANGEZEIGTE Wert: In der Zeile soll die Zahl stehen, die der
    // Nutzer vor sich hatte, als er geklickt hat.
    downloadMbps: aufAnzeige(gemessenMbps),
    messungId,
  });

  return (
    <>
      Bestätigt die offizielle Messung den Mangel, darfst du die Rechnung kürzen und
      fristlos kündigen. Ein Wechsel lohnt vor allem, wenn dir das zu viel Aufwand ist oder
      dein Vertrag ohnehin ausläuft.
      {/* Das Regal steht VOR dem Verweis: Wer schon sieht, was es für seine
          Geschwindigkeit gibt, klickt informiert weiter statt ins Ungewisse.
          Umgekehrt wäre der Verweis ein blanker Werbeknopf mit einer
          Preisliste als Nachschlag. */}
      <div className="mt-2">
        <AngebotsRegal tarif={tarif} />
      </div>
      <PartnerVerweis partner={partner} ziel={ziel} />
    </>
  );
}

/**
 * Verweis auf den Partner samt Werbekennzeichnung.
 *
 * Steht als EINE Komponente da, weil derselbe Verweis an zwei Stellen
 * erscheint (vierte Stufe bei schlechtem Urteil, Preis-Einordnung bei gutem).
 * Zwei Abschriften desselben Textes laufen mit der Zeit auseinander — und
 * ausgerechnet hier hinge dann an einer Stelle eine veraltete oder fehlende
 * Kennzeichnung. § 5a UWG verlangt sie dort, wo geklickt wird.
 */
function PartnerVerweis({ partner, ziel }: { partner: string; ziel: string }) {
  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      {/* Kein rel="noreferrer": Der Verweis läuft über unsere eigene Route
          zum Partner, und Partnerprogramme prüfen die verweisende Domain
          gegen Betrug. Ohne Referrer stünde die Provision in Frage. Die
          Browser-Voreinstellung schickt ohnehin nur die Domain, nicht Pfad
          und Parameter. */}
      <a
        href={ziel}
        target="_blank"
        rel="noopener"
        className="text-sm font-semibold text-[#0b57d0] underline underline-offset-2 dark:text-blue-400"
      >
        Angebote vergleichen bei {partner} →
      </a>
      <p className="text-[11px] leading-4 text-zinc-500 dark:text-zinc-500">
        <span className="font-bold uppercase tracking-wider">Anzeige</span> · Kommt darüber
        ein Vertrag zustande, bekommen wir eine Provision. Für dich bleibt der Preis
        gleich; auf das Messergebnis hat sie keinen Einfluss.
      </p>
    </div>
  );
}

/**
 * Das Regal bei GUTEM Urteil — eine Einordnung, keine Aufforderung.
 *
 * Der Founder hatte einen Wechsel-Vorschlag bei gutem Urteil zunächst
 * abgelehnt, und der Grund galt: Ein generischer "vergleichen"-Knopf unter
 * "alles in Ordnung" ist blanke Werbung. Ein benanntes Regal ist etwas
 * anderes — es beantwortet eine Frage, die der Nutzer sich ohnehin stellt,
 * mit Zahlen aus seinem eigenen Vertrag.
 *
 * Der erste Satz muss das Urteil BESTÄTIGEN, bevor Preise kommen. Ohne ihn
 * läse sich das Regal als Widerruf ("passt zu deinem Tarif — aber schau mal
 * hier"), und dann steht die Glaubwürdigkeit des Urteils zur Debatte, an der
 * das ganze Produkt hängt.
 */
function PreisEinordnung({
  partner,
  tarif,
  gemessenMbps,
  ton,
  messungId,
}: {
  partner: string;
  tarif: Tarif;
  gemessenMbps: number;
  ton: UrteilTon;
  messungId: string | null;
}) {
  if (angebote(TARIFE, tarif).length === 0) return null;

  const ziel = klickPfad({
    anbieter: tarif.anbieter,
    tarifSlug: tarif.slug,
    urteil: ton,
    downloadMbps: aufAnzeige(gemessenMbps),
    messungId,
  });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
        Was es heute sonst gibt
      </div>
      <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
        An deiner Leitung ist nichts zu beanstanden. Falls dich trotzdem interessiert, wie
        dein Vertrag preislich steht: Diese Verträge sagen mindestens so viel zu wie{" "}
        {tarif.tarifname}.
      </p>
      <AngebotsRegal tarif={tarif} />
      <PartnerVerweis partner={partner} ziel={ziel} />
    </div>
  );
}

/**
 * Übersetzt die Verbindungsart der Messbibliothek in die des Briefes.
 *
 * Zwei getrennte Vokabulare mit Absicht: Die Messbibliothek spricht von
 * "wifi", ein deutscher Brief von WLAN. Wichtiger ist aber der dritte Wert —
 * "unknown" heißt „der Nutzer hat nichts angegeben" und muss im Brief zu
 * `null` werden, also zu gar keiner Aussage. Als WLAN durchgereicht stünde
 * eine Behauptung im Brief, die niemand aufgestellt hat.
 */
function briefVerbindung(connection: ConnectionType | null): Verbindung | null {
  if (connection === "lan") return "lan";
  if (connection === "wifi") return "wlan";
  return null;
}

/**
 * Der Kulanz-Brief: Angaben ergänzen, ansehen, mitnehmen.
 *
 * Alles passiert AUF DEM GERÄT. Kundennummer und Name verlassen den Browser
 * nicht — sie wandern in den Text, und der geht in die Zwischenablage, in den
 * Druck oder ins Mailprogramm des Nutzers. Es gibt keinen Server, der davon
 * erführe, und darum auch nichts einzuwilligen.
 */
function BriefKasten({
  tarif,
  gemessenMbps,
  connection,
  kundennummerAusRechnung,
  rechnungsBild,
}: {
  tarif: Tarif;
  gemessenMbps: number;
  connection: ConnectionType | null;
  kundennummerAusRechnung: string | null;
  rechnungsBild: File | null;
}) {
  const [offen, setOffen] = useState(false);
  const [kundennummer, setKundennummer] = useState(kundennummerAusRechnung ?? "");
  const [name, setName] = useState("");
  const [kopiert, setKopiert] = useState(false);
  const [hinweis, setHinweis] = useState<string | null>(null);
  // "angeboten" heißt: Es liegt ein Bild vor und der Nutzer hat noch nicht
  // entschieden. Erst "einverstanden" schickt es hinaus.
  const [namensScan, setNamensScan] = useState<
    "angeboten" | "laeuft" | "fertig" | "leer" | "fehler" | "abgelehnt"
  >("angeboten");

  // Erst beim ersten Rendern im Browser bestimmt: Welcher Kalendertag "heute"
  // ist, hängt an der Zeitzone des Geräts — dieselbe Überlegung wie bei
  // `Messwert.tag`. Als Startwert einer useState-Variablen läuft es genau
  // einmal und ändert sich danach nicht mehr unter dem Nutzer weg.
  // Zweistellig erzwungen: Ohne die Optionen liefert "de-DE" ein "25.7.2026",
  // und ein Brief mit einstelligem Monat sieht nach Bastelei aus.
  const [datum] = useState(() =>
    new Date().toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  );

  const kontakt = kontaktFuer(tarif.anbieter);
  const brief = briefBauen({
    tarif,
    gemessenMbps,
    datum,
    verbindung: briefVerbindung(connection),
    kundennummer: kundennummer.trim() || null,
    name: name.trim() || null,
  });
  const entwurf = mailtoUrl(kontakt?.email ?? null, brief);

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(brief.text);
      setKopiert(true);
      setHinweis(null);
      window.setTimeout(() => setKopiert(false), 2500);
    } catch {
      // Ohne Rechte auf die Zwischenablage bleibt der Text sichtbar — er steht
      // ohnehin direkt darüber und lässt sich von Hand markieren.
      setHinweis("Kopieren hat nicht geklappt — markier den Text oben und kopier ihn von Hand.");
    }
  };

  /**
   * Holt den Namen aus dem Rechnungsbild — erst nach ausdrücklicher
   * Einwilligung, und über eine eigene Route mit eigenem Schema, die
   * ausschließlich den Namen kennt.
   */
  const namenHolen = async () => {
    if (!rechnungsBild) return;
    setNamensScan("laeuft");
    const formular = new FormData();
    formular.append("datei", rechnungsBild);
    try {
      const antwort = await fetch("/api/rechnung/name", { method: "POST", body: formular });
      const daten: unknown = await antwort.json().catch(() => null);
      const gelesen =
        antwort.ok && typeof daten === "object" && daten !== null
          ? (daten as { name?: unknown }).name
          : null;
      if (typeof gelesen === "string" && gelesen) {
        setName(gelesen);
        setNamensScan("fertig");
      } else {
        // Kein Name lesbar ist kein Fehler — die Rechnung führt ihn vielleicht
        // gar nicht sichtbar. Der Nutzer tippt ihn dann selbst.
        setNamensScan(antwort.ok ? "leer" : "fehler");
      }
    } catch {
      setNamensScan("fehler");
    }
  };

  const drucken = () => {
    // Eigenes Dokument in einem unsichtbaren Rahmen statt eines Druck-Stils für
    // die ganze Seite: Der Ergebnis-Schirm enthält Knöpfe und Messwerte, die
    // auf einem Brief nichts zu suchen haben. Ein Rahmen statt eines neuen
    // Fensters, weil Fenster am Popup-Blocker scheitern.
    const rahmen = document.createElement("iframe");
    rahmen.setAttribute("aria-hidden", "true");
    rahmen.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(rahmen);
    const fenster = rahmen.contentWindow;
    if (!fenster) {
      rahmen.remove();
      setHinweis("Drucken hat nicht geklappt — kopier den Text und füg ihn in ein Dokument ein.");
      return;
    }
    fenster.document.open();
    fenster.document.write(briefHtml({ brief, kontakt, datum, name: name.trim() || null }));
    fenster.document.close();
    // Aufräumen, sobald der Druckdialog durch ist. Der Zeitgeber ist nur das
    // Netz darunter: "afterprint" fehlt in manchen Browsern, und ein Rahmen,
    // der für immer im Dokument hängt, ist ein stiller Fehler.
    const aufraeumen = () => rahmen.remove();
    fenster.addEventListener("afterprint", aufraeumen);
    window.setTimeout(aufraeumen, 60_000);
    fenster.focus();
    fenster.print();
  };

  if (!offen) {
    return (
      <div className="mt-3">
        <button onClick={() => setOffen(true)} className={KNOPF_NEBEN}>
          Brief ansehen
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-2 sm:flex-row">
        <BriefFeld
          beschriftung="Kundennummer"
          wert={kundennummer}
          setzen={setKundennummer}
          platzhalter="steht auf deiner Rechnung"
        />
        <BriefFeld
          beschriftung="Dein Name"
          wert={name}
          setzen={setName}
          platzhalter="für die Unterschrift"
        />
      </div>

      {/* Eigene Einwilligung an der Stelle, wo der Zweck entsteht: Der Brief
          braucht eine Unterschrift, der Tarif-Scan brauchte den Namen nicht.
          Erscheint nur, wenn ein Bild vorliegt und noch kein Name im Feld
          steht — wer selbst getippt hat, wird nicht mehr gefragt. */}
      {rechnungsBild && !name.trim() && namensScan !== "abgelehnt" && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs leading-5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          {namensScan === "laeuft" ? (
            <span>Wir lesen den Namen …</span>
          ) : namensScan === "leer" ? (
            <span>Auf der Rechnung war kein Name lesbar — bitte trag ihn selbst ein.</span>
          ) : namensScan === "fehler" ? (
            <span>Das hat nicht geklappt — bitte trag den Namen selbst ein.</span>
          ) : (
            <>
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                Namen aus deiner Rechnung übernehmen?
              </span>{" "}
              Dafür schicken wir dein Rechnungsbild noch einmal an den KI-Dienst Anthropic. Er
              liest daraus nur den Namen — sonst nichts. Es gelten dieselben Regeln wie beim
              Tarif-Scan: nicht gespeichert, nicht zum Training verwendet.
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => void namenHolen()} className={KNOPF_NEBEN}>
                  Einverstanden
                </button>
                <button onClick={() => setNamensScan("abgelehnt")} className={KNOPF_NEBEN}>
                  Lieber selbst tippen
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Der Empfänger steht offen da — auch dann, wenn wir keinen haben. Eine
          erfundene Adresse wäre schlimmer als eine sichtbare Lücke. */}
      <div className="rounded-md bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        <span className="font-semibold text-zinc-700 dark:text-zinc-300">An: </span>
        {kontakt ? anschriftZeilen(kontakt).join(", ") : "Anschrift deines Anbieters"}
        {kontakt?.email ? (
          <> · {kontakt.email}</>
        ) : (
          <> · keine E-Mail veröffentlicht — nutze das Kontaktformular deines Anbieters</>
        )}
      </div>

      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 px-3 py-3 font-sans text-xs leading-5 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        {brief.text}
      </pre>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => void kopieren()} className={KNOPF_NEBEN}>
          {kopiert ? "✓ Kopiert" : "Text kopieren"}
        </button>
        <button onClick={drucken} className={KNOPF_NEBEN}>
          Als PDF sichern
        </button>
        {/* Kein Entwurf, wenn er gekürzt ankäme — lieber ein fehlender Knopf
            als eine Mail, der hinten etwas fehlt. */}
        {entwurf.url && (
          <a href={entwurf.url} className={KNOPF_NEBEN}>
            E-Mail schreiben
          </a>
        )}
      </div>

      {hinweis && <p className="text-xs leading-5 text-amber-700 dark:text-amber-500">{hinweis}</p>}

      <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-500">
        Der Brief ist eine Bitte um Prüfung, kein Rechtsschreiben — für Minderung oder Kündigung
        zählt allein die offizielle Messung aus dem Schritt darunter. Deine Angaben bleiben auf
        diesem Gerät.
      </p>
    </div>
  );
}

/** Ein beschriftetes Eingabefeld des Briefes. */
function BriefFeld({
  beschriftung,
  wert,
  setzen,
  platzhalter,
}: {
  beschriftung: string;
  wert: string;
  setzen: (wert: string) => void;
  platzhalter: string;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
      {beschriftung}
      <input
        type="text"
        value={wert}
        onChange={(e) => setzen(e.target.value)}
        placeholder={platzhalter}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal text-zinc-900 placeholder:text-zinc-400 focus:border-[#0b57d0] focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
    </label>
  );
}

/** Eine Stufe der Leiter — Nummer, Titel, Erklärung. */
function Stufe({
  nummer,
  titel,
  children,
}: {
  nummer: number;
  titel: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        {nummer}
      </span>
      <div className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{titel}.</span>{" "}
        {children}
      </div>
    </li>
  );
}

// Ein Auswahl-Knopf für eine Bewertungs-Klasse.
//
// EINE Stelle für die Beschriftung, weil dieselbe Klasse auf zwei Wegen auf
// den Schirm kommt (normale Auswahl und Rückfrage nach dem Scan). Liefe die
// Beschriftung auseinander, trüge derselbe Vertrag je nach Weg einen anderen
// Text — und der Nutzer könnte nicht erkennen, dass es derselbe ist.
function KlassenKnopf({ klasse, onClick }: { klasse: TarifVorschlag; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="max-w-full rounded-2xl border border-zinc-300 px-4 py-2 text-left text-sm font-medium text-zinc-700 transition hover:border-[#0b57d0] hover:text-[#0b57d0] dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-blue-400 dark:hover:text-blue-400"
    >
      {klasse.produkte.join(", ")}
      <span className="ml-1 text-zinc-400">
        {klasse.weitereNamen > 0 && `+${klasse.weitereNamen} weitere `}· bis zu{" "}
        {formatMbps(klasse.tarif.download_max_mbps)}
        {/* Nur wo zwei Knöpfe sonst gleich aussähen: die Werte, die sie
            wirklich unterscheiden. */}
        {klasse.unterscheidung?.normalMbps != null &&
          `, normal ${formatMbps(klasse.unterscheidung.normalMbps)}`}
        {klasse.unterscheidung?.minMbps != null &&
          `, min ${formatMbps(klasse.unterscheidung.minMbps)}`}
      </span>
    </button>
  );
}

const KNOPF_HAUPT =
  "rounded-full bg-[#0b57d0] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50";
const KNOPF_NEBEN =
  "rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:border-[#0b57d0] hover:text-[#0b57d0] dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-blue-400 dark:hover:text-blue-400";

const SCAN_KARTE =
  "w-full rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-left dark:border-zinc-800 dark:bg-zinc-950";

/**
 * Rechnung fotografieren oder hochladen — Einwilligung, Upload, Rückfrage.
 *
 * Zwei Dinge sind hier nicht verhandelbar:
 *
 * 1. Der Einwilligungstext steht VOR der Dateiauswahl, nicht daneben und
 *    nicht danach. Wer auf "Einverstanden" tippt, hat gelesen, wohin seine
 *    Rechnung geht; der Knopf IST die Einwilligung.
 * 2. Aus jedem Ausgang führt ein Weg zurück in die normale Auswahl. Wessen
 *    Rechnung nicht gelesen werden kann, darf nicht schlechter dastehen als
 *    jemand, der es gar nicht erst versucht hat.
 */
function RechnungScan({
  netzAnbieter,
  onKlasse,
  onAnbieterOhneTarif,
  onBild,
  onAbbruch,
}: {
  /** Anbieter aus der IP-Erkennung — nur für die Konflikt-Warnung. */
  netzAnbieter: string;
  onKlasse: (
    klasse: TarifVorschlag,
    anbieter: string,
    konflikt: string | null,
    kundennummer: string | null
  ) => void;
  onAnbieterOhneTarif: (
    anbieter: string,
    konflikt: string | null,
    kundennummer: string | null
  ) => void;
  /**
   * Das gelesene Bild — bleibt für die Sitzung auf dem Gerät, damit der
   * Kulanz-Brief den Namen daraus holen kann, ohne dass der Nutzer dieselbe
   * Rechnung ein zweites Mal fotografieren muss.
   */
  onBild: (datei: File) => void;
  onAbbruch: () => void;
}) {
  type Zustand = { art: "einwilligung" } | { art: "laeuft" } | ScanSchritt;
  const [zustand, setZustand] = useState<Zustand>({ art: "einwilligung" });
  const dateiFeld = useRef<HTMLInputElement>(null);

  const hochladen = async (datei: File) => {
    // Vor dem Senden prüfen, nicht danach: Auf dem Handy kostet ein Upload,
    // der am Ende ohnehin abgelehnt wird, Zeit und Datenvolumen.
    if (datei.size > MAX_UPLOAD_BYTES) {
      setZustand({
        art: "fehler",
        meldung: `Die Datei ist zu groß (höchstens ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`,
        erneutMoeglich: true,
      });
      return;
    }

    setZustand({ art: "laeuft" });
    const formular = new FormData();
    formular.append("datei", datei);
    try {
      const antwort = await fetch("/api/rechnung", { method: "POST", body: formular });
      const daten: unknown = await antwort.json().catch(() => null);
      const schritt = scanSchritt(antwort.status, daten, netzAnbieter);
      // Nur wenn das Bild tatsächlich als Rechnung gelesen wurde, ist es später
      // etwas wert. Es bleibt AUF DEM GERÄT und wird nur dann ein zweites Mal
      // verschickt, wenn der Nutzer beim Brief ausdrücklich einwilligt.
      if (schritt.art === "bestaetigen" || schritt.art === "namenswahl" || schritt.art === "kein_tarif") {
        onBild(datei);
      }
      setZustand(schritt);
    } catch {
      // Status 0 heißt für scanSchritt: Die Anfrage kam gar nicht durch.
      setZustand(scanSchritt(0, null, netzAnbieter));
    }
  };

  const nochmal = () => {
    setZustand({ art: "einwilligung" });
    dateiFeld.current?.click();
  };

  const zurueck = (
    <button onClick={onAbbruch} className={KNOPF_NEBEN}>
      Lieber selbst auswählen
    </button>
  );

  const dateiEingabe = (
    <input
      ref={dateiFeld}
      type="file"
      // Kein `capture`: Sonst ginge auf dem Handy sofort die Kamera auf, und
      // wer die Rechnung als PDF in der Mail hat, käme nicht an sie heran.
      // So bleibt die Wahl zwischen Kamera, Mediathek und Dateien.
      accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
      hidden
      onChange={(e) => {
        const datei = e.target.files?.[0];
        // Zurücksetzen, sonst löst dieselbe Datei beim zweiten Mal nichts aus.
        e.target.value = "";
        if (datei) void hochladen(datei);
      }}
    />
  );

  if (zustand.art === "einwilligung") {
    return (
      <div className={SCAN_KARTE}>
        {dateiEingabe}
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Rechnung scannen
        </h3>
        <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
          {/* Die Aufzählung muss dem Extraktions-Schema entsprechen. Sie nannte
              drei Felder, gelesen wurden vier: Die Kundennummer stand seit
              Phase 4 im Schema, aber nicht in der Einwilligung. */}
          Damit wir deinen Tarif automatisch finden, schicken wir dein Foto einmal an den KI-Dienst
          Anthropic. Er liest daraus Anbieter, Vertragsname, Kundennummer und Monatsbetrag.
        </p>
        <ul className="mt-3 flex flex-col gap-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          <li>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              Wir speichern deine Rechnung nicht.
            </span>{" "}
            Sie geht durch uns hindurch und wird danach verworfen — kein Speichern, kein Protokoll.
          </li>
          <li>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              Verarbeitet wird außerhalb der EU.
            </span>{" "}
            Dort wird sie nach spätestens 30 Tagen gelöscht (Ausnahme: Verdacht auf Missbrauch) und{" "}
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">nicht</span> zum
            Training von KI verwendet.
          </li>
          {/* Der Satz hieß bis Phase 5 "Dein Name und deine Anschrift werden
              nicht gelesen." Für DIESEN Scan stimmt das weiterhin — sein
              Schema hat kein Namensfeld. Der Kulanz-Brief kann den Namen aber
              über eine eigene Route und eine eigene Einwilligung holen, und
              wer den alten Satz gelesen hat, würde sich dort getäuscht fühlen.
              Deshalb getrennt: die Anschrift gar nicht, der Name erst auf
              ausdrückliche Nachfrage. */}
          <li>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              Deine Anschrift wird nicht gelesen.
            </span>{" "}
            Nach deinem Namen fragen wir erst, wenn du einen Brief an deinen Anbieter schreiben
            willst — und dann noch einmal ausdrücklich.
          </li>
          <li>
            Was dein Vertrag an Tempo zusichert, kommt{" "}
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">nie</span> aus dem
            Foto, sondern immer aus dem offiziellen Produktinformationsblatt.
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => dateiFeld.current?.click()} className={KNOPF_HAUPT}>
            Einverstanden — Rechnung auswählen
          </button>
          {zurueck}
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          Es genügt die Seite, auf der dein Tarif steht.
        </p>
      </div>
    );
  }

  if (zustand.art === "laeuft") {
    return (
      <div className={SCAN_KARTE}>
        <p
          className="animate-pulse text-sm font-medium text-zinc-700 dark:text-zinc-300"
          aria-live="polite"
        >
          Rechnung wird gelesen …
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          Das dauert ein paar Sekunden. Bitte lass die Seite offen.
        </p>
      </div>
    );
  }

  // Ab hier: das Ergebnis. Die Warnung, dass Rechnung und Messung nicht
  // zusammenpassen, gehört an den Anfang — sie ändert, wie das Ergebnis zu
  // lesen ist, und käme unter den Knöpfen zu spät.
  const konfliktHinweis =
    "konflikt" in zustand && zustand.konflikt ? (
      <Warnkarte titel="Rechnung und Messung passen nicht zusammen.">
        {zustand.konflikt} Der Vergleich unten hält dann den Vertrag des einen Anschlusses gegen die
        Messung eines anderen.
      </Warnkarte>
    ) : null;

  if (zustand.art === "bestaetigen") {
    return (
      <div className="flex w-full flex-col gap-3">
        {konfliktHinweis}
        <div className={SCAN_KARTE}>
          {dateiEingabe}
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            Von deiner Rechnung gelesen
          </div>
          <div className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">
            {zustand.tarifname}{" "}
            <span className="font-normal text-zinc-400">· {zustand.anbieter}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">Stimmt das?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() =>
                onKlasse(zustand.klasse, zustand.anbieter, zustand.konflikt, zustand.kundennummer)
              }
              className={KNOPF_HAUPT}
            >
              Ja, das ist mein Tarif
            </button>
            <button onClick={onAbbruch} className={KNOPF_NEBEN}>
              Nein, selbst auswählen
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (zustand.art === "namenswahl") {
    return (
      <div className="flex w-full flex-col gap-3">
        {konfliktHinweis}
        <div className={SCAN_KARTE}>
          <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
            {zustand.tarifname ? (
              <>
                <span className="font-semibold">
                  Auf deiner Rechnung steht {zustand.tarifname}.
                </span>{" "}
                Diesen Namen gibt es mit verschiedenen zugesicherten Werten — welcher steht in
                deinem Vertrag?
              </>
            ) : (
              <>
                <span className="font-semibold">Fast geschafft.</span> Mehrere Verträge von{" "}
                {zustand.anbieter} passen zu dem, was auf deiner Rechnung steht. Welcher ist deiner?
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {zustand.klassen.map((klasse) => (
              <KlassenKnopf
                key={klasse.tarif.slug}
                klasse={klasse}
                onClick={() =>
                  onKlasse(klasse, zustand.anbieter, zustand.konflikt, zustand.kundennummer)
                }
              />
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            Die Werte unterscheiden sich — deshalb fragen wir, statt zu raten.{" "}
            <button
              onClick={onAbbruch}
              className="text-[#0b57d0] underline underline-offset-2 dark:text-blue-400"
            >
              lieber selbst auswählen
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Die vier Ausgänge, die alle im selben Angebot enden: zurück in die
  // normale Auswahl — nur die Erklärung davor unterscheidet sich.
  const [titel, erklaerung, erneut] =
    zustand.art === "kein_tarif"
      ? [
          `${zustand.anbieter} erkannt, aber nicht den Vertragsnamen.`,
          "Vielleicht steht er auf einer anderen Seite der Rechnung. Wähl ihn einfach selbst aus — die Auswahl ist schon auf deinen Anbieter eingestellt.",
          true,
        ]
      : zustand.art === "kein_anbieter"
        ? [
            "Wir konnten die Rechnung nicht zuordnen.",
            "Auf dem Bild war kein Anbieter zu erkennen, den wir führen. Am besten die Seite mit dem Briefkopf fotografieren — oder den Tarif selbst auswählen.",
            true,
          ]
        : zustand.art === "keine_rechnung"
          ? [
              "Das sieht nicht nach einer Telekommunikations-Rechnung aus.",
              "Am besten die Seite fotografieren, auf der dein Tarif steht.",
              true,
            ]
          : [zustand.meldung, "", zustand.erneutMoeglich];

  return (
    <div className={SCAN_KARTE}>
      {dateiEingabe}
      <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
        <span className="font-semibold">{titel}</span> {erklaerung}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {erneut && (
          <button onClick={nochmal} className={KNOPF_NEBEN}>
            Andere Datei versuchen
          </button>
        )}
        <button
          onClick={() =>
            // Der Anbieter aus der Rechnung wird übernommen — samt Warnung,
            // falls er nicht zu dem Netz passt, in dem gemessen wurde.
            zustand.art === "kein_tarif"
              ? onAnbieterOhneTarif(zustand.anbieter, zustand.konflikt, zustand.kundennummer)
              : onAbbruch()
          }
          className={KNOPF_HAUPT}
        >
          Tarif selbst auswählen
        </button>
      </div>
    </div>
  );
}

function ResultCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-zinc-200 bg-white px-2 py-5 dark:border-zinc-800 dark:bg-zinc-950">
      <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className="font-mono text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </span>
      <span className="text-xs text-zinc-400">{unit}</span>
    </div>
  );
}

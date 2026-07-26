// Der Wechsel-Partner: wohin der bezahlte Verweis führt und wie er gebaut wird.
//
// Die Adresse des Partners steht NICHT im Quelltext, sondern als Vorlage in
// zwei Umgebungsvariablen. Das hat einen belegbaren Grund und ist keine
// Vorsicht auf Verdacht:
//
//   Wie die Tracking-Adresse eines Partnerprogramms genau aussieht — welcher
//   Parameter die Unterkennung trägt, ob "subid", "clickref" oder "wmid" —
//   erfährt man erst im eigenen Partnerkonto. Rieten wir die Namen jetzt,
//   stünde eine unbelegte Behauptung im Repo, die niemand nachprüfen kann.
//   Dieselbe Lehre wie in Phase 3: erst nachschlagen, dann festschreiben.
//
// Zweiter Grund: Ohne gesetzte Variablen ist der Wechsel-Vorschlag AUS. Bis
// das Partnerkonto steht (es braucht ein Impressum, also Phase 8), zeigt die
// App also keinen Knopf, hinter dem nichts liegt.
//
// Alles hier ist reine Zeichenketten-Arbeit und ohne Browser prüfbar.

/** Ein einsatzbereiter Partner — geprüfte Vorlage plus Anzeigename. */
export interface WechselPartner {
  /** Wie der Partner im Ergebnis genannt wird, z. B. "CHECK24". */
  name: string;
  /** Adressvorlage mit Platzhaltern, https, enthält `{klick_id}`. */
  vorlage: string;
}

/**
 * Warum keine Vorlage zustande kam. Wird ausgewiesen statt verschluckt: Ein
 * Tippfehler in der Umgebungsvariablen darf nicht als "kein Partner
 * eingerichtet" durchgehen — sonst sucht man den fehlenden Knopf im Code.
 */
export type PartnerFehler =
  | "nicht_konfiguriert"
  | "name_fehlt"
  | "keine_gueltige_adresse"
  | "kein_https"
  | "keine_klick_id"
  | "unbekannter_platzhalter";

/** Die Werte, die in eine Vorlage eingesetzt werden können. */
export interface WechselWerte {
  /** Unsere Klick-Kennung — daran hängt später jede Provision. */
  klickId: string;
  /** Aktueller Anbieter, falls bekannt. */
  anbieter?: string | null;
  /** Gemessener Download in Mbit/s, falls bekannt. */
  mbps?: number | null;
}

/** Platzhalter, die eine Vorlage verwenden darf. */
export const PLATZHALTER = ["klick_id", "anbieter", "mbps"] as const;

const NAME_MAX_LAENGE = 40;
const VORLAGE_MAX_LAENGE = 500;

/** Findet jedes `{…}` in der Vorlage — auch fehlerhafte wie `{ klick_id }`. */
const PLATZHALTER_MUSTER = /\{[^}]*\}/g;

export interface PartnerPruefung {
  partner: WechselPartner | null;
  fehler: PartnerFehler | null;
}

/**
 * Prüft ein Paar aus Name und Adressvorlage.
 *
 * Getrennt von `partnerAusUmgebung()`, damit die Regeln ohne Umgebung
 * prüfbar sind — und damit an EINER Stelle steht, was eine brauchbare
 * Vorlage ausmacht.
 */
export function partnerPruefen(
  name: string | undefined,
  vorlage: string | undefined
): PartnerPruefung {
  const nameSauber = (name ?? "").trim();
  const vorlageSauber = (vorlage ?? "").trim();

  // Beides leer heißt: bewusst nicht eingerichtet. Kein Fehler, nur kein
  // Angebot — das ist der Normalzustand bis zum Partnerkonto.
  if (!nameSauber && !vorlageSauber) {
    return { partner: null, fehler: "nicht_konfiguriert" };
  }
  if (!nameSauber || nameSauber.length > NAME_MAX_LAENGE) {
    return { partner: null, fehler: "name_fehlt" };
  }
  if (!vorlageSauber || vorlageSauber.length > VORLAGE_MAX_LAENGE) {
    return { partner: null, fehler: "keine_gueltige_adresse" };
  }

  // Die Vorlage wird VOR dem Einsetzen geprüft. Dafür müssen die Platzhalter
  // weg, sonst scheitert `new URL` an den geschweiften Klammern in manchen
  // Positionen. Ersetzt wird durch ein harmloses "x".
  let adresse: URL;
  try {
    adresse = new URL(vorlageSauber.replace(PLATZHALTER_MUSTER, "x"));
  } catch {
    return { partner: null, fehler: "keine_gueltige_adresse" };
  }
  if (adresse.protocol !== "https:") {
    return { partner: null, fehler: "kein_https" };
  }

  // Unbekannte Platzhalter sind ein lauter Abbruch, kein stiller Durchlass:
  // Ein durchgereichtes `{plz}` stünde sonst wörtlich in der Adresse, der
  // Verweis führte ins Leere — und niemand sähe, woran es lag.
  const gefunden = vorlageSauber.match(PLATZHALTER_MUSTER) ?? [];
  const erlaubt = new Set<string>(PLATZHALTER);
  for (const roh of gefunden) {
    if (!erlaubt.has(roh.slice(1, -1))) {
      return { partner: null, fehler: "unbekannter_platzhalter" };
    }
  }

  // Ohne Klick-Kennung ist keine Provision zuzuordnen. Ein Verweis ohne sie
  // schickt Nutzer weg und bringt nichts ein — dann lieber gar keiner.
  if (!vorlageSauber.includes("{klick_id}")) {
    return { partner: null, fehler: "keine_klick_id" };
  }

  return { partner: { name: nameSauber, vorlage: vorlageSauber }, fehler: null };
}

let bereitsGewarnt = false;

/**
 * Liest den Partner aus der Umgebung — oder `null`, wenn keiner eingerichtet
 * ist.
 *
 * Bei einer FEHLERHAFTEN Konfiguration wird einmal gewarnt. Nur der Grund
 * wird ausgegeben, nie die Vorlage selbst: In ihr steckt die Partnerkennung,
 * und die gehört nicht in Server-Protokolle.
 */
export function partnerAusUmgebung(
  env: Record<string, string | undefined> = process.env
): WechselPartner | null {
  const { partner, fehler } = partnerPruefen(
    env.WECHSEL_PARTNER_NAME,
    env.WECHSEL_PARTNER_URL
  );
  if (fehler && fehler !== "nicht_konfiguriert" && !bereitsGewarnt) {
    bereitsGewarnt = true;
    console.warn(
      `[wechsel] Partner-Konfiguration unbrauchbar (${fehler}) — der Wechsel-Vorschlag bleibt aus.`
    );
  }
  return partner;
}

/**
 * Setzt die Werte in die Vorlage ein.
 *
 * Jeder Wert wird kodiert: Anbieternamen enthalten "&" (1&1), und ein
 * ungeschütztes Kaufmanns-Und beendete den Parameter mitten im Wort. Der
 * Partner bekäme "1" statt "1&1" — ein LEISER Fehler, denn der Verweis
 * funktionierte weiterhin.
 *
 * Unbekannte Werte werden zu einer leeren Zeichenkette. Der Klick muss
 * durchgehen; ein leerer Parameter ist für den Partner unproblematisch, ein
 * abgebrochener Klick wäre ein verlorener Nutzer.
 */
export function wechselUrl(partner: WechselPartner, werte: WechselWerte): string {
  const ersatz: Record<string, string> = {
    klick_id: werte.klickId,
    anbieter: werte.anbieter ?? "",
    // Bewusst ganzzahlig, nicht in der Anzeige-Genauigkeit der App: Dies ist
    // kein Urteil, sondern ein Suchfilter beim Partner ("ab X Mbit/s"), und
    // der rechnet in vollen Mbit/s.
    mbps:
      typeof werte.mbps === "number" && Number.isFinite(werte.mbps)
        ? String(Math.round(werte.mbps))
        : "",
  };
  return partner.vorlage.replace(PLATZHALTER_MUSTER, (roh) =>
    encodeURIComponent(ersatz[roh.slice(1, -1)] ?? "")
  );
}

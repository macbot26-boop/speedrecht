// Wer Speedrecht betreibt — die Pflichtangaben nach § 5 DDG (dem Gesetz, das
// seit 2024 das TMG ersetzt), an EINER Stelle.
//
// Warum eine eigene Datei und nicht direkt in der Seite: Diese Angaben stehen
// im Impressum, in der Datenschutzerklärung (als Verantwortlicher) und später
// unter dem Kulanz-Brief. Drei Fassungen derselben Anschrift wären drei
// Gelegenheiten, dass eine davon veraltet — und ein Impressum, dessen Angaben
// nicht stimmen, ist selbst ein Abmahngrund.
//
// STAND: Hier stehen BEISPIELDATEN. Sie sind bewusst als solche erkennbar
// (Marke `BEISPIEL`, E-Mail auf `.invalid` — eine Endung, die es im echten
// Netz per RFC 2606 nie geben kann). Solange `platzhalter` true ist, bleiben
// die Rechtsseiten hinter dem Zugangs-Gate und tragen einen Warnbalken; siehe
// `istOeffentlich` in ../gate.ts. Der Tausch auf echte Daten betrifft nur
// diese Datei — Werte einsetzen, `platzhalter` auf false.

/**
 * Die Marke, die jeden Beispielwert erkennbar macht.
 *
 * Sie ist der Anker der Sicherung in `anbieter.test.mjs`: Steht
 * `platzhalter: false` (Seiten öffentlich), darf KEIN Feld sie mehr
 * enthalten. Damit kann kein erfundenes Impressum ins Netz gehen, auch nicht
 * durch einen halb erledigten Tausch.
 */
export const BEISPIEL_MARKE = "BEISPIEL";

export interface Anbieterangaben {
  /** Firma genau wie im Handelsregister, mit Rechtsform. */
  firma: string;
  /** Vertretungsberechtigter — bei der UG der Geschäftsführer. */
  vertreten: string;
  /**
   * Straße und Hausnummer, ladungsfähig. Ein Postfach genügt gesetzlich
   * NICHT. Hier steht die c/o-Anschrift des Impressumsservice, damit die
   * Privatanschrift nicht in einem öffentlichen Repository landet.
   */
  strasse: string;
  /** Postleitzahl und Ort. */
  ort: string;
  land: string;
  /** Weg zur schnellen elektronischen Kontaktaufnahme (§ 5 Abs. 1 Nr. 2 DDG). */
  email: string;
  /** Registergericht, z. B. „Amtsgericht Charlottenburg". */
  registergericht: string;
  /** Registernummer, z. B. „HRB 123456". */
  hrb: string;
  /**
   * Umsatzsteuer-Identifikationsnummer nach § 27a UStG.
   *
   * `null`, wenn keine vorhanden ist — dann entfällt die Angabe. Wer eine
   * hat, MUSS sie nennen; deshalb ist das Feld ausdrücklich vorhanden und
   * nicht einfach weggelassen.
   */
  ustIdNr: string | null;
  /**
   * true = Beispieldaten, noch nicht gültig.
   *
   * Steuert zwei Dinge: den Warnbalken auf den Rechtsseiten und die Frage, ob
   * die Seiten ohne Zugangscode erreichbar sind.
   */
  platzhalter: boolean;
}

export const ANBIETER: Anbieterangaben = {
  firma: `${BEISPIEL_MARKE} UG (haftungsbeschränkt)`,
  vertreten: `${BEISPIEL_MARKE} Geschäftsführung`,
  strasse: `c/o ${BEISPIEL_MARKE}-Impressumsservice, Musterstraße 1`,
  ort: "00000 Musterstadt",
  land: "Deutschland",
  email: "impressum@beispiel.invalid",
  registergericht: `Amtsgericht Musterstadt (${BEISPIEL_MARKE})`,
  hrb: `HRB 00000 ${BEISPIEL_MARKE}`,
  ustIdNr: `DE000000000 (${BEISPIEL_MARKE})`,
  platzhalter: true,
};

/**
 * Die Felder, ohne die ein Impressum unvollständig ist.
 *
 * `ustIdNr` fehlt hier bewusst: Die Angabe ist nur Pflicht, WENN eine Nummer
 * existiert. `platzhalter` ist keine Angabe, sondern ein Schalter.
 */
const PFLICHTFELDER = [
  "firma",
  "vertreten",
  "strasse",
  "ort",
  "land",
  "email",
  "registergericht",
  "hrb",
] as const satisfies readonly (keyof Anbieterangaben)[];

/**
 * Welche Pflichtangaben leer sind — leere Liste heißt vollständig.
 *
 * Prüft auf Leerzeichen-Inhalt mit, weil ein " " sonst als gefüllt gilt.
 */
export function fehlendePflichtangaben(angaben: Anbieterangaben): string[] {
  return PFLICHTFELDER.filter((feld) => angaben[feld].trim() === "");
}

/**
 * Steckt in irgendeinem Feld noch ein Beispielwert?
 *
 * Diese Frage entscheidet, ob ein Impressum echt ist — nicht der Schalter
 * `platzhalter` allein. Beide zusammen fangen den gefährlichen Fall: Schalter
 * schon umgelegt, Werte noch erfunden.
 */
export function enthaeltBeispielwerte(angaben: Anbieterangaben): boolean {
  const werte = [
    angaben.firma,
    angaben.vertreten,
    angaben.strasse,
    angaben.ort,
    angaben.land,
    angaben.email,
    angaben.registergericht,
    angaben.hrb,
    angaben.ustIdNr ?? "",
  ];
  return werte.some(
    (wert) => wert.includes(BEISPIEL_MARKE) || wert.endsWith(".invalid")
  );
}

/**
 * Sind die Angaben echt, vollständig und damit veröffentlichungsreif?
 *
 * Die einzige Stelle, die über die Sichtbarkeit der Rechtsseiten entscheidet.
 * Bewusst streng: Ein unvollständiges oder erfundenes Impressum ist schlechter
 * als gar keines — es ist eine falsche Angabe im Rechtsverkehr.
 */
export function angabenSindEcht(angaben: Anbieterangaben = ANBIETER): boolean {
  return (
    !angaben.platzhalter &&
    fehlendePflichtangaben(angaben).length === 0 &&
    !enthaeltBeispielwerte(angaben)
  );
}

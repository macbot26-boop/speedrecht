// Kanonische Anbieterliste — eine Quelle für UI-Auswahl (Picker) und
// Server-Validierung der Bestätigung. Reihenfolge = Marktgröße (Auswahl-UI).

export const FESTNETZ_ANBIETER = [
  "Telekom",
  "Vodafone",
  "o2",
  "1&1",
  "PŸUR",
  "Deutsche Glasfaser",
  "NetCologne",
  "EWE",
  "M-net",
] as const;

/** Auswahl "mein Anbieter steht nicht in der Liste". */
export const ANBIETER_SONSTIGE = "Sonstiger";

export const BESTAETIGBARE_ANBIETER: ReadonlySet<string> = new Set([
  ...FESTNETZ_ANBIETER,
  ANBIETER_SONSTIGE,
]);

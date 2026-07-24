// Urteil: Passt die gemessene Geschwindigkeit zu dem bestellten Tarif?
//
// Die drei Referenzwerte stammen aus dem Produktinformationsblatt (§ 1
// TK-Transparenzverordnung) und sind auch die Grundlage des gesetzlichen
// Minderungs-/Kündigungsrechts (§ 57 Abs. 4 TKG):
//   - download_max_mbps    = beworbene "bis-zu"-Rate (nur Obergrenze)
//   - download_normal_mbps = normalerweise verfügbare Rate  ← ehrlicher Anker
//   - download_min_mbps    = vertraglich zugesicherte Mindestrate
//
// Der Claim wird bewusst an "normalerweise" verankert, nicht an "bis zu":
// "bis zu" ist rechtlich nur eine Obergrenze, eine Unterschreitung also kein
// Mangel. Unter der normalerweise verfügbaren Rate zu liegen ist der
// belastbare Punkt.
//
// Pur gehalten (Tarif als Parameter) — testbar ohne Bundler-Magie.

import { aufAnzeige } from "./anzeige.ts";
import type { Tarif } from "./vorschlag";

/**
 * - "gut"        — Messung ≥ normalerweise verfügbarer Rate (alles im Rahmen)
 * - "unter_norm" — unter der normalerweise verfügbaren Rate, aber ≥ Minimum
 * - "unter_min"  — unter der vertraglich zugesicherten Mindestrate
 */
export type UrteilTon = "gut" | "unter_norm" | "unter_min";

/**
 * Bewertet eine gemessene Download-Geschwindigkeit gegen den bestellten Tarif.
 *
 * Fehlen normal-/Minimum-Werte im Datensatz, wird NICHT von einem Mangel
 * ausgegangen ("gut") — ohne belastbaren Referenzwert kein Vorwurf.
 */
export function tarifUrteil(tarif: Tarif, gemessenMbps: number): UrteilTon {
  const gemessen = aufAnzeige(gemessenMbps);
  const normal = tarif.download_normal_mbps;
  const min = tarif.download_min_mbps;
  if (min != null && gemessen < aufAnzeige(min)) return "unter_min";
  if (normal != null && gemessen < aufAnzeige(normal)) return "unter_norm";
  return "gut";
}

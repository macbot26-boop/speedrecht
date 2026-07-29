// Was in der Messreihen-Box steht — und aus welcher Lage heraus sie gelesen wird.
//
// Der Kasten mit dem Zähler ("Messtag 1 von 3 · 4 von 10 Messungen") hing
// bisher in der Handlungsleiter und erschien damit nur nach einem schlechten
// Urteil. Dort ist jeder Satz eine Aufforderung, weil der Nutzer etwas
// erreichen will: Er sammelt Messtage, um seinen Anbieter belangen zu können.
//
// Bei gutem Urteil steht derselbe Kasten in einer anderen Lage. "Für ein
// Urteil fehlen noch 2 Messtage — miss an einem anderen Tag erneut" wäre dort
// eine Hausaufgabe ohne Anlass: Wer nichts zu beanstanden hat, muss gar nichts
// beweisen. Die Zahlen bleiben dieselben, der Ton ändert sich.
//
// Und ein Fall, den es nur bei gutem Urteil gibt: Die Messung von heute passt,
// die Reihe der Vortage aber nicht. Das ist kein Widerspruch, sondern zwei
// verschiedene Maßstäbe — das Urteil oben misst gegen die "normalerweise
// verfügbare" Rate, das erste der drei gesetzlichen Anzeichen gegen 90 % der
// "bis-zu"-Rate. Ein Tarif "bis zu 250, normal 100" bei gemessenen 120 ist
// zugleich vertragsgemäß und auffällig. Verschwiegen sähe es aus, als hätte die
// App die schlechten Tage vergessen.
//
// Rein gehalten (Stand und Zahlen als Parameter) — testbar ohne Bundler.

import { MINDEST_MESSTAGE, type KriteriumStand } from "../tarife/kriterien.ts";

/**
 * Aus welcher Lage der Nutzer auf seine Reihe schaut.
 *
 * Nicht dasselbe wie der Stand der Reihe: "urteil_gut" beschreibt die HEUTE
 * gemessene Zahl, `gesamt` die Reihe der letzten Messtage. Beide können
 * auseinanderlaufen, und genau dafür gibt es zwei Parameter.
 */
export type ReihenLage = "urteil_schlecht" | "urteil_gut";

export interface ReihenStand {
  /** Der Satz unter dem Zähler. */
  satz: string;
  /**
   * Ob unter dem Satz der Weg zur offiziellen Breitbandmessung stehen soll.
   *
   * Nur bei gutem Urteil wahr: Nach einem schlechten Urteil steht der Weg
   * ohnehin schon als eigene Stufe in der Handlungsleiter, und zweimal
   * derselbe Link auf einem Schirm liest sich wie ein Fehler.
   */
  weiterZurOffiziellen: boolean;
}

/**
 * Der Satz, der unter dem Zähler der Messreihe steht.
 *
 * Die Texte der Lage "urteil_schlecht" sind unverändert die von zuvor — sie
 * stehen hier nur nicht mehr in der Anzeige, sondern an einer Stelle, die
 * geprüft wird.
 */
export function reihenStand(
  gesamt: KriteriumStand,
  messtage: number,
  lage: ReihenLage
): ReihenStand {
  const fehlendeTage = Math.max(0, MINDEST_MESSTAGE - messtage);
  const gut = lage === "urteil_gut";

  // Bewusst kein Warnton bei "auffaellig": Das ist eine Vorabprüfung auf
  // unserem eigenen Server, kein Nachweis. Der Satz sagt, was der nächste
  // Schritt ist — nicht, dass ein Anspruch bestünde.
  if (gesamt === "auffaellig") {
    return {
      satz: gut
        ? "Deine Messreihe zeigt trotzdem eines der drei Anzeichen — die heutige Messung hebt die Tage davor nicht auf. Damit lohnt sich der Aufwand der offiziellen Messung."
        : "Deine Messreihe zeigt eines der drei Anzeichen. Damit lohnt sich der Aufwand der offiziellen Messung.",
      weiterZurOffiziellen: gut,
    };
  }

  if (gesamt === "unauffaellig") {
    return {
      satz: gut
        ? "Auch über mehrere Messtage gelesen zeigt deine Reihe keines der drei Anzeichen."
        : "Deine Messreihe zeigt bisher keines der drei Anzeichen. Weitere Messtage machen das Bild sicherer.",
      weiterZurOffiziellen: false,
    };
  }

  // Ohne Referenzwerte im Produktinformationsblatt gibt es nichts zu prüfen —
  // das hängt am Vertrag, nicht am heutigen Urteil, und lautet in beiden Lagen
  // gleich.
  if (gesamt === "kein_referenzwert") {
    return {
      satz: "Das Produktinformationsblatt dieses Vertrags nennt keine Raten, gegen die sich prüfen ließe.",
      weiterZurOffiziellen: false,
    };
  }

  // Zu wenig Daten. Nach einem schlechten Urteil ist die fehlende Zahl die
  // ehrlichste Auskunft, die wir geben können — nicht "kein Anspruch", sondern
  // "dafür fehlen noch zwei Tage". Nach einem guten Urteil wäre dieselbe Zahl
  // eine Aufforderung ohne Anlass, deshalb steht dort, wofür die Reihe gut ist.
  if (gut) {
    return {
      satz: "Deine Reihe sammelt sich auf diesem Gerät weiter. Klemmt es später einmal, hast du die Messtage davor schon beisammen — gegenüber dem Anbieter zählt keine einzelne Zahl.",
      weiterZurOffiziellen: false,
    };
  }

  return {
    satz:
      fehlendeTage > 0
        ? `Für ein Urteil ${fehlendeTage === 1 ? "fehlt noch ein Messtag" : `fehlen noch ${fehlendeTage} Messtage`} — miss an einem anderen Tag erneut. Deine Reihe bleibt auf diesem Gerät gespeichert.`
        : "Für ein Urteil fehlen noch Messungen — miss im Laufe des Tages erneut.",
    weiterZurOffiziellen: false,
  };
}

/**
 * Der Satz, der bei gutem Urteil ÜBER der Messreihe steht.
 *
 * Dieselbe Regel wie beim Angebots-Regal: Der erste Satz muss das Urteil
 * bestätigen, bevor etwas anderes kommt. Ohne ihn läse sich der Kasten als
 * Widerruf ("passt zu deinem Tarif — aber schau mal hier"), und dann steht die
 * Glaubwürdigkeit des Urteils zur Debatte, an der das ganze Produkt hängt.
 */
export function bestaetigungsSatz(gesamt: KriteriumStand): string {
  if (gesamt === "auffaellig") {
    return "Die Messung von gerade eben passt zu deinem Vertrag. Über mehrere Messtage gelesen sieht deine Leitung allerdings anders aus:";
  }
  return "Die Messung von gerade eben passt zu deinem Vertrag. Eine einzelne Messung ist aber eine Momentaufnahme — was zählt, ist die Reihe über mehrere Tage:";
}

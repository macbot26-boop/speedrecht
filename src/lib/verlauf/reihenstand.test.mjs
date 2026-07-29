import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { bestaetigungsSatz, reihenStand } from "./reihenstand.ts";
import { MINDEST_MESSTAGE, vorpruefung } from "../tarife/kriterien.ts";
import { tarifUrteil } from "../tarife/urteil.ts";

const daten = JSON.parse(
  readFileSync(new URL("../tarife/tarife.generated.json", import.meta.url), "utf8")
);

// --- Lage "urteil_schlecht": Wortlaut wie zuvor ------------------------------
//
// Diese sechs Tests sind Sicherungen, keine Neuerungen: Die Sätze standen
// vorher in der Anzeige und sollen sich durch den Umzug hierher nicht um ein
// Zeichen verändert haben. Der schlechte Zweig ist der rechtlich heikle — was
// dort steht, geht in die Entscheidung ein, den Anbieter anzuschreiben.

test("schlechtes Urteil, auffällige Reihe: Wortlaut unverändert", () => {
  const { satz, weiterZurOffiziellen } = reihenStand("auffaellig", 3, "urteil_schlecht");
  assert.equal(
    satz,
    "Deine Messreihe zeigt eines der drei Anzeichen. Damit lohnt sich der Aufwand der offiziellen Messung."
  );
  // Der Weg dorthin steht schon als eigene Stufe in der Handlungsleiter.
  assert.equal(weiterZurOffiziellen, false);
});

test("schlechtes Urteil, unauffällige Reihe: Wortlaut unverändert", () => {
  assert.equal(
    reihenStand("unauffaellig", 3, "urteil_schlecht").satz,
    "Deine Messreihe zeigt bisher keines der drei Anzeichen. Weitere Messtage machen das Bild sicherer."
  );
});

test("schlechtes Urteil, ein Messtag fehlt: Einzahl", () => {
  assert.equal(
    reihenStand("zu_wenig_daten", MINDEST_MESSTAGE - 1, "urteil_schlecht").satz,
    "Für ein Urteil fehlt noch ein Messtag — miss an einem anderen Tag erneut. Deine Reihe bleibt auf diesem Gerät gespeichert."
  );
});

test("schlechtes Urteil, zwei Messtage fehlen: Mehrzahl mit Zahl", () => {
  assert.equal(
    reihenStand("zu_wenig_daten", 1, "urteil_schlecht").satz,
    "Für ein Urteil fehlen noch 2 Messtage — miss an einem anderen Tag erneut. Deine Reihe bleibt auf diesem Gerät gespeichert."
  );
});

test("schlechtes Urteil, Messtage reichen aber Messungen fehlen: anderer Satz", () => {
  // Drei Messtage beisammen, trotzdem "zu_wenig_daten" — dann hängt es am
  // Üblich-Kriterium, das zehn Messungen braucht. Wer hier "miss an einem
  // anderen Tag" läse, wartete einen Tag, der nichts bringt.
  assert.equal(
    reihenStand("zu_wenig_daten", MINDEST_MESSTAGE, "urteil_schlecht").satz,
    "Für ein Urteil fehlen noch Messungen — miss im Laufe des Tages erneut."
  );
});

test("mehr Messtage als nötig zählen nicht negativ zurück", () => {
  // Math.max(0, …): Bei 5 Messtagen darf kein "-2 Messtage" entstehen.
  assert.equal(
    reihenStand("zu_wenig_daten", MINDEST_MESSTAGE + 2, "urteil_schlecht").satz,
    "Für ein Urteil fehlen noch Messungen — miss im Laufe des Tages erneut."
  );
});

// --- Lage "urteil_gut": kein Auftrag, wo nichts zu beanstanden ist -----------

test("gutes Urteil, zu wenig Daten: Feststellung statt Aufforderung", () => {
  const { satz } = reihenStand("zu_wenig_daten", 1, "urteil_gut");
  // Kein "miss erneut" und keine Fehlmengen-Zahl: Wer nichts zu beanstanden
  // hat, muss nichts beweisen.
  assert.ok(!satz.includes("miss"), `unerwartete Aufforderung: ${satz}`);
  assert.ok(!satz.includes("fehlen"), `unerwartete Fehlmenge: ${satz}`);
  assert.ok(satz.includes("Gerät"), "sollte sagen, wo die Reihe bleibt");
});

test("gutes Urteil, unauffällige Reihe: bestätigt über mehrere Tage", () => {
  const { satz, weiterZurOffiziellen } = reihenStand("unauffaellig", 3, "urteil_gut");
  assert.equal(satz, "Auch über mehrere Messtage gelesen zeigt deine Reihe keines der drei Anzeichen.");
  assert.equal(weiterZurOffiziellen, false);
});

test("gutes Urteil, auffällige Reihe: Widerspruch wird benannt, nicht verschwiegen", () => {
  const { satz, weiterZurOffiziellen } = reihenStand("auffaellig", 3, "urteil_gut");
  assert.ok(satz.includes("trotzdem"), `Widerspruch nicht benannt: ${satz}`);
  assert.ok(
    satz.includes("offiziellen Messung"),
    `Weg zur offiziellen Messung fehlt: ${satz}`
  );
  // Nur hier: Ohne die Handlungsleiter gäbe es sonst keinen Weg von der
  // Feststellung zum nächsten Schritt — eine Sackgasse.
  assert.equal(weiterZurOffiziellen, true);
});

test("Weg zur offiziellen Messung steht in genau einer Lage", () => {
  const staende = ["auffaellig", "unauffaellig", "zu_wenig_daten", "kein_referenzwert"];
  const lagen = ["urteil_schlecht", "urteil_gut"];
  const mit = [];
  for (const gesamt of staende) {
    for (const lage of lagen) {
      for (const tage of [0, 1, 2, 3, 5]) {
        if (reihenStand(gesamt, tage, lage).weiterZurOffiziellen) mit.push([gesamt, lage]);
      }
    }
  }
  assert.deepEqual([...new Set(mit.map((p) => p.join("/")))], ["auffaellig/urteil_gut"]);
});

test("fehlender Referenzwert lautet in beiden Lagen gleich", () => {
  // Das hängt am Produktinformationsblatt des Vertrags, nicht am heutigen
  // Messwert — zwei Formulierungen wären hier eine erfundene Unterscheidung.
  const erwartet =
    "Das Produktinformationsblatt dieses Vertrags nennt keine Raten, gegen die sich prüfen ließe.";
  assert.equal(reihenStand("kein_referenzwert", 3, "urteil_schlecht").satz, erwartet);
  assert.equal(reihenStand("kein_referenzwert", 3, "urteil_gut").satz, erwartet);
});

test("jede Lage liefert immer einen nicht-leeren Satz", () => {
  for (const gesamt of ["auffaellig", "unauffaellig", "zu_wenig_daten", "kein_referenzwert"]) {
    for (const lage of ["urteil_schlecht", "urteil_gut"]) {
      for (const tage of [0, 1, 2, 3, 4]) {
        const { satz } = reihenStand(gesamt, tage, lage);
        assert.ok(satz.length > 0, `leer bei ${gesamt}/${lage}/${tage}`);
      }
    }
  }
});

// --- Der bestätigende Satz über der Reihe ------------------------------------

test("bestätigender Satz beginnt immer mit der Bestätigung", () => {
  // Die Regel aus dem Angebots-Regal: Erst das Urteil bestätigen, dann alles
  // andere. Sonst liest sich der Kasten als Widerruf des eigenen Urteils.
  for (const gesamt of ["auffaellig", "unauffaellig", "zu_wenig_daten", "kein_referenzwert"]) {
    assert.ok(
      bestaetigungsSatz(gesamt).startsWith("Die Messung von gerade eben passt zu deinem Vertrag."),
      `Bestätigung fehlt bei ${gesamt}`
    );
  }
});

test("bestätigender Satz kündigt bei auffälliger Reihe den Bruch an", () => {
  assert.ok(bestaetigungsSatz("auffaellig").includes("allerdings"));
  assert.ok(!bestaetigungsSatz("unauffaellig").includes("allerdings"));
});

test("bestätigender Satz führt in die Reihe hinein", () => {
  for (const gesamt of ["auffaellig", "unauffaellig", "zu_wenig_daten"]) {
    assert.ok(bestaetigungsSatz(gesamt).endsWith(":"), `kein Doppelpunkt bei ${gesamt}`);
  }
});

// --- Warum es diesen Fall überhaupt gibt ------------------------------------

test("gutes Urteil und auffällige Reihe sind gleichzeitig möglich", () => {
  // Der Fall, für den dieses Modul gebaut ist. Er entsteht nicht aus einem
  // Fehler, sondern aus zwei verschiedenen Maßstäben: Das Urteil misst gegen
  // die "normalerweise verfügbare" Rate, das 90-%-Anzeichen gegen 90 % der
  // "bis-zu"-Rate. Liegt "normal" weit unter der Maximalrate, ist beides
  // zugleich wahr — und zwar nicht selten.
  const tarif = daten.tarife.find(
    (t) =>
      t.download_max_mbps !== null &&
      t.download_normal_mbps !== null &&
      t.download_min_mbps !== null &&
      t.download_normal_mbps < 0.9 * t.download_max_mbps
  );
  assert.ok(tarif, "kein Tarif mit Spielraum zwischen 'normal' und 90 % von 'bis zu'");

  // Genau die normalerweise verfügbare Rate: vertragsgemäß, aber unter 90 %
  // der beworbenen Maximalrate.
  const gemessen = tarif.download_normal_mbps;
  assert.equal(tarifUrteil(tarif, gemessen), "gut");

  const werte = ["2026-07-26", "2026-07-27", "2026-07-28"].map((tag) => ({ mbps: gemessen, tag }));
  assert.equal(vorpruefung(tarif, werte).gesamt, "auffaellig");
});

test("solch ein Tarif ist im Datensatz kein Einzelfall", () => {
  // Wäre das eine Handvoll Verträge, wäre der ganze Zweig eine Randnotiz.
  const mitSpielraum = daten.tarife.filter(
    (t) =>
      t.download_max_mbps !== null &&
      t.download_normal_mbps !== null &&
      t.download_normal_mbps < 0.9 * t.download_max_mbps
  );
  assert.ok(
    mitSpielraum.length > daten.tarife.length / 10,
    `nur ${mitSpielraum.length} von ${daten.tarife.length} Tarifen`
  );
});

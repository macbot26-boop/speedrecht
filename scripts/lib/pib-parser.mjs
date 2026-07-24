// Parser für Produktinformationsblätter (PIB).
//
// § 1 TK-Transparenzverordnung schreibt jedem Anbieter vor, je Tarif genau
// sechs Geschwindigkeits-Werte zu veröffentlichen (Download und Upload,
// jeweils maximal / normalerweise / minimal). WAS drinsteht ist also
// gesetzlich festgelegt — WIE es gesetzt wird, nicht. Jeder Anbieter baut
// sein Blatt anders:
//
//   Telekom, Vodafone, 1&1, PŸUR, DG   eine Tabelle, Werte auf der Beschriftungszeile
//   o2                                 MEHRERE Tarife pro Blatt, jeder mit mehreren
//                                      Technologie-Tabellen, Beschriftungen umgebrochen,
//                                      Werte teils in der Zeile ÜBER der Beschriftung
//
// Deshalb liest dieser Parser nicht zeilenweise, sondern SPALTENWEISE:
// `pdftotext -layout` erhält die waagerechte Position, also merken wir uns,
// wo "Download" und "Upload" stehen, und ordnen jede gefundene Rate der
// näher liegenden Spalte zu. Das ist der einzige Ansatz, der auch dann noch
// stimmt, wenn eine Zelle über drei Zeilen läuft.
//
// Grundregel des Projekts: Die Geschwindigkeiten sind die Grundlage für
// unser Urteil "du bekommst zu wenig". Ein stiller Lesefehler wäre eine
// falsche Tatsachenbehauptung gegenüber dem Nutzer. Darum gilt hier:
// unvollständige Geschwindigkeiten → LAUTER Fehler, niemals Raten.
// Nebenangaben (Preis, Versionsstand) dürfen fehlen, werden aber gezählt.

/**
 * Zahl aus einem PIB → JS-Zahl.
 *
 * Die Blätter sind nicht einheitlich: meist deutsch ("83,8", "1.000"),
 * einzelne 1&1-Blätter aber englisch ("0.768", "5.8"). Der Punkt ist also
 * mal Tausender-, mal Dezimaltrennzeichen — und die Verwechslung ist
 * teuer: "0.768" als Tausenderpunkt gelesen ergäbe 768 statt 0,768.
 *
 * Entscheidungsregel: Ein Komma macht den Punkt zum Tausendertrenner.
 * Ohne Komma gilt der Punkt nur dann als Tausendertrenner, wenn die Zahl
 * auch wirklich so aussieht — führende Null ("0.768") gibt es dabei nicht.
 */
export function zahl(text) {
  const roh = String(text).trim();
  if (roh.includes(",")) return Number(roh.replace(/\./g, "").replace(",", "."));
  if (/^[1-9]\d{0,2}(?:\.\d{3})+$/.test(roh)) return Number(roh.replace(/\./g, ""));
  return Number(roh);
}

// Eine Datenrate samt Einheit. kbit/s und Gbit/s kommen in alten Blättern vor.
const RATE = /(\d[\d.]*(?:,\d+)?)\s*(k|M|G)?bits?\/s/gi;

const EINHEIT = { k: 0.001, m: 1, g: 1000 };

function alsMbit(zahlText, einheit) {
  const wert = zahl(zahlText);
  if (!Number.isFinite(wert)) return null;
  return wert * (EINHEIT[(einheit || "M").toLowerCase()] ?? 1);
}

// Zeilen, die zu einer Tabelle gehören, aber keine Überschrift sind.
const NUR_TECHNIK =
  /^(?:(?:und|oder|bzw\.?|Glasfaser|Kabel|DSL|VDSL|SVDSL|ADSL|G\.?Fast|GPON|DOCSIS|Ethernet|Mobilfunk|LTE|[\w.-]*-DSL)[\s,/]*)+$/i;

const ZEILEN_MUSTER = [
  // Ältere Vodafone-Blätter beschriften die Höchstrate als "Geschätzter
  // Maximalwert" — teils über zwei Zeilen umgebrochen, sodass nur noch
  // "Maximalwert" am Zeilenanfang steht.
  { schluessel: "max", muster: /^\s*(?:Gesch[äa]tzter\s+)?Maximal(?:wert)?\b/i },
  { schluessel: "normal", muster: /^\s*Normalerweise\b/i },
  { schluessel: "min", muster: /^\s*Minimal\b/i },
];

const ABSCHNITTS_ENDE = /^\s*\d?\s*Weitere\s+Produktinformationen/i;

/**
 * Kopfzeile einer Geschwindigkeits-Tabelle? Muss Download UND Upload
 * enthalten, in dieser Reihenfolge, und selbst keine Rate tragen (sonst
 * wäre es eine Wertezeile).
 */
function spaltenKopf(zeile) {
  if (zeile.length > 250 || /bits?\/s/i.test(zeile)) return null;
  const dl = /Download/i.exec(zeile);
  const up = /Upload/i.exec(zeile);
  if (!dl || !up || dl.index >= up.index) return null;
  return { download: dl.index, upload: up.index };
}

/**
 * Liest die Raten aus einem Zeilenfenster und ordnet sie über die
 * waagerechte Position der Download- bzw. Upload-Spalte zu. Je Spalte
 * zählt der ERSTE Treffer — nachgestellte Erläuterungen ("Bei Glasfaser
 * 50 Mbit/s in ausgewählten Regionen") kommen immer danach und werden
 * dadurch verworfen.
 */
/**
 * Ist diese Rate der eigentliche Zellenwert — oder nur ein erläuternder
 * Zusatz? Blätter schreiben neben den Wert regionale Ausnahmen ("In
 * bestimmten Gebieten 10 MBit/s", "Bei Glasfaser 50 Mbit/s oder 125
 * Mbit/s"). Wer die mitliest, schreibt dem Nutzer einen fremden Vertrag zu.
 * Der echte Wert steht immer allein in seiner Spalte.
 */
function istZusatz(zeile, position) {
  const davor = zeile
    .slice(0, position)
    .split(/\s{2,}/)
    .pop()
    // Der Wert der Nachbarspalte darf nur durch ein Leerzeichen getrennt
    // sein — er macht diese Rate nicht zum Zusatz.
    .replace(/\d[\d.,]*\s*[kMG]?bits?\/s\s*$/i, "");
  return /[A-Za-zÄÖÜäöüß]/.test(davor);
}

function ratenDerZeile(zeile, spalten) {
  let download = null;
  let upload = null;
  for (const treffer of zeile.matchAll(RATE)) {
    const wert = alsMbit(treffer[1], treffer[2]);
    if (wert === null || istZusatz(zeile, treffer.index)) continue;
    const naeherAmDownload =
      Math.abs(treffer.index - spalten.download) <=
      Math.abs(treffer.index - spalten.upload);
    if (naeherAmDownload) {
      if (download === null) download = wert;
    } else if (upload === null) {
      upload = wert;
    }
  }
  return { download, upload };
}

function zelleLesen(zeilen, von, bis, spalten) {
  let download = null;
  let upload = null;
  for (let i = von; i <= bis; i++) {
    if (zeilen[i] === undefined) continue;
    const zeile = ratenDerZeile(zeilen[i], spalten);
    if (download === null) download = zeile.download;
    if (upload === null) upload = zeile.upload;
  }
  return { download, upload };
}

const VARIANTE = /bei\s+([A-Za-zÄÖÜäöüß.]+)-Technologie/gi;

/**
 * Manche 1&1-Blätter führen ZWEI Anschlussarten in derselben Tabelle:
 * jede Zelle trägt eine Zeile "… bei VDSL-Technologie" und eine "… bei
 * Glasfaser-Technologie". Das sind in Wahrheit zwei Verträge mit deutlich
 * verschiedenen Werten (VDSL 100/83,8/54 gegen Glasfaser 100/100/80) —
 * über die Beschriftungen allein nicht auseinanderzuhalten, weil die
 * Zeilen abwechselnd über und unter ihrer Beschriftung stehen.
 *
 * Darum hier über die Technologie gruppiert: je Anschlussart erscheinen
 * die drei gesetzlichen Zeilen in der Reihenfolge maximal, normalerweise,
 * minimal. Ob die Annahme trägt, prüft anschließend die Plausibilitäts-
 * kontrolle (minimal ≤ normalerweise ≤ maximal).
 *
 * Rückgabe: null, wenn das Blatt diese Form nicht hat.
 */
function variantenLesen(zeilen, start, ende, spalten) {
  const jeTechnologie = new Map();
  for (let i = start + 1; i < ende; i++) {
    const zeile = zeilen[i];
    const treffer = [...zeile.matchAll(VARIANTE)];
    if (treffer.length === 0) continue;
    const technologie = treffer[0][1];
    const raten = ratenDerZeile(zeile, spalten);
    if (raten.download === null && raten.upload === null) continue;
    if (!jeTechnologie.has(technologie)) jeTechnologie.set(technologie, []);
    jeTechnologie.get(technologie).push(raten);
  }

  if (jeTechnologie.size < 2) return null;
  const varianten = [];
  for (const [technologie, zeilenWerte] of jeTechnologie) {
    // Genau drei Zeilen je Anschlussart — sonst haben wir die Form nicht
    // verstanden und lassen lieber die Finger davon.
    if (zeilenWerte.length !== 3) return null;
    const [max, normal, min] = zeilenWerte;
    varianten.push({ zugang: technologie, max, normal, min });
  }
  return varianten;
}

/**
 * Überschrift des Tarif-Blocks über einer Tabelle — bei o2 steht dort der
 * eigentliche Tarifname ("O2 Home L 250"), weil ein Blatt mehrere Tarife
 * trägt. Wir steigen von der Kopfzeile nach oben und überspringen alles,
 * was erkennbar zur Tabelle gehört. Fließtext (lange Zeile) bedeutet: hier
 * ist keine Überschrift mehr, dann gilt der Dokumenttitel.
 */
function blockUeberschrift(zeilen, kopfZeile) {
  for (let i = kopfZeile - 1; i >= 0 && i >= kopfZeile - 30; i--) {
    const z = zeilen[i].trim();
    if (!z) continue;
    if (/bits?\/s/i.test(z)) continue;
    if (NUR_TECHNIK.test(z)) continue;
    // Kopfzeile einer weiter oben liegenden Tabelle desselben Blocks
    // (o2 setzt dort auch die Zugangsart hinein) — gehört zur Tabelle.
    if (spaltenKopf(zeilen[i])) continue;
    if (/^\d*\s*Daten[üu]bertragungsrate/i.test(z)) continue;
    if (/^(?:Maximal|Normalerweise|stehend|Minimal)\b/i.test(z)) continue;
    if (/^(?:im|Im)\s+(?:Download|Upload)\b/i.test(z)) continue;
    if (/(?:^|\s)über\s/i.test(z) && z.length < 60) continue;
    if (z.length > 80) return null;
    // Letzte Zeile eines Fließtext-Absatzes ("… vor Beginn Ihrer
    // Bestellung.") ist kurz und sähe wie eine Überschrift aus. Tarifnamen
    // enden nicht mit Satzzeichen und beginnen nicht klein.
    if (/[.,;:]$/.test(z) || /^[a-zäöüß]/.test(z)) return null;
    return z;
  }
  return null;
}

/** Zugangsart einer Tabelle ("über DSL und Glasfaser" → "DSL und Glasfaser"). */
function zugangFinden(zeilen, kopfZeile, spalten) {
  const teile = [];
  // Alles links der Download-Spalte. Das abgeschnittene "im" von
  // "im Download" bleibt sonst am Ende hängen.
  const vorDerSpalte = zeilen[kopfZeile]
    .slice(0, spalten.download)
    .replace(/\s+(?:im|Im)\s*$/, "");
  const amKopf = /(?:^|\s)über\s+(.+?)\s*$/i.exec(vorDerSpalte);
  if (amKopf) teile.push(amKopf[1].trim());

  for (let i = kopfZeile + 1; i <= kopfZeile + 2 && i < zeilen.length; i++) {
    const z = zeilen[i].trim();
    if (!z || /bits?\/s/i.test(z)) continue;
    const eigeneZeile = /^über\s+(.+)$/i.exec(z);
    if (eigeneZeile) {
      teile.push(eigeneZeile[1].trim());
      continue;
    }
    // Umbruch-Fortsetzung einer Zugangsangabe ("… und" / "Glasfaser").
    if (teile.length > 0 && NUR_TECHNIK.test(z)) teile.push(z);
  }
  const zusammen = teile.join(" ").replace(/\s+/g, " ").trim();
  return zusammen || null;
}

/**
 * Findet alle vollständigen Geschwindigkeits-Tabellen eines Blattes.
 * Exportiert, damit die Tests genau diese Zuordnung prüfen können.
 */
export function tabellenFinden(text) {
  const zeilen = text.split("\n");

  const koepfe = [];
  zeilen.forEach((zeile, i) => {
    const spalten = spaltenKopf(zeile);
    if (spalten) koepfe.push({ zeile: i, spalten });
  });

  const tabellen = [];
  for (let k = 0; k < koepfe.length; k++) {
    const { zeile: start, spalten } = koepfe[k];

    let ende = k + 1 < koepfe.length ? koepfe[k + 1].zeile : zeilen.length;
    for (let i = start + 1; i < ende; i++) {
      if (ABSCHNITTS_ENDE.test(zeilen[i])) {
        ende = i;
        break;
      }
    }

    const marker = [];
    for (let i = start + 1; i < ende; i++) {
      for (const { schluessel, muster } of ZEILEN_MUSTER) {
        if (muster.test(zeilen[i]) && !marker.some((m) => m.schluessel === schluessel)) {
          marker.push({ schluessel, zeile: i });
        }
      }
    }
    // Ohne alle drei gesetzlichen Zeilen ist es keine auswertbare Tabelle
    // (z. B. reine Telefonie-Blätter) — kein Fehler, nur nichts zu holen.
    if (marker.length < 3) continue;
    marker.sort((a, b) => a.zeile - b.zeile);

    // Zwei Anschlussarten in einer Tabelle? Dann trägt jede ihre eigenen
    // drei Zeilen, und die Beschriftungen taugen nicht zur Zuordnung.
    const varianten = variantenLesen(zeilen, start, ende, spalten);
    if (varianten) {
      const ueberschrift = blockUeberschrift(zeilen, start);
      for (const variante of varianten) tabellen.push({ ueberschrift, ...variante });
      continue;
    }

    const werte = {};
    for (let m = 0; m < marker.length; m++) {
      const zeile = marker[m].zeile;
      const vorher = m > 0 ? marker[m - 1].zeile : start;
      // Eine Zelle darf bis zu einer Zeile ÜBER und zwei Zeilen UNTER ihrer
      // Beschriftung reichen (o2 bricht Zellen so um) — aber niemals in die
      // Nachbarzeile hinein, sonst vertauschten sich die Werte.
      const von = Math.max(zeile - 1, vorher + 1, start + 1);
      const grenzeUnten =
        m + 1 < marker.length ? marker[m + 1].zeile - 2 : ende - 1;
      const bis = Math.max(Math.min(zeile + 2, grenzeUnten), zeile);
      werte[marker[m].schluessel] = zelleLesen(zeilen, von, bis, spalten);
    }

    tabellen.push({
      ueberschrift: blockUeberschrift(zeilen, start),
      zugang: zugangFinden(zeilen, start, spalten),
      ...werte,
    });
  }
  return tabellen;
}

/** Dokumenttitel: erste echte Zeile nach dem Blatt-Kopf. */
export function titelFinden(text) {
  const zeilen = text.split("\n").map((z) => z.trim());
  const kopf = zeilen.findIndex((z) => /^Produktinformationsblatt/i.test(z));
  for (let i = kopf + 1; i < zeilen.length && i < kopf + 8; i++) {
    const z = zeilen[i];
    if (!z) continue;
    // Fortsetzung der Kopfzeile ("gem. § 1 TK-Transparenzverordnung").
    if (/^gem(?:äß)?\.?\s*§/i.test(z) || /TK-Transparenzverordnung/i.test(z)) continue;
    // Rechts daneben steht oft "Vermarktet seit …" — durch mehrere
    // Leerzeichen getrennt, also am Spaltensprung abschneiden.
    const titel = z.split(/\s{2,}/)[0].trim();
    // "(Festnetz)" trägt keine Information — hier ist alles Festnetz.
    const gekuerzt = titel.replace(/\s*\((?:Festnetz|Fesnetz)\)\s*$/i, "").trim();
    if (gekuerzt) return gekuerzt;
  }
  return null;
}

const TECHNOLOGIEN = [
  { technologie: "glasfaser-gfast", muster: /g[.\s-]?fast/i },
  { technologie: "glasfaser", muster: /ftth|glasfaser|gpon|fiber|fttb/i },
  { technologie: "kabel", muster: /kabel|docsis|cable/i },
  { technologie: "vdsl", muster: /s?vdsl/i },
  { technologie: "dsl", muster: /dsl/i },
];

/**
 * Technologie aus den Textquellen. Werden mehrere genannt ("über DSL und
 * Glasfaser"), gewinnt die ZUERST genannte — sie ist die Regelversorgung,
 * der Rest sind regionale Sonderfälle.
 */
export function technologieBestimmen(...quellen) {
  for (const quelle of quellen) {
    if (!quelle) continue;
    let beste = null;
    for (const { technologie, muster } of TECHNOLOGIEN) {
      const treffer = muster.exec(quelle);
      if (treffer && (beste === null || treffer.index < beste.index)) {
        beste = { technologie, index: treffer.index };
      }
    }
    if (beste) return beste.technologie;
  }
  return "unbekannt";
}

const PREIS =
  /(?:Komplettprodukt|Listenpreis|monatlicher\s+Preis|Monatliche[sr]?\s+Entgelt|Entgelt|Grundpreis)[\s\S]{0,400}?([\d.]*\d,\d{2})\s*(?:€|EUR)/i;

function preisFinden(text) {
  const treffer = PREIS.exec(text);
  if (!treffer) return null;
  const wert = zahl(treffer[1]);
  return Number.isFinite(wert) && wert > 0 && wert < 1000 ? wert : null;
}

// Wann wurde das BLATT zuletzt gefasst? Der Stichtag der Fassung schlägt
// das Vermarktungsdatum: "Vermarktung seit" sagt, seit wann es den Tarif
// gibt, nicht wie aktuell die Werte sind. Deshalb feste Rangfolge statt
// einer Oder-Verkettung — sonst gewinnt, was zufällig weiter oben steht.
const STAND_MUSTER = [
  /Versionsstand\s*:?\s*(\d{2})[./](\d{2})[./](\d{4})/i,
  /\bStand\s*:?\s*(\d{2})[./](\d{2})[./](\d{4})/i,
  /\bDatum\s*:?\s*(\d{2})[./](\d{2})[./](\d{4})/i,
  /Vermarkt(?:ung|et)\s+seit\s*:?\s*(\d{2})[./](\d{2})[./](\d{4})/i,
];

function versionsstandFinden(text) {
  for (const muster of STAND_MUSTER) {
    const treffer = muster.exec(text);
    if (treffer) return `${treffer[3]}-${treffer[2]}-${treffer[1]}`;
  }
  // Manche Blätter datieren nur auf den Monat ("Stand 01/26").
  const monatJahr = /\bStand\s*:?\s*(\d{2})\/(\d{2})\b/i.exec(text);
  if (monatJahr) return `20${monatJahr[2]}-${monatJahr[1]}`;
  return null;
}

/**
 * Wertet ein komplettes Blatt aus.
 *
 * Rückgabe:
 *   { tarife: [...] }                — mindestens ein auswertbarer Tarif
 *   { uebersprungen: "grund" }       — kein Internet-Tarif (z. B. reine Telefonie)
 *   { fehler: "grund" }              — Tabelle da, aber unlesbar → Abbruch
 */
export function pibAuswerten(text, { slug = "", nurWenn = null } = {}) {
  if (nurWenn && !nurWenn(text)) {
    return { uebersprungen: "kein Festnetz-Internet-Blatt" };
  }

  // Schutz vor Fehlverlinkungen: Auf den Übersichtsseiten zeigen einzelne
  // Einträge nachweislich auf das falsche Blatt — bei Vodafone etwa führt
  // "GigaZuhause 100 Kabel" auf ein Mobilfunk-Blatt. Auch Mobilfunk-PIBs
  // tragen eine Geschwindigkeits-Tabelle; unbemerkt eingelesen stünde beim
  // Nutzer ein Handytarif als sein Hausanschluss. Wer Mobilfunk sagt und
  // Festnetz verschweigt, gehört nicht in diese Tabelle. (Festnetz-Blätter
  // dürfen Mobilfunk erwähnen — o2 nennt es als mögliche Zuführung.)
  if (/Mobilfunk/i.test(text) && !/Festnetz/i.test(text)) {
    return { uebersprungen: "Mobilfunk-Blatt (Verlinkung passt nicht)" };
  }

  const tabellen = tabellenFinden(text);
  if (tabellen.length === 0) {
    return { uebersprungen: "keine Geschwindigkeits-Tabelle" };
  }

  const titel = titelFinden(text);
  if (!titel) return { fehler: "Tarifname nicht lesbar" };

  const preis = preisFinden(text);
  const versionsstand = versionsstandFinden(text);
  // Telekom nennt die Zugangsart nicht "über …", sondern im Fließtext.
  const ausFliesstext = /Internet-Zugang\s+([A-Za-z.\- ]*\d[\d.]*)/.exec(text);

  const mehrereTabellen = tabellen.length > 1;
  const tarife = [];
  const fehler = [];

  tabellen.forEach((tabelle, index) => {
    const fehlend = [];
    for (const zeile of ["max", "normal", "min"]) {
      if (tabelle[zeile]?.download == null) fehlend.push(`${zeile}/Download`);
      if (tabelle[zeile]?.upload == null) fehlend.push(`${zeile}/Upload`);
    }
    if (fehlend.length > 0) {
      fehler.push(`Tabelle ${index + 1}: ${fehlend.join(", ")}`);
      return;
    }

    // Reine Telefonie-Produkte tragen bei Vodafone eine vollständige
    // Tabelle voller Nullen ("Red Phone": 0,00 Mbit/s). Sauber gelesen,
    // aber kein Internet-Tarif — in der Auswahl wäre es Unsinn, und ein
    // Urteil gegen 0 Mbit/s ergäbe keinen Sinn.
    if (tabelle.max.download === 0) return;

    // Sicherheitsnetz gegen falsch zugeordnete oder falsch gelesene Werte:
    // Von Gesetzes wegen gilt minimal ≤ normalerweise ≤ maximal. Wo das
    // nicht stimmt, haben wir uns verlesen — dann lieber laut scheitern,
    // als dem Nutzer eine erfundene Vertragszusage anzuzeigen. (So fiel
    // ein 1&1-Blatt mit englischem Dezimalpunkt auf: 0.768 → 768.)
    const unlogisch = [];
    for (const richtung of ["download", "upload"]) {
      const [min, normal, max] = [
        tabelle.min[richtung],
        tabelle.normal[richtung],
        tabelle.max[richtung],
      ];
      if (!(min <= normal && normal <= max)) {
        unlogisch.push(`${richtung} ${min}/${normal}/${max} (min≤normal≤max verletzt)`);
      }
    }
    if (unlogisch.length > 0) {
      fehler.push(`Tabelle ${index + 1}: ${unlogisch.join(", ")}`);
      return;
    }

    // Bei mehreren Tabellen trägt jeder Block seinen eigenen Namen.
    const name = (mehrereTabellen && tabelle.ueberschrift) || titel;
    const zugang = tabelle.zugang ?? (ausFliesstext ? ausFliesstext[1].trim() : null);

    tarife.push({
      tarifname: name,
      zugang,
      // Reihenfolge = Verlässlichkeit: die Zugangsangabe der Tabelle steht
      // über dem Namen, der Fließtext ist die letzte Rettung (DG nennt die
      // Technologie nur dort: "Internet-Glasfaseranschluss").
      technologie: technologieBestimmen(zugang, name, titel, slug, text),
      download_max_mbps: tabelle.max.download,
      download_normal_mbps: tabelle.normal.download,
      download_min_mbps: tabelle.min.download,
      upload_max_mbps: tabelle.max.upload,
      upload_normal_mbps: tabelle.normal.upload,
      upload_min_mbps: tabelle.min.upload,
      monatspreis_eur: preis,
      versionsstand,
    });
  });

  if (fehler.length > 0) return { fehler: fehler.join(" | ") };
  if (tarife.length === 0) return { uebersprungen: "keine auswertbare Tabelle" };
  return { tarife };
}

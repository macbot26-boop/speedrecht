# Eingecheckte PIB-Listen (Vodafone, PŸUR)

Vier der sechs Anbieter geben ihre Produktinformationsblätter direkt her: ein
HTTP-Abruf der Übersichtsseite genügt, `scripts/tarife-sammeln.mjs` findet die
Adressen selbst.

**Vodafone und PŸUR nicht.** Ihre Übersichtsseiten bauen die Liste erst im
Browser per JavaScript auf — ein reiner Abruf liefert null Verweise:

```bash
curl -s https://www.vodafone.de/hilfe/pib-privatkunden-tarife-festnetz.html | grep -c '\.pdf'
# 0
```

Darum liegen die Adressen dieser beiden Anbieter hier als versionierte Liste.
Das trennt sauber: der wacklige Teil (die Übersichtsseite) ist sichtbar,
nachprüfbar und änderbar — das Herunterladen und Auswerten der Blätter bleibt
automatisch und wiederholbar. Die PDFs selbst lädt das Skript wieder allein.

## Auffrischen

Nötig, wenn ein Anbieter neue Tarife veröffentlicht. In einem Browser die
Quellseite öffnen (steht im Feld `quelle` der jeweiligen Datei), dann in der
Entwicklerkonsole:

```js
JSON.stringify(
  [...document.querySelectorAll('a[href]')]
    .filter((a) => /\.pdf/i.test(a.href))
    .filter((a, i, alle) => alle.findIndex((b) => b.href === a.href) === i)
    .map((a) => ({ titel: a.textContent.trim().replace(/\s+/g, ' '), url: a.href }))
)
```

Das Ergebnis in das Feld `blaetter` der Datei übernehmen und `gesammelt_am`
setzen. Bei Vodafone liegt die Festnetz-Liste auf einer eigenen Unterseite —
erreichbar über `vodafone.de/hilfe/infodoks.html` → Reiter
„Produktinformationsblätter" → „Privatkunden-Tarife Festnetz".

Danach:

```bash
node scripts/tarife-sammeln.mjs --nur=Vodafone
```

Das Skript bricht laut ab, wenn ein Blatt mit Geschwindigkeits-Tabelle nicht
vollständig lesbar ist — lieber kein Datensatz als ein falscher.

## Wenn eine Adresse ins Leere zeigt

Kommt vor: Auf Vodafones Übersichtsseite verweisen einzelne Einträge
nachweislich auf ein fremdes Blatt (etwa „GigaZuhause 100 Kabel" auf ein
Mobilfunk-Blatt). Der Parser erkennt das und überspringt solche Blätter mit
Begründung, statt einen Handytarif als Hausanschluss einzulesen. Die Meldung
am Ende des Laufs zeigt, wie viele es waren.

#!/usr/bin/env python3
"""Macht aus sauberen Rechnungs-Bildern das, was ein Handy wirklich liefert.

Warum das nötig ist: Alle bisherigen Zahlen zum Rechnungs-Scan stammen von
sauber erzeugten Bildern. Ein Nutzer fotografiert aber schräg, bei
Küchenlicht, über die Falzkante, mit ruhiger-als-gedachter Hand. Ob das Lesen
daran scheitert — und vor allem, OB ES DANN FALSCH LIEST ODER EHRLICH
AUFGIBT — lässt sich ohne solche Bilder nicht beantworten.

Drei Stufen, absichtlich bis über die Schmerzgrenze:

  gut       sorgfältig fotografiert: leicht schräg, minimal unscharf,
            warmes Zimmerlicht, JPEG wie aus der Kamera-App
  mittel    im Vorbeigehen geknipst: deutlich schräg, unscharf,
            ungleichmäßiges Licht, stärker komprimiert, kleiner
  schlecht  abends auf dem Küchentisch: stark schräg, verwackelt,
            Handschatten, Falzkante, grob komprimiert, klein

Was hier NICHT simuliert wird, weil es sich nicht ehrlich nachbauen lässt:
echte Bewegungsunschärfe durch Auslöseverzögerung, Reflexionen auf
Glanzpapier, und der Fall "halbe Rechnung außerhalb des Bildes". Die Messung
mit echten Fotos bleibt deshalb der Maßstab, nicht dieser Satz.

Feste Zufallszahlen (SAAT): derselbe Aufruf erzeugt immer dieselben Bilder —
sonst wäre ein Vergleich zwischen zwei Modellen wertlos, weil jedes andere
Bilder bekäme.

Aufruf:
  python3 scripts/rechnung-fotosimulation.py \
      --quelle prototype/data/rechnungen-test \
      --ziel   prototype/data/rechnungen-foto
"""

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageEnhance, ImageFilter

SAAT = 20260725


def perspektive(bild: Image.Image, staerke: float, rng) -> Image.Image:
    """Kippt das Blatt, als wäre es aus einem Winkel fotografiert.

    Die vier Ecken werden zufällig nach innen gezogen; `staerke` ist der
    Anteil der Bildbreite, um den eine Ecke höchstens wandert.
    """
    b, h = bild.size
    versatz = lambda: rng.uniform(-staerke, staerke) * b  # noqa: E731

    ziel = [(0, 0), (b, 0), (b, h), (0, h)]
    quelle = [(x + versatz(), y + versatz() * (h / b)) for x, y in ziel]

    # Koeffizienten der projektiven Abbildung aus den vier Punktpaaren lösen.
    A, B = [], []
    for (zx, zy), (qx, qy) in zip(ziel, quelle):
        A.append([zx, zy, 1, 0, 0, 0, -qx * zx, -qx * zy])
        A.append([0, 0, 0, zx, zy, 1, -qy * zx, -qy * zy])
        B += [qx, qy]
    koeff = np.linalg.solve(np.array(A, dtype=float), np.array(B, dtype=float))

    return bild.transform((b, h), Image.PERSPECTIVE, koeff, Image.BICUBIC, fillcolor=(232, 230, 226))


def beleuchtung(bild: Image.Image, staerke: float, rng) -> Image.Image:
    """Ungleichmäßiges Licht — heller Fleck, abfallende Ränder."""
    b, h = bild.size
    mx, my = rng.uniform(0.25, 0.75) * b, rng.uniform(0.2, 0.6) * h

    y, x = np.mgrid[0:h, 0:b]
    abstand = np.sqrt(((x - mx) / b) ** 2 + ((y - my) / h) ** 2)
    maske = 255 * (1.0 - staerke * np.clip(abstand / 0.9, 0, 1) ** 1.4)

    return ImageChops.multiply(bild, Image.fromarray(maske.astype(np.uint8), "L").convert("RGB"))


def handschatten(bild: Image.Image, rng) -> Image.Image:
    """Weicher Schatten von oben — die eigene Hand zwischen Lampe und Blatt."""
    b, h = bild.size
    kante = rng.uniform(0.15, 0.4) * h
    breite = rng.uniform(0.25, 0.45) * h

    y = np.mgrid[0:h, 0:b][0]
    maske = np.clip(255 - 70 * np.clip((y - kante) / breite, 0, 1), 0, 255)

    schatten = Image.fromarray(maske.astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(40))
    return ImageChops.multiply(bild, schatten.convert("RGB"))


def falzkante(bild: Image.Image, rng) -> Image.Image:
    """Der Knick eines gefalteten Briefs: dunkler Streifen plus leichte Wölbung."""
    b, h = bild.size
    mitte = rng.uniform(0.42, 0.58) * h

    y = np.mgrid[0:h, 0:b][0]
    maske = 255 - 55 * np.exp(-(((y - mitte) / (0.012 * h)) ** 2))

    knick = Image.fromarray(maske.astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(6))
    return ImageChops.multiply(bild, knick.convert("RGB"))


def rauschen(bild: Image.Image, staerke: float, rng) -> Image.Image:
    """Sensorrauschen bei wenig Licht."""
    feld = np.asarray(bild, dtype=np.int16)
    feld = feld + rng.normal(0, staerke, feld.shape).astype(np.int16)
    return Image.fromarray(np.clip(feld, 0, 255).astype(np.uint8), "RGB")


def farbstich(bild: Image.Image, waerme: float) -> Image.Image:
    """Kunstlicht ist gelb, kein Fotostudio."""
    r, g, bl = bild.split()
    r = r.point(lambda v: min(255, int(v * (1 + waerme))))
    bl = bl.point(lambda v: int(v * (1 - waerme)))
    return Image.merge("RGB", (r, g, bl))


# Die Längskanten sind an der Wirklichkeit ausgerichtet, nicht am Gefühl:
#
#   2400  etwa das, was von einem 12-Megapixel-Foto beim Modell ankommt —
#         Opus 5 und Sonnet 5 rechnen ohnehin auf 2576 Pixel herunter
#   1700  durch einen Messenger geschickt (WhatsApp verkleinert auf ~1600)
#   1300  Messenger plus schlechte Aufnahme — die untere Grenze dessen,
#         was ein Mensch auf dem Blatt noch entziffern kann
#
# Ein früherer Anlauf ging auf 900 Pixel herunter. Das Ergebnis war für
# Menschen unlesbarer Brei und hätte nur gemessen, dass ein Modell an Brei
# scheitert — eine Erkenntnis ohne Wert. Die interessante Zone ist die, in
# der ein Mensch es GERADE NOCH liest.
STUFEN = {
    "gut": dict(persp=0.010, blur=1.1, licht=0.10, waerme=0.02, noise=1.5,
                lang=2400, qualitaet=88, schatten=False, falz=False, kontrast=1.0),
    "mittel": dict(persp=0.030, blur=1.3, licht=0.22, waerme=0.05, noise=3.0,
                   lang=1700, qualitaet=62, schatten=True, falz=False, kontrast=0.95),
    "schlecht": dict(persp=0.055, blur=1.5, licht=0.34, waerme=0.09, noise=5.0,
                     lang=1300, qualitaet=40, schatten=True, falz=True, kontrast=0.88),
    # Absichtlich JENSEITS dessen, was ein Mensch noch lesen kann.
    #
    # Diese Stufe misst keine Trefferquote — die ist hier erwartbar schlecht
    # und ohne Aussagewert. Sie misst, WIE ein Modell scheitert: Sagt es
    # ehrlich "kann ich nicht lesen", oder erfindet es einen Vertragsnamen,
    # der zufällig in unsere Datenbank passt? Nur das Zweite schadet dem
    # Nutzer, und nur hier wird es sichtbar.
    "grenze": dict(persp=0.075, blur=2.1, licht=0.50, waerme=0.12, noise=9.0,
                   lang=850, qualitaet=24, schatten=True, falz=True, kontrast=0.80),
}


def simulieren(pfad: Path, stufe: str, ziel: Path, rng) -> Path:
    p = STUFEN[stufe]
    bild = Image.open(pfad).convert("RGB")

    bild = perspektive(bild, p["persp"], rng)
    if p["falz"]:
        bild = falzkante(bild, rng)
    bild = beleuchtung(bild, p["licht"], rng)
    if p["schatten"]:
        bild = handschatten(bild, rng)
    bild = farbstich(bild, p["waerme"])
    bild = ImageEnhance.Contrast(bild).enhance(p["kontrast"])

    # Verkleinern VOR der Unschärfe: So wirkt der Weichzeichner auf der
    # Auflösung, die am Ende ankommt — genau wie bei einer Handykamera, die
    # ihr Bild ohnehin herunterrechnet.
    faktor = p["lang"] / max(bild.size)
    bild = bild.resize((round(bild.width * faktor), round(bild.height * faktor)), Image.LANCZOS)
    bild = bild.filter(ImageFilter.GaussianBlur(p["blur"]))
    bild = rauschen(bild, p["noise"], rng)

    aus = ziel / f"{pfad.stem}--{stufe}.jpg"
    bild.save(aus, "JPEG", quality=p["qualitaet"], subsampling=2)
    return aus


def main() -> None:
    argumente = argparse.ArgumentParser(description=__doc__)
    argumente.add_argument("--quelle", default="prototype/data/rechnungen-test")
    argumente.add_argument("--ziel", default="prototype/data/rechnungen-foto")
    argumente.add_argument(
        "--stufen",
        default="gut,mittel,schlecht",
        help=f"Komma-Liste aus: {', '.join(STUFEN)} (Vorgabe ohne 'grenze')",
    )
    a = argumente.parse_args()

    gewaehlt = [s.strip() for s in a.stufen.split(",") if s.strip()]
    unbekannt = [s for s in gewaehlt if s not in STUFEN]
    if unbekannt:
        raise SystemExit(f"Unbekannte Stufe(n): {', '.join(unbekannt)}")

    quelle, ziel = Path(a.quelle), Path(a.ziel)
    ziel.mkdir(parents=True, exist_ok=True)

    wahrheit_quelle = json.loads((quelle / "wahrheit.json").read_text("utf-8"))
    wahrheit_ziel = {}

    for name, soll in sorted(wahrheit_quelle.items()):
        pfad = quelle / name
        if not pfad.exists():
            print(f"! {name} fehlt — übersprungen")
            continue

        for stufe in gewaehlt:
            # Saat je Bild UND Stufe: derselbe Aufruf liefert dieselben
            # Bilder, verschiedene Blätter aber verschiedene Verzerrungen.
            rng = np.random.default_rng(SAAT + hash((name, stufe)) % 100_000)
            aus = simulieren(pfad, stufe, ziel, rng)
            wahrheit_ziel[aus.name] = {**soll, "stufe": stufe}
            groesse = aus.stat().st_size / 1024
            print(f"  {aus.name:<34} {Image.open(aus).size[0]:>5} px  {groesse:>6.0f} kB")

    (ziel / "wahrheit.json").write_text(
        json.dumps(wahrheit_ziel, ensure_ascii=False, indent=2) + "\n", "utf-8"
    )
    print(f"\n{len(wahrheit_ziel)} Fotos in {ziel}/ — Wahrheit übernommen und um die Stufe ergänzt")


if __name__ == "__main__":
    main()

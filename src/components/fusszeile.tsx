// Die Fußzeile — auf JEDER Seite.
//
// Warum im Layout und nicht je Seite: Ein Impressum muss „leicht erkennbar,
// unmittelbar erreichbar und ständig verfügbar" sein. „Ständig" heißt: von
// jeder Seite aus, nicht nur von der Startseite. Eine Seite, die den Verweis
// vergisst, ist ein Mangel — und genau das passiert, wenn jede Seite ihn selbst
// setzen muss.
//
// `mt-auto` schiebt die Zeile im Flex-Gerüst des Layouts nach unten, ohne dass
// sie bei kurzen Seiten in der Mitte klebt oder bei langen Seiten den Inhalt
// verdrängt.
//
// BEWUSST NUR DIE VERWEISE. Der erste Entwurf trug hier zusätzlich den
// Unabhängigkeits-Hinweis („gehört zu keinem Anbieter…") — und wiederholte
// damit auf der Startseite wörtlich, was dort schon steht. Zwei Wirkungen,
// beide schlecht: derselbe Satz zweimal auf einem Schirm, und die Startseite
// bekam eine Bildlaufleiste, die sie vorher nicht hatte. Der Hinweis steht
// jetzt dort, wo er hingehört: auf der Startseite und im Impressum.

import Link from "next/link";

const VERWEIS =
  "text-tinte-mittel underline decoration-linie-stark underline-offset-2 transition hover:text-tinte";

export function Fusszeile() {
  return (
    <footer className="mt-auto border-t border-linie bg-papier px-6 py-6">
      <nav
        aria-label="Rechtliches"
        className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-xs"
      >
        <Link href="/impressum" className={VERWEIS}>
          Impressum
        </Link>
        <Link href="/datenschutz" className={VERWEIS}>
          Datenschutz
        </Link>
        <a
          href="https://github.com/macbot26-boop/speedrecht"
          className={VERWEIS}
          rel="noreferrer"
        >
          Quellcode (AGPLv3)
        </a>
      </nav>
    </footer>
  );
}

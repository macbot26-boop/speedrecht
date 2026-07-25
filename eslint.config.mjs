import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Messwerkstatt-Labor: eigenständiges Plain-JS-Projekt, nicht Teil der App
    "prototype/**",
    // Offizielle Messbibliothek: Upstream-Dateien bleiben unverändert
    // (siehe public/ias/PROVENANCE.md) und werden deshalb nicht gelintet
    "public/ias/**",
    // Werkzeug-Verzeichnis: hier legt die Agenten-Umgebung zeitweise ganze
    // Arbeitskopien des Projekts ab (.claude/worktrees/). Git schließt sie
    // aus, CI sieht sie nie — ohne diesen Eintrag lintet "npm run lint" sie
    // aber lokal mit und meldet Tausende Funde aus fremdem Stand. Die lokale
    // Prüfung muss dasselbe messen wie CI, sonst ist sie wertlos.
    ".claude/**",
  ]),
]);

export default eslintConfig;

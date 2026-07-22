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
  ]),
]);

export default eslintConfig;

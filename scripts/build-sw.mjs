/* Génère public/sw.js depuis scripts/sw.template.js avec une version propre à ce build (hook `prebuild`, #55). */
import { readFileSync, writeFileSync } from "node:fs";
import { calculerVersion, injecterVersion } from "./sw-version.mjs";

const modele = readFileSync(new URL("./sw.template.js", import.meta.url), "utf8");
const version = calculerVersion(process.env);
writeFileSync(new URL("../public/sw.js", import.meta.url), injecterVersion(modele, version));
console.log(`public/sw.js généré, version ${version}`);

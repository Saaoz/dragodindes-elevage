// Copie la v2 (legacy/) vers public/legacy/ pour la servir à /legacy/index.html.
// public/legacy/ est généré (ignoré par git) ; legacy/ reste la source.
import { cpSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "legacy");
const dest = path.join(root, "public", "legacy");

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`legacy/ -> public/legacy/ (${readdirSync(dest).length} fichiers)`);

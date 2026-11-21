/* Export de la carte du code (#85, étape 3) : lit le graphe local du plugin Understand-Anything
   (`.ua/knowledge-graph.json`, non versionné, produit par `/understand --language fr`) et écrit
   `lib/carte-code.json` (versionné), que l'onglet « Pour les développeurs » de /carte affiche tel quel.

   Ne garde que l'essentiel : fichiers, couches, groupes, dépendances entre fichiers, un résumé par fichier
   et les POSITIONS déjà calculées (une colonne par couche, groupes empilés). Le site n'a donc ni bibliothèque
   de graphe ni calcul de disposition à faire. Déterministe : même graphe → même fichier.

   Usage : node scripts/export-carte-code.mjs  (ou npm run carte-code) */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const SORTIE = join(RACINE, "lib", "carte-code.json");
const DEPOT = "https://github.com/Saaoz/dragodindes-elevage";

/* Géométrie (unités SVG). */
const NOEUD_L = 180;
const NOEUD_H = 28;
const LIGNE = 36; // pas vertical entre deux fichiers
const COLONNE = 240; // pas horizontal entre deux couches
const MARGE = 24;
const ENTETE = 56; // titre de couche (deux lignes au plus)
const TITRE_GROUPE = 22;
const ECART_GROUPES = 18;
const BORD_GROUPE = 8;

/* Couches de gauche à droite : on suit le sens des imports (pages → composants → logique), tests et outillage
   au bout. Une couche inconnue est ajoutée à la fin, dans l'ordre du graphe. */
const ORDRE_COUCHES = [
  "layer:routes",
  "layer:features",
  "layer:shell",
  "layer:ui-primitives",
  "layer:domain",
  "layer:tests",
  "layer:tooling",
];

const TYPES_FICHIER = new Set(["file", "config", "document", "service", "pipeline", "table", "schema", "resource", "endpoint"]);
/* Liens gardés entre fichiers (les liens vers des fonctions, `contains`, `exports`, `calls`, sont redondants
   avec les imports à cette échelle). */
const TYPES_LIEN = ["imports", "tested_by", "configures", "documents", "depends_on", "related"];

function lireGraphe() {
  for (const dossier of [".understand-anything", ".ua"]) {
    const chemin = join(RACINE, dossier, "knowledge-graph.json");
    if (existsSync(chemin)) return JSON.parse(readFileSync(chemin, "utf8"));
  }
  console.error(
    "export-carte-code : graphe introuvable (.ua/knowledge-graph.json).\n" +
      "Génère-le d'abord dans Claude Code avec : /understand --language fr",
  );
  process.exit(1);
}

/* Coupe un titre en lignes d'au plus `max` caractères, sans couper les mots. */
function couper(texte, max) {
  const lignes = [];
  let ligne = "";
  for (const mot of texte.split(/\s+/)) {
    if (ligne && (ligne + " " + mot).length > max) {
      lignes.push(ligne);
      ligne = mot;
    } else ligne = ligne ? `${ligne} ${mot}` : mot;
  }
  if (ligne) lignes.push(ligne);
  return lignes;
}

const moyenne = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function exporter(graphe) {
  /* Un fichier supprimé depuis l'analyse n'apparaît plus, sans avoir à relancer le plugin. */
  const fichiersGraphe = graphe.nodes
    .filter((n) => TYPES_FICHIER.has(n.type) && n.filePath && existsSync(join(RACINE, n.filePath)))
    .sort((a, b) => a.filePath.localeCompare(b.filePath));
  const parId = new Map(fichiersGraphe.map((n) => [n.id, n]));

  /* Couches, dans l'ordre voulu. */
  const couchesGraphe = [...graphe.layers].sort((a, b) => {
    const ia = ORDRE_COUCHES.indexOf(a.id);
    const ib = ORDRE_COUCHES.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const coucheDe = new Map();
  for (const c of couchesGraphe) for (const id of c.nodeIds) if (parId.has(id)) coucheDe.set(id, c.id);
  const sansCouche = fichiersGraphe.filter((n) => !coucheDe.has(n.id));
  if (sansCouche.length) throw new Error(`Fichiers sans couche : ${sansCouche.map((n) => n.filePath).join(", ")}`);

  /* Groupes de chaque couche : les noms donnés par le plugin, puis « Autres » pour le reste. */
  const groupes = []; // { couche, nom, ids[] }
  for (const c of couchesGraphe) {
    const ids = c.nodeIds.filter((id) => parId.has(id));
    const pris = new Set();
    for (const g of c.containerLabels ?? []) {
      const membres = g.nodeIds.filter((id) => ids.includes(id) && !pris.has(id));
      if (membres.length < 2) continue;
      membres.forEach((id) => pris.add(id));
      groupes.push({ couche: c.id, nom: g.name, ids: membres });
    }
    const reste = ids.filter((id) => !pris.has(id));
    if (reste.length) groupes.push({ couche: c.id, nom: pris.size ? "Autres" : "", ids: reste });
  }
  for (const g of groupes) g.ids.sort((a, b) => parId.get(a).filePath.localeCompare(parId.get(b).filePath));

  /* Liens entre fichiers, dédoublonnés. */
  const liens = [];
  const vus = new Set();
  for (const e of graphe.edges) {
    if (!TYPES_LIEN.includes(e.type) || !parId.has(e.source) || !parId.has(e.target) || e.source === e.target) continue;
    const cle = `${e.source}|${e.target}|${e.type}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    liens.push(e);
  }
  const voisins = new Map(fichiersGraphe.map((n) => [n.id, []]));
  for (const e of liens) {
    voisins.get(e.source).push(e.target);
    voisins.get(e.target).push(e.source);
  }

  /* Disposition : on place, puis deux passes de barycentre (chaque fichier se rapproche de la hauteur moyenne
     de ses voisins des autres couches, à l'intérieur de son groupe ; les groupes aussi) pour raccourcir les liens. */
  const pos = new Map();
  const placer = () => {
    couchesGraphe.forEach((c, i) => {
      let y = MARGE + ENTETE;
      for (const g of groupes.filter((g) => g.couche === c.id)) {
        if (g.nom) y += TITRE_GROUPE;
        g.y = y - (g.nom ? TITRE_GROUPE : 0) - BORD_GROUPE;
        for (const id of g.ids) {
          pos.set(id, { x: MARGE + i * COLONNE, y });
          y += LIGNE;
        }
        g.h = y - LIGNE + NOEUD_H + BORD_GROUPE - g.y;
        y += ECART_GROUPES;
      }
    });
  };
  placer();
  for (let passe = 0; passe < 2; passe++) {
    const cible = (id) => {
      const autres = voisins.get(id).filter((v) => coucheDe.get(v) !== coucheDe.get(id));
      return autres.length ? moyenne(autres.map((v) => pos.get(v).y)) : pos.get(id).y;
    };
    for (const g of groupes) {
      const c = new Map(g.ids.map((id) => [id, cible(id)]));
      g.ids.sort((a, b) => c.get(a) - c.get(b) || parId.get(a).filePath.localeCompare(parId.get(b).filePath));
      g.cible = moyenne(g.ids.map((id) => c.get(id)));
    }
    /* « Autres » reste en bas de sa couche. */
    const rang = (g) => couchesGraphe.findIndex((c) => c.id === g.couche);
    groupes.sort((a, b) => {
      if (a.couche !== b.couche) return rang(a) - rang(b);
      if ((a.nom === "Autres") !== (b.nom === "Autres")) return a.nom === "Autres" ? 1 : -1;
      return a.cible - b.cible || a.nom.localeCompare(b.nom);
    });
    placer();
  }

  /* Étiquette courte : le nom du fichier, ou ses deux derniers segments s'il est ambigu (page.tsx…). */
  const base = (p) => p.split("/").pop();
  const compte = new Map();
  for (const n of fichiersGraphe) compte.set(base(n.filePath), (compte.get(base(n.filePath)) ?? 0) + 1);
  const etiquette = (p) => {
    const e = compte.get(base(p)) > 1 ? p.split("/").slice(-2).join("/") : base(p);
    return e.length > 26 ? `${e.slice(0, 25)}…` : e;
  };

  const ordreFichiers = groupes.flatMap((g) => g.ids);
  const indice = new Map(ordreFichiers.map((id, i) => [id, i]));
  const indiceCouche = new Map(couchesGraphe.map((c, i) => [c.id, i]));
  const hauteur = Math.max(...groupes.map((g) => g.y + g.h)) + MARGE;

  return {
    version: 1,
    commit: graphe.project.gitCommitHash ?? "",
    analyseLe: graphe.project.analyzedAt ?? "",
    depot: DEPOT,
    largeur: MARGE * 2 + (couchesGraphe.length - 1) * COLONNE + NOEUD_L,
    hauteur,
    noeud: { largeur: NOEUD_L, hauteur: NOEUD_H },
    couches: couchesGraphe.map((c, i) => ({
      id: c.id.replace(/^layer:/, ""),
      nom: c.name,
      description: c.description,
      x: MARGE + i * COLONNE,
      titre: couper(c.name, 26).slice(0, 2),
    })),
    groupes: groupes
      .filter((g) => g.nom)
      .map((g) => ({ couche: indiceCouche.get(g.couche), nom: g.nom, y: g.y, hauteur: g.h })),
    fichiers: ordreFichiers.map((id) => {
      const n = parId.get(id);
      const g = groupes.find((g) => g.ids.includes(id));
      return {
        chemin: n.filePath,
        etiquette: etiquette(n.filePath),
        couche: indiceCouche.get(coucheDe.get(id)),
        groupe: g.nom || null,
        resume: n.summary,
        ...pos.get(id),
      };
    }),
    /* [source, cible, type] : indices dans `fichiers`. `tested_by` va du code vers son test. */
    liens: liens
      .map((e) => [indice.get(e.source), indice.get(e.target), e.type])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2])),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const carte = exporter(lireGraphe());
  /* Un fichier par ligne : diffs lisibles quand on régénère. */
  const lignes = (cle, xs) => `  "${cle}": [\n${xs.map((x) => `    ${JSON.stringify(x)}`).join(",\n")}\n  ]`;
  const { couches, groupes, fichiers, liens, ...tete } = carte;
  const json = [
    "{",
    Object.entries(tete)
      .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
      .join("\n"),
    `${lignes("couches", couches)},\n${lignes("groupes", groupes)},\n${lignes("fichiers", fichiers)},\n${lignes("liens", liens)}`,
    "}",
    "",
  ].join("\n");
  writeFileSync(SORTIE, json);
  console.log(
    `export-carte-code : ${fichiers.length} fichiers, ${couches.length} couches, ${liens.length} liens → lib/carte-code.json (commit ${carte.commit.slice(0, 7)})`,
  );
}

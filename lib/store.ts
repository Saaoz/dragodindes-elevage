/* =====================================================================
   store.ts — état de l'appli (Zustand + persist), migration, import/export, mode démo
   Portage de legacy/store.js. Deux magasins strictement séparés :
   - `useStore`     : le vrai, persisté dans localStorage ;
   - `useDemoStore` : le mode démo, en mémoire uniquement, jamais persisté.
   Chaque action n'agit que sur SON magasin : en démo, rien ne peut toucher aux vraies données (#5).
   ===================================================================== */

import { create, type StateCreator } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { parseKamas, type Prices } from "./calc";
import {
  APP_ID, EXPORT_SCHEMA_VERSION, NB_ENCLOS, OBJECTIFS, PRICE_KEYS, SERVER_IDS, appDataSchema, calcSchema,
  defaultAppData, enclosSchema, priceEntrySchema, rappelSchema, ancienRappelSchema, reglagesSchema, type AppData, type CalcState,
  type Enclos, type MethodeRappel, type Objectif, type PriceKey, type PricesState, type Rappel, type AncienRappel, type ServerId, type ServerPrices,
} from "./schema";

/* ---------- clés localStorage et versions ----------
   Clé v3 propre. Les clés v2/v1 sont LUES (jamais modifiées) pour migrer automatiquement les
   données de la v2 si elle a tourné sur la même origine (elle était servie sous /legacy jusqu'à #4). */
export const STORAGE_KEY = "dd-elevage-v3";
/* RÈGLE : tout champ persisté ajouté (ou changé) = augmenter STORAGE_VERSION + écrire la migration
   dans `migrate` + la tester (lib/store.test.ts). Sans cela, une ancienne version de l'appli restée
   ouverte (onglet, service worker) ne verrait pas qu'elle est dépassée et écraserait les données.
   4 : Optimakina par génération (opti2..opti10) ; 5 : rappel push par enclos (#16) ;
   6 : objectif par enclos et marge de rappel (#30) — aucune donnée à transformer (défauts du schéma),
   la version sert uniquement à passer les anciennes versions en lecture seule (`futureVersion`) ;
   7 : méthode de rappel mémorisée (`reglages.methodeRappel`, #51) ;
   8 : `enclos.rappel` devient { methode, at, messageId? } (agenda / Google Agenda en plus du push) et
   `enclos.ancienRappel` (événement d'agenda laissé par la saisie précédente, #53) ;
   9 : notifications push retirées : un rappel push enregistré est remis à null, et la méthode
   mémorisée « push » aussi (le choix est reproposé) ;
   10 : objectifs « endurance » et « amour » (#63) — aucune donnée à transformer (les objectifs déjà
   enregistrés restent valides) ; la version empêche une appli v9, qui lirait « endurance » comme
   illisible (« aucun »), de réécrire les données (elle passe en lecture seule, `futureVersion`). */
export const STORAGE_VERSION = 10;
export const LEGACY_V2_KEY = "dd-elevage-v2";
export const LEGACY_V1_KEY = "dd-elevage-v1";

export type Result = { ok: true; msg: string } | { ok: false; msg: string };
const fail = (msg: string): Result => ({ ok: false, msg });

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isServer = (s: unknown): s is ServerId => typeof s === "string" && (SERVER_IDS as string[]).includes(s);
const isPriceKey = (k: string): k is PriceKey => (PRICE_KEYS as readonly string[]).includes(k);

/* ---------- migration v1 → v2 (tableaux de nombres sans date → prix datés) ----------
   strict = true (import) : une valeur négative / non numérique fait échouer ; sinon elle est ignorée. */
export function migrateV1(old: unknown, now = Date.now(), strict = false): Record<string, unknown> {
  if (!isObj(old)) throw new Error("Format v1 invalide.");
  const prices: Record<string, Record<string, { v: number; t: number }>> = {};
  const bad = (v: unknown) => strict && v !== undefined && v !== null && (typeof v !== "number" || !isFinite(v) || v < 0);
  const oldPrices = isObj(old.prices) ? old.prices : {};
  for (const id of Object.keys(oldPrices)) {
    const o = oldPrices[id];
    if (!isObj(o)) {
      if (strict) throw new Error("Prix v1 invalides.");
      continue;
    }
    const d: Record<string, { v: number; t: number }> = {};
    const gen = Array.isArray(o.gen) ? o.gen : [];
    gen.forEach((v: unknown, g: number) => {
      if (bad(v)) throw new Error("Prix négatif ou invalide.");
      if (g >= 1 && g <= 10 && typeof v === "number" && v > 0) d["g" + g] = { v: Math.round(v), t: now };
    });
    for (const k of ["neurone", "optimakina", "genetons"]) {
      const v = o[k];
      if (bad(v)) throw new Error("Prix négatif ou invalide.");
      if (typeof v === "number" && v > 0) d[k] = { v: Math.round(v), t: now };
    }
    prices[id] = d;
  }
  return { server: old.server, matB: old.matB, calc: old.calc, prices };
}

/* ---------- migration v2/v3 → v4 : prix unique `optimakina` → opti2 … opti10 ----------
   Le prix (et sa date) est recopié vers chaque génération non renseignée : aucune perte, et un prix
   déjà saisi par génération n'est jamais écrasé. Idempotent ; la clé `optimakina` disparaît ensuite.
   Ne modifie pas son argument ; tolère toute forme (renvoie la donnée telle quelle si inexploitable). */
export const OPTI_GENS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function migrateOptimakina<T>(data: T): T {
  if (!isObj(data) || !isObj(data.prices)) return data;
  const prices: Record<string, unknown> = {};
  for (const [id, sp] of Object.entries(data.prices)) {
    if (!isObj(sp) || !("optimakina" in sp)) {
      prices[id] = sp;
      continue;
    }
    const { optimakina, ...rest } = sp;
    const entry = isObj(optimakina) ? optimakina : null;
    if (entry && typeof entry.v === "number" && entry.v > 0) {
      for (const g of OPTI_GENS) if (!(`opti${g}` in rest)) rest[`opti${g}`] = { ...entry };
    }
    prices[id] = rest;
  }
  return { ...data, prices } as T;
}

/* ---------- migration v4 → v5 : rappel par enclos (#16) ----------
   Chaque enclos reçoit `rappel: null` s'il n'en a pas ; un rappel illisible est remis à null (il ne
   doit jamais faire perdre l'enclos entier). Idempotent ; ne modifie pas son argument. */
export function migrateRappels<T>(data: T): T {
  if (!isObj(data) || !Array.isArray(data.enclos)) return data;
  const enclos = data.enclos.map((e: unknown) => {
    if (!isObj(e)) return e;
    const r = rappelSchema.nullable().safeParse(rappelNormalise(e.rappel));
    return { ...e, rappel: r.success ? r.data : null };
  });
  return { ...data, enclos } as T;
}

/* Rappel absent : null. Un ancien rappel push (avec ou sans méthode, v5 à v8) n'est plus lisible et
   tombe à null via le schéma, sans toucher au reste de l'enclos. */
const rappelNormalise = (r: unknown): unknown => (r === undefined ? null : r);

/* ---------- migration v7 → v8 : rappel agenda / Google et événement d'agenda à supprimer (#53) ----------
   Un ancien rappel push est remis à null (rien d'autre ne change) ; `ancienRappel` vaut
   null s'il est absent ou illisible. Idempotent ; ne modifie pas son argument. */
export function migrateRappelsAgenda<T>(data: T): T {
  const d = migrateRappels(data);
  if (!isObj(d) || !Array.isArray(d.enclos)) return d;
  const enclos = d.enclos.map((e: unknown) => {
    if (!isObj(e)) return e;
    const a = ancienRappelSchema.nullable().safeParse(e.ancienRappel ?? null);
    return { ...e, ancienRappel: a.success ? a.data : null };
  });
  return { ...d, enclos } as T;
}

/* ---------- migration v6 → v7 : méthode de rappel mémorisée (#51) ----------
   `reglages.methodeRappel` vaut null s'il est absent ou illisible. Idempotent ; ne modifie pas son argument. */
export function migrateMethodeRappel<T>(data: T): T {
  if (!isObj(data)) return data;
  const reglages = isObj(data.reglages) ? data.reglages : {};
  const r = reglagesSchema.shape.methodeRappel.safeParse(reglages.methodeRappel ?? null);
  return { ...data, reglages: { ...reglages, methodeRappel: r.success ? r.data : null } } as T;
}

/* Le rappel est propre à l'appareil (agenda de cet appareil) : jamais exporté ni importé. */
const sansRappels = (enclos: readonly Enclos[]): Enclos[] => enclos.map((e) => ({ ...e, rappel: null, ancienRappel: null }));

/* Événement d'agenda à supprimer à la main : l'ancien rappel agenda / Google qui disparaît ou change
   (ressaisie, vidage, annulation, autre méthode) ; à défaut, celui déjà noté reste noté. */
function ancienApres(avant: Enclos, apres: Rappel | null): AncienRappel | null {
  const r = avant.rappel;
  if (r && !(apres && apres.methode === r.methode && apres.at === r.at))
    return { methode: r.methode, at: r.at };
  return avant.ancienRappel;
}

const enclosExporte = (e: Enclos): Omit<Enclos, "rappel" | "ancienRappel"> => {
  const { rappel, ancienRappel, ...reste } = e;
  void rappel;
  void ancienRappel;
  return reste;
};

/* ---------- nettoyage TOLÉRANT (données persistées localement) : repli champ par champ ---------- */
export function sanitize(raw: unknown): AppData {
  const o = migrateRappels(migrateOptimakina(isObj(raw) ? raw : {}));
  const full = appDataSchema.safeParse(o);
  if (full.success) return full.data;

  const d = defaultAppData();
  const pick = <T,>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, v: unknown, fb: T): T => {
    const r = schema.safeParse(v);
    return r.success ? (r.data as T) : fb;
  };
  const rawCalc = isObj(o.calc) ? o.calc : {};
  const calc: Record<string, unknown> = { ...d.calc };
  for (const k of Object.keys(calcSchema.shape) as (keyof CalcState)[]) {
    if (!(k in rawCalc)) continue;
    const r = calcSchema.shape[k].safeParse(rawCalc[k]);
    if (r.success) calc[k] = r.data;
  }
  const prices: Record<string, ServerPrices> = {};
  const rawPrices = isObj(o.prices) ? o.prices : {};
  for (const id of SERVER_IDS) {
    const src = rawPrices[id];
    if (!isObj(src)) continue;
    const dst: ServerPrices = {};
    for (const k of PRICE_KEYS) {
      const e = src[k];
      if (!isObj(e) || typeof e.v !== "number" || !isFinite(e.v)) continue;
      const t = typeof e.t === "number" && isFinite(e.t) && e.t >= 0 ? e.t : Date.now();
      const r = priceEntrySchema.safeParse({ v: Math.round(e.v), t });
      if (r.success) dst[k] = r.data;
    }
    prices[id] = dst;
  }
  return {
    server: pick(appDataSchema.shape.server, o.server, d.server),
    theme: pick(appDataSchema.shape.theme, o.theme, d.theme),
    matB: pick(appDataSchema.shape.matB, o.matB, d.matB),
    calc: calc as CalcState,
    prices: prices as PricesState,
    enclos: pick(appDataSchema.shape.enclos, o.enclos, d.enclos),
    reglages: pick(appDataSchema.shape.reglages, o.reglages, d.reglages),
  };
}

/* ---------- import STRICT d'un export JSON : tout ou rien, jamais de corruption ---------- */
export type ParsedImport =
  | { ok: true; data: AppData; hasEnclos: boolean; hasReglages: boolean }
  | { ok: false; msg: string };

export function parseExport(text: string): ParsedImport {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, msg: "Ce n'est pas un JSON valide." };
  }
  if (!isObj(obj) || (obj.app !== APP_ID && obj.app !== LEGACY_V1_KEY) || !isObj(obj.data)) {
    return { ok: false, msg: "Fichier non reconnu (pas un export de cet outil)." };
  }
  const version = obj.schemaVersion === undefined && obj.app === LEGACY_V1_KEY ? 1 : obj.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, msg: "Version d'export illisible." };
  }
  if (version > EXPORT_SCHEMA_VERSION) {
    return { ok: false, msg: "Export créé par une version plus récente de l'outil." };
  }
  let data: unknown = obj.data;
  if (version === 1) {
    try {
      data = migrateV1(obj.data, Date.now(), true);
    } catch (e) {
      return { ok: false, msg: (e as Error).message };
    }
  }
  if (version < 4) data = migrateOptimakina(data);
  const r = appDataSchema.safeParse(data);
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, msg: `Données invalides (${i.path.join(".") || "racine"} : ${i.message}).` };
  }
  return {
    ok: true,
    data: { ...r.data, enclos: sansRappels(r.data.enclos) },
    hasEnclos: isObj(data) && "enclos" in data,
    hasReglages: isObj(data) && "reglages" in data,
  };
}

/* ---------- aides pures sur les prix ---------- */
export const entryOf = (prices: PricesState, server: ServerId, key: PriceKey) => prices[server]?.[key] ?? null;

/* Prix numériques pour calc.ts */
export function priceValues(prices: PricesState, server: ServerId): Prices {
  const P: Prices = { gen: Array(11).fill(0), neurone: 0, opti: Array(11).fill(0), genetons: 0 };
  for (let g = 1; g <= 10; g++) P.gen[g] = entryOf(prices, server, `g${g}` as PriceKey)?.v ?? 0;
  for (const g of OPTI_GENS) P.opti[g] = entryOf(prices, server, `opti${g}` as PriceKey)?.v ?? 0;
  P.neurone = entryOf(prices, server, "neurone")?.v ?? 0;
  P.genetons = entryOf(prices, server, "genetons")?.v ?? 0;
  return P;
}

export const priceCount = (prices: PricesState, server: ServerId): number =>
  PRICE_KEYS.filter((k) => entryOf(prices, server, k)).length;

export function ageDays(prices: PricesState, server: ServerId, key: PriceKey, now = Date.now()): number | null {
  const e = entryOf(prices, server, key);
  return e ? Math.floor((now - e.t) / 864e5) : null;
}

export function oldestAge(prices: PricesState, server: ServerId, now = Date.now()): number | null {
  const ages = PRICE_KEYS.map((k) => ageDays(prices, server, k, now)).filter((a): a is number => a !== null);
  return ages.length ? Math.max(...ages) : null;
}

/* ---------- import par collage : « gen 5  300k », « neurone 25k »… ---------- */
const PASTE_RE = /^(?:gen\.?|g|génération)?\s*(\d{1,2}|neurones?|optimakina(?:\s+(?:10|[2-9])\b)?|g[ée]n[ée]tons?)\s*[:;\t =-]+\s*(.+)$/i;

export function parsePaste(text: string): { entries: [PriceKey, number][]; bad: string[] } {
  const entries: [PriceKey, number][] = [];
  const bad: string[] = [];
  text.split(/\r?\n/).forEach((line) => {
    const l = line.trim();
    if (!l) return;
    const m = l.match(PASTE_RE);
    if (!m) return void bad.push(l);
    let key = m[1].toLowerCase().replace(/\s+/g, " ");
    /* « optimakina 5 300k » : génération 5 ; « optimakina 150k » : toutes les générations (comme la migration). */
    const optiGen = key.match(/^optimakina (\d+)$/)?.[1];
    const allOpti = key === "optimakina";
    if (optiGen) key = "opti" + optiGen;
    else if (allOpti) key = "opti*";
    else if (/^\d+$/.test(key)) {
      if (+key < 1 || +key > 10) return void bad.push(l);
      key = "g" + +key;
    } else if (key.startsWith("neuron")) key = "neurone";
    else key = "genetons";
    /* « 5 -300k » : montant négatif refusé (le tiret n'est pas un séparateur ici). */
    const v = /[\s:;=]-\d/.test(l) ? null : parseKamas(m[2]);
    if (!v) return void bad.push(l);
    if (allOpti) for (const g of OPTI_GENS) entries.push([`opti${g}` as PriceKey, v]);
    else entries.push([key as PriceKey, v]);
  });
  return { entries, bad };
}

/* ---------- le magasin ---------- */
export interface Actions {
  readonly demo: boolean;
  /* Vrai si le localStorage contient un état d'une version PLUS RÉCENTE que celle de l'appli
     (ex. service worker qui sert encore une ancienne version). Dans ce cas, rien n'est écrit :
     les données récentes sont préservées, la session reste en lecture seule. L'UI doit alors
     afficher « Une version plus récente de l'appli a été utilisée sur cet appareil : recharge la page ».
     Fixé à chaque hydratation ; toujours faux en démo. */
  readonly futureVersion: boolean;
  setServer: (id: string) => boolean;
  setTheme: (t: AppData["theme"]) => boolean;
  setMatB: (m: AppData["matB"]) => boolean;
  /* Fusionne un correctif ; refuse (false, sans rien changer) si le résultat est invalide. */
  setCalc: (patch: Partial<CalcState>) => boolean;
  /* v > 0 : enregistre (arrondi, daté) ; v = 0 : efface ; négatif / NaN / clé inconnue : refus (false). */
  setPrice: (server: string, key: string, v: number) => boolean;
  clearServer: (server: string) => boolean;
  copyToAll: (server: string) => boolean;
  importPaste: (server: string, text: string) => { ok: number; bad: string[] };
  exportJSON: () => string;
  importJSON: (text: string) => Result;
  ageDays: (server: ServerId, key: PriceKey) => number | null;
  /* Enregistre (ou efface avec null) le rappel de l'enclos i, seulement si l'enclos n'a pas été
     ressaisi entre-temps (même `saisieLe`) ; false sinon, ou en lecture seule (version future). */
  setRappel: (i: number, saisieLe: number | null, rappel: Rappel | null) => boolean;
  /* Remplace l'enclos i (validé ; le rappel est remis à null et, s'il était agenda / Google, noté dans `ancienRappel`). */
  setEnclos: (i: number, e: Enclos) => boolean;
  /* Objectif de l'enclos i (#4 : enregistré, n'est plus perdu au rechargement). */
  setObjectif: (i: number, o: Objectif) => boolean;
  /* Marge des rappels en minutes (0, 5, 10, 15 ou 30). */
  setMargeRappel: (min: number) => boolean;
  setMethodeRappel: (m: MethodeRappel | null) => boolean;
  oldestAge: (server: ServerId) => number | null;
}
export type AppStore = AppData & Actions;

const pickData = (s: AppData): AppData => ({
  server: s.server, theme: s.theme, matB: s.matB, calc: s.calc, prices: s.prices, enclos: s.enclos,
  reglages: s.reglages,
});

const clonePrices = (p: ServerPrices | undefined): ServerPrices => structuredClone(p ?? {});

function makeCreator(demo: boolean, initial: () => AppData): StateCreator<AppStore> {
  return (set, get) => ({
    ...initial(),
    demo,
    futureVersion: false,
    setServer: (id) => {
      if (!isServer(id)) return false;
      set({ server: id });
      return true;
    },
    setTheme: (theme) => {
      const r = appDataSchema.shape.theme.safeParse(theme);
      if (!r.success) return false;
      set({ theme: r.data });
      return true;
    },
    setMatB: (matB) => {
      const r = appDataSchema.shape.matB.safeParse(matB);
      if (!r.success) return false;
      set({ matB: r.data });
      return true;
    },
    setCalc: (patch) => {
      const r = calcSchema.safeParse({ ...get().calc, ...patch });
      if (!r.success) return false;
      set({ calc: r.data });
      return true;
    },
    setPrice: (server, key, v) => {
      if (!isServer(server) || !isPriceKey(key) || typeof v !== "number" || !isFinite(v) || v < 0) return false;
      const prices = { ...get().prices };
      const sp = clonePrices(prices[server]);
      const n = Math.round(v);
      if (n > 0) sp[key] = { v: n, t: Date.now() };
      else delete sp[key];
      prices[server] = sp;
      set({ prices });
      return true;
    },
    clearServer: (server) => {
      if (!isServer(server)) return false;
      const prices = { ...get().prices };
      delete prices[server];
      set({ prices });
      return true;
    },
    copyToAll: (server) => {
      if (!isServer(server)) return false;
      const prices = { ...get().prices };
      const src = prices[server];
      for (const id of SERVER_IDS) if (id !== server) prices[id] = clonePrices(src);
      set({ prices });
      return true;
    },
    importPaste: (server, text) => {
      if (!isServer(server)) return { ok: 0, bad: text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) };
      const { entries, bad } = parsePaste(text);
      if (entries.length) {
        const prices = { ...get().prices };
        const sp = clonePrices(prices[server]);
        const t = Date.now();
        for (const [k, v] of entries) sp[k] = { v, t };
        prices[server] = sp;
        set({ prices });
      }
      return { ok: entries.length, bad };
    },
    exportJSON: () =>
      JSON.stringify(
        {
          app: APP_ID,
          schemaVersion: EXPORT_SCHEMA_VERSION,
          exportedAt: new Date().toISOString(),
          data: { ...pickData(get()), enclos: get().enclos.map(enclosExporte) },
        },
        null,
        2,
      ),
    importJSON: (text) => {
      /* En démo : refus. Les fausses données ne doivent jamais sortir, ni les vraies y entrer. */
      if (demo) return fail("Indisponible en mode démo.");
      const r = parseExport(text);
      if (!r.ok) return fail(r.msg);
      set({
        ...r.data,
        enclos: r.hasEnclos ? r.data.enclos : get().enclos,
        reglages: r.hasReglages ? r.data.reglages : get().reglages,
      });
      return { ok: true, msg: "Import terminé." };
    },
    ageDays: (server, key) => ageDays(get().prices, server, key),
    setRappel: (i, saisieLe, rappel) => {
      if (get().futureVersion) return false;
      const e = get().enclos[i];
      if (!e || e.saisieLe !== saisieLe) return false;
      const r = rappelSchema.nullable().safeParse(rappel);
      if (!r.success) return false;
      set({ enclos: get().enclos.map((x, k) => (k === i ? { ...x, rappel: r.data, ancienRappel: ancienApres(x, r.data) } : x)) });
      return true;
    },
    setEnclos: (i, e) => {
      if (!Number.isInteger(i) || i < 0 || i >= NB_ENCLOS) return false;
      const r = enclosSchema.safeParse({ ...e, rappel: null, ancienRappel: null });
      if (!r.success) return false;
      set({ enclos: get().enclos.map((x, k) => (k === i ? { ...r.data, ancienRappel: ancienApres(x, null) } : x)) });
      return true;
    },
    setObjectif: (i, o) => {
      if (!(OBJECTIFS as readonly string[]).includes(o) || !get().enclos[i]) return false;
      set({ enclos: get().enclos.map((x, k) => (k === i ? { ...x, objectif: o } : x)) });
      return true;
    },
    setMargeRappel: (min) => {
      const r = reglagesSchema.shape.margeRappelMin.safeParse(min);
      /* .catch() du schéma accepte tout : on vérifie que la valeur est bien celle demandée */
      if (!r.success || r.data !== min) return false;
      set({ reglages: { ...get().reglages, margeRappelMin: r.data } });
      return true;
    },
    setMethodeRappel: (m) => {
      const r = reglagesSchema.shape.methodeRappel.safeParse(m);
      if (!r.success || r.data !== m) return false;
      set({ reglages: { ...get().reglages, methodeRappel: r.data } });
      return true;
    },
    oldestAge: (server) => oldestAge(get().prices, server),
  });
}

/* ---------- persistance : localStorage, avec repli lecture seule sur les clés v2 / v1 ---------- */
export const persistStatus: { lastError: unknown } = { lastError: null };
const ls = (): Storage | undefined => (typeof localStorage === "undefined" ? undefined : localStorage);

/* Version écrite dans la clé v3 du localStorage, lue sans rien modifier ; null si absente ou illisible. */
const storedVersion = (s: Storage | undefined, name: string): number | null => {
  try {
    const raw = s?.getItem(name);
    if (!raw) return null;
    const v = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
};

/* Vrai si le localStorage contient une version future. Relu à chaque écriture : aucune écriture
   ne peut donc écraser des données plus récentes, même avant la fin de l'hydratation. */
const isFutureStored = (): boolean => (storedVersion(ls(), STORAGE_KEY) ?? 0) > STORAGE_VERSION;

const storage: PersistStorage<AppData> = {
  getItem: (name) => {
    const s = ls();
    if (!s) return null;
    try {
      const raw = s.getItem(name);
      if (raw) return JSON.parse(raw) as StorageValue<AppData>;
      const v2 = s.getItem(LEGACY_V2_KEY);
      if (v2) return { state: JSON.parse(v2), version: 2 };
      const v1 = s.getItem(LEGACY_V1_KEY);
      if (v1) return { state: JSON.parse(v1), version: 1 };
    } catch (e) {
      persistStatus.lastError = e;
    }
    return null;
  },
  /* Ne lève jamais : persistStatus.lastError dit si la sauvegarde a échoué (quota, mode privé…). */
  setItem: (name, value) => {
    try {
      const s = ls();
      /* Version future sur le disque : lecture seule, on ne touche à rien (voir `futureVersion`). */
      if ((storedVersion(s, name) ?? 0) > STORAGE_VERSION) return;
      const json = JSON.stringify(value);
      /* Valeur identique : on n'écrit pas (une réhydratation ne doit rien réécrire ni réveiller les autres onglets). */
      if (s?.getItem(name) === json) return;
      s?.setItem(name, json);
      persistStatus.lastError = null;
    } catch (e) {
      persistStatus.lastError = e;
    }
  },
  removeItem: (name) => {
    try {
      ls()?.removeItem(name);
    } catch (e) {
      persistStatus.lastError = e;
    }
  },
};

/* Vrai magasin. `skipHydration` : la lecture du localStorage se fait côté client avec
   `useStore.persist.rehydrate()` (évite tout écart de rendu serveur / client). */
export const useStore = create<AppStore>()(
  persist(makeCreator(false, defaultAppData), {
    name: STORAGE_KEY,
    version: STORAGE_VERSION,
    storage,
    skipHydration: true,
    partialize: (s) => pickData(s as AppData),
    migrate: (persisted, version) => {
      if (version > STORAGE_VERSION) throw new Error("Données créées par une version plus récente de l'outil.");
      const v1 = version === 1 ? migrateV1(persisted) : persisted;
      const v4 = version < 4 ? migrateOptimakina(v1) : v1;
      /* v5 → v6 : rien à transformer (objectif et reglages.margeRappelMin ont des défauts au schéma). */
      const v5 = version < 5 ? migrateRappels(v4) : v4;
      const v7 = version < 7 ? migrateMethodeRappel(v5) : v5;
      const v8 = version < 8 ? migrateRappelsAgenda(v7) : v7;
      /* v8 → v9 : push retiré ; rappel push et méthode « push » remis à null. */
      const v9 = version < 9 ? migrateMethodeRappel(migrateRappelsAgenda(v8)) : v8;
      /* v9 → v10 : rien à transformer. L'objectif n'est PAS déduit de l'autre jauge ici (ce serait changer l'heure de
         retour sans que le joueur le voie) : la saisie suivante le propose, visible et modifiable (#63). */
      return v9 as AppStore;
    },
    /* Toujours nettoyer ce qui vient du disque, même à version égale. */
    merge: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
    /* Après chaque hydratation (réussie ou non), fixe le drapeau lu par l'UI. */
    onRehydrateStorage: () => () => {
      useStore.setState({ futureVersion: isFutureStored() });
    },
  }),
);

/* Synchronisation entre onglets : quand un autre onglet écrit la clé persistée, l'événement `storage`
   relance la réhydratation, pour repartir des données à jour avant toute écriture (sinon un onglet
   resté ouvert écraserait les changements des autres). L'événement ne part que dans les AUTRES
   onglets, et la réhydratation n'écrit rien si la valeur est inchangée : pas de boucle.
   Client uniquement ; renvoie la fonction de nettoyage. Le magasin démo n'est pas concerné. */
export function syncOnglets(): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || e.storageArea !== ls()) return;
    void useStore.persist.rehydrate();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

/* ---------- mode démo : magasin séparé, en mémoire, jamais persisté ---------- */
export const DEMO_VALUES: Record<PriceKey, number> = {
  g1: 20000, g2: 40000, g3: 90000, g4: 160000, g5: 300000, g6: 520000, g7: 800000, g8: 1300000,
  g9: 2400000, g10: 4000000, neurone: 25000, genetons: 3000,
  opti2: 150000, opti3: 150000, opti4: 150000, opti5: 150000, opti6: 150000, opti7: 150000, opti8: 150000,
  opti9: 150000, opti10: 150000,
};

/* Enclos fictifs de la démo (#63 : objectifs cohérents avec la jauge d'élevage) :
   1. Endurance, Sérénité − : les montures restent en négatif, mais la plus basse atteindra −5 000 (jauge gaspillée) ;
   2. Amour, Sérénité − encore active pour redescendre de +5 000 : une monture va passer en négatif (alerte de jauge) ;
   3. Maturité, sans jauge de sérénité : rien ne bouge, les montures restent dans la zone Maturité. */
function demoEnclos(now: number): Enclos[] {
  const min = 60_000;
  const avant = (minutes: number) => Math.max(0, now - minutes * min);
  const d = defaultAppData().enclos;
  const m = (...s: number[]) => s.map((serenite) => ({ nom: "", serenite }));
  d[0] = enclosSchema.parse({
    nom: "Enclos 1 (démo)", montures: m(-2600, -2300, -2000, -1700), jaugeSerenite: "-", niveauSerenite: 60000,
    autreJauge: "Endurance", niveauAutre: 90000, saisieLe: avant(20), objectif: "endurance",
  });
  d[1] = enclosSchema.parse({
    nom: "Enclos 2 (démo)", montures: m(3400, 2900, 2500), jaugeSerenite: "-", niveauSerenite: 60000,
    autreJauge: "Amour", niveauAutre: 120000, saisieLe: avant(30), objectif: "amour",
  });
  d[2] = enclosSchema.parse({
    nom: "Enclos 3 (démo)", montures: m(-200, 200), autreJauge: "Maturité", niveauAutre: 180000,
    saisieLe: avant(45), objectif: "maturite",
  });
  return d;
}

export function demoData(now = Date.now()): AppData {
  const d = defaultAppData();
  const sp = Object.fromEntries(PRICE_KEYS.map((k) => [k, { v: DEMO_VALUES[k], t: now }])) as ServerPrices;
  d.prices = Object.fromEntries(SERVER_IDS.map((id) => [id, structuredClone(sp)])) as PricesState;
  d.enclos = demoEnclos(now);
  return d;
}

export const useDemoStore = create<AppStore>()(makeCreator(true, () => demoData()));

export const resetDemo = (): void => useDemoStore.setState(demoData());

/* Le magasin à utiliser selon que la démo est active. */
export const storeFor = (demo: boolean) => (demo ? useDemoStore : useStore);

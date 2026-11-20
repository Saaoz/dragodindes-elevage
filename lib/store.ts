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
  APP_ID, EXPORT_SCHEMA_VERSION, PRICE_KEYS, SERVER_IDS, appDataSchema, calcSchema, defaultAppData,
  priceEntrySchema, type AppData, type CalcState, type PriceKey, type PricesState, type ServerId,
  type ServerPrices,
} from "./schema";

/* ---------- clés localStorage et versions ----------
   Clé v3 propre. Les clés v2/v1 sont LUES (jamais modifiées) pour migrer automatiquement les
   données de la v2 si elle a tourné sur la même origine (/legacy est servi par l'appli). */
export const STORAGE_KEY = "dd-elevage-v3";
export const STORAGE_VERSION = 3;
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

/* ---------- nettoyage TOLÉRANT (données persistées localement) : repli champ par champ ---------- */
export function sanitize(raw: unknown): AppData {
  const o = isObj(raw) ? raw : {};
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
  };
}

/* ---------- import STRICT d'un export JSON : tout ou rien, jamais de corruption ---------- */
export type ParsedImport = { ok: true; data: AppData; hasEnclos: boolean } | { ok: false; msg: string };

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
  const r = appDataSchema.safeParse(data);
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, msg: `Données invalides (${i.path.join(".") || "racine"} : ${i.message}).` };
  }
  return { ok: true, data: r.data, hasEnclos: isObj(data) && "enclos" in data };
}

/* ---------- aides pures sur les prix ---------- */
export const entryOf = (prices: PricesState, server: ServerId, key: PriceKey) => prices[server]?.[key] ?? null;

/* Prix numériques pour calc.ts */
export function priceValues(prices: PricesState, server: ServerId): Prices {
  const P: Prices = { gen: Array(11).fill(0), neurone: 0, optimakina: 0, genetons: 0 };
  for (let g = 1; g <= 10; g++) P.gen[g] = entryOf(prices, server, `g${g}` as PriceKey)?.v ?? 0;
  P.neurone = entryOf(prices, server, "neurone")?.v ?? 0;
  P.optimakina = entryOf(prices, server, "optimakina")?.v ?? 0;
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
const PASTE_RE = /^(?:gen\.?|g|génération)?\s*(\d{1,2}|neurones?|optimakina|g[ée]n[ée]tons?)\s*[:;\t =-]+\s*(.+)$/i;

export function parsePaste(text: string): { entries: [PriceKey, number][]; bad: string[] } {
  const entries: [PriceKey, number][] = [];
  const bad: string[] = [];
  text.split(/\r?\n/).forEach((line) => {
    const l = line.trim();
    if (!l) return;
    const m = l.match(PASTE_RE);
    if (!m) return void bad.push(l);
    let key = m[1].toLowerCase();
    if (/^\d+$/.test(key)) {
      if (+key < 1 || +key > 10) return void bad.push(l);
      key = "g" + +key;
    } else if (key.startsWith("neuron")) key = "neurone";
    else if (key.startsWith("optim")) key = "optimakina";
    else key = "genetons";
    /* « 5 -300k » : montant négatif refusé (le tiret n'est pas un séparateur ici). */
    const v = /[\s:;=]-\d/.test(l) ? null : parseKamas(m[2]);
    if (!v) return void bad.push(l);
    entries.push([key as PriceKey, v]);
  });
  return { entries, bad };
}

/* ---------- le magasin ---------- */
export interface Actions {
  readonly demo: boolean;
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
  oldestAge: (server: ServerId) => number | null;
}
export type AppStore = AppData & Actions;

const pickData = (s: AppData): AppData => ({
  server: s.server, theme: s.theme, matB: s.matB, calc: s.calc, prices: s.prices, enclos: s.enclos,
});

const clonePrices = (p: ServerPrices | undefined): ServerPrices => structuredClone(p ?? {});

function makeCreator(demo: boolean, initial: () => AppData): StateCreator<AppStore> {
  return (set, get) => ({
    ...initial(),
    demo,
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
        { app: APP_ID, schemaVersion: EXPORT_SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: pickData(get()) },
        null,
        2,
      ),
    importJSON: (text) => {
      /* En démo : refus. Les fausses données ne doivent jamais sortir, ni les vraies y entrer. */
      if (demo) return fail("Indisponible en mode démo.");
      const r = parseExport(text);
      if (!r.ok) return fail(r.msg);
      set({ ...r.data, enclos: r.hasEnclos ? r.data.enclos : get().enclos });
      return { ok: true, msg: "Import terminé." };
    },
    ageDays: (server, key) => ageDays(get().prices, server, key),
    oldestAge: (server) => oldestAge(get().prices, server),
  });
}

/* ---------- persistance : localStorage, avec repli lecture seule sur les clés v2 / v1 ---------- */
export const persistStatus: { lastError: unknown } = { lastError: null };
const ls = (): Storage | undefined => (typeof localStorage === "undefined" ? undefined : localStorage);

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
      ls()?.setItem(name, JSON.stringify(value));
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
      return (version === 1 ? migrateV1(persisted) : persisted) as AppStore;
    },
    /* Toujours nettoyer ce qui vient du disque, même à version égale. */
    merge: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
  }),
);

/* ---------- mode démo : magasin séparé, en mémoire, jamais persisté ---------- */
export const DEMO_VALUES: Record<PriceKey, number> = {
  g1: 20000, g2: 40000, g3: 90000, g4: 160000, g5: 300000, g6: 520000, g7: 800000, g8: 1300000,
  g9: 2400000, g10: 4000000, neurone: 25000, optimakina: 150000, genetons: 3000,
};

export function demoData(now = Date.now()): AppData {
  const d = defaultAppData();
  const sp = Object.fromEntries(PRICE_KEYS.map((k) => [k, { v: DEMO_VALUES[k], t: now }])) as ServerPrices;
  d.prices = Object.fromEntries(SERVER_IDS.map((id) => [id, structuredClone(sp)])) as PricesState;
  return d;
}

export const useDemoStore = create<AppStore>()(makeCreator(true, () => demoData()));

export const resetDemo = (): void => useDemoStore.setState(demoData());

/* Le magasin à utiliser selon que la démo est active. */
export const storeFor = (demo: boolean) => (demo ? useDemoStore : useStore);

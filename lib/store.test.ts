/* eslint-disable @typescript-eslint/no-explicit-any -- manipulation de JSON brut dans les tests */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./__fixtures__/export-v2.json";
import { PRICE_KEYS, SERVER_IDS, defaultAppData, type PriceKey, type ServerId } from "./schema";
import { matrice } from "./rentabilite";
import {
  LEGACY_V1_KEY, LEGACY_V2_KEY, STORAGE_KEY, STORAGE_VERSION, demoData, migrateMethodeRappel, migrateRappelTournee, migrateOptimakina, migrateRappels, migrateRappelsAgenda, migrateV1, parseExport, priceCount, syncOnglets,
  parsePaste, priceValues, resetDemo, useDemoStore, useStore,
} from "./store";

/* faux localStorage en mémoire */
class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
let mem: MemStorage;
const fixtureText = JSON.stringify(fixture);
/* Prix de la fixture v2 une fois l'Optimakina unique recopiée sur chaque génération. */
const fixPrices = (migrateOptimakina(fixture.data) as any).prices;
const st = () => useStore.getState();

beforeEach(() => {
  mem = new MemStorage();
  vi.stubGlobal("localStorage", mem);
  useStore.setState({ ...defaultAppData(), futureVersion: false });
  resetDemo();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const dataOf = (s: ReturnType<typeof useStore.getState>) => ({
  server: s.server, theme: s.theme, matB: s.matB, calc: s.calc, prices: s.prices, enclos: s.enclos,
});
const snapshot = () => JSON.stringify({ d: dataOf(st()), ls: [...mem.m] });

describe("import d'un export v2 réel", () => {
  it("donne les mêmes prix, serveur par serveur", () => {
    const r = st().importJSON(fixtureText);
    expect(r.ok).toBe(true);
    const s = st();
    expect(s.server).toBe("Imagiro");
    expect(s.theme).toBe("light");
    expect(s.matB).toBe("gen1");
    expect(s.prices.Imagiro).toEqual(fixPrices.Imagiro);
    expect(s.prices.Orukam).toEqual(fixPrices.Orukam);
    expect(priceValues(s.prices, "Imagiro").gen[5]).toBe(310000);
    expect(priceValues(s.prices, "Orukam").gen[6]).toBe(1180000);
    expect(s.prices.Tylezia).toBeUndefined();
  });

  it("conserve optiBonus 10 (choix de l'utilisateur) et met takeza à false", () => {
    st().importJSON(fixtureText);
    expect(st().calc.optiBonus).toBe(10);
    expect(st().calc.takeza).toBe(false);
    expect(st().calc.parentsMode).toBe("sell");
  });

  it("garde les enclos existants (absents de la v2)", () => {
    st().importJSON(fixtureText);
    expect(st().enclos).toHaveLength(6);
  });

  it("aller-retour : export puis réimport donnent les mêmes données", () => {
    st().importJSON(fixtureText);
    const before = dataOf(st());
    const out = st().exportJSON();
    const parsed = JSON.parse(out);
    expect(parsed).toMatchObject({ app: "dd-elevage", schemaVersion: 4 });
    expect(typeof parsed.exportedAt).toBe("string");
    useStore.setState(defaultAppData());
    expect(st().importJSON(out).ok).toBe(true);
    expect(dataOf(st())).toEqual(before);
  });
});

describe("migration v1", () => {
  const v1 = {
    server: "Tal Kasha",
    matB: "same",
    calc: { target: 7, genA: 6, genB: 6, optiBonus: 10 },
    prices: {
      "Tal Kasha": { gen: [0, 20000, 0, 90000, 0, 0, 0, 0, 0, 0, 4000000], neurone: 25000, optimakina: 0, genetons: 3000 },
    },
  };

  it("migrateV1 convertit les tableaux en prix datés", () => {
    const m = migrateV1(v1, 123) as { prices: Record<string, Record<string, unknown>> };
    expect(m.prices["Tal Kasha"]).toEqual({
      g1: { v: 20000, t: 123 },
      g3: { v: 90000, t: 123 },
      g10: { v: 4000000, t: 123 },
      neurone: { v: 25000, t: 123 },
      genetons: { v: 3000, t: 123 },
    });
  });

  it("importe un export v1 (schemaVersion 1)", () => {
    const r = st().importJSON(JSON.stringify({ app: "dd-elevage", schemaVersion: 1, data: v1 }));
    expect(r.ok).toBe(true);
    expect(st().server).toBe("Tal Kasha");
    expect(st().prices["Tal Kasha"]?.g3?.v).toBe(90000);
    expect(st().calc.target).toBe(7);
    expect(st().calc.optiBonus).toBe(10);
  });

  it("importe le format dd-elevage-v1", () => {
    expect(st().importJSON(JSON.stringify({ app: "dd-elevage-v1", data: v1 })).ok).toBe(true);
  });

  it("refuse un v1 avec un prix négatif, sans rien changer", () => {
    const bad = { ...v1, prices: { "Tal Kasha": { gen: [0, -5], neurone: 0 } } };
    const before = snapshot();
    expect(st().importJSON(JSON.stringify({ app: "dd-elevage", schemaVersion: 1, data: bad })).ok).toBe(false);
    expect(snapshot()).toBe(before);
  });

  it("au démarrage, migre les clés localStorage v1 puis v2 vers l'état courant", async () => {
    mem.m.clear();
    mem.setItem(LEGACY_V1_KEY, JSON.stringify(v1));
    await useStore.persist.rehydrate();
    expect(st().prices["Tal Kasha"]?.g1?.v).toBe(20000);
    expect(st().server).toBe("Tal Kasha");

    useStore.setState(defaultAppData());
    mem.m.clear();
    mem.setItem(LEGACY_V2_KEY, JSON.stringify(fixture.data));
    await useStore.persist.rehydrate();
    expect(st().prices.Imagiro).toEqual(fixPrices.Imagiro);
    expect(st().calc.optiBonus).toBe(10);
    expect(mem.getItem(LEGACY_V2_KEY)).not.toBeNull(); // clé v2 jamais modifiée
  });
});

describe("persistance", () => {
  it("écrit sous la clé v3 avec le numéro de version, et relit", async () => {
    st().setPrice("Imagiro", "g5", 300000);
    const stored = JSON.parse(mem.getItem(STORAGE_KEY)!);
    expect(stored.version).toBe(STORAGE_VERSION);
    expect(stored.state.prices.Imagiro.g5.v).toBe(300000);
    expect("setPrice" in stored.state).toBe(false);
    const saved = mem.getItem(STORAGE_KEY)!;
    useStore.setState(defaultAppData());
    mem.setItem(STORAGE_KEY, saved);
    await useStore.persist.rehydrate();
    expect(st().prices.Imagiro?.g5?.v).toBe(300000);
  });

  it("nettoie un contenu abîmé sans tout perdre", async () => {
    mem.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        state: {
          server: "Inconnu",
          theme: "light",
          calc: { target: 99, fuel: 500 },
          prices: { Imagiro: { g1: { v: -5, t: 1 }, g2: { v: 40000, t: 5 } } },
        },
      }),
    );
    await useStore.persist.rehydrate();
    expect(st().server).toBe("Draconiros");
    expect(st().theme).toBe("light");
    expect(st().calc.target).toBe(5);
    expect(st().calc.fuel).toBe(500);
    expect(st().prices.Imagiro).toEqual({ g2: { v: 40000, t: 5 } });
  });

  it("une version future ne plante pas et n'est pas lue", async () => {
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION + 1, state: { server: "Orukam" } }));
    await useStore.persist.rehydrate();
    expect(st().server).toBe("Draconiros");
    expect(JSON.parse(mem.getItem(STORAGE_KEY)!).version).toBe(STORAGE_VERSION + 1);
  });

  it("un échec d'écriture (quota) ne lève pas", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    });
    expect(() => st().setPrice("Imagiro", "g1", 1000)).not.toThrow();
    expect(st().prices.Imagiro?.g1?.v).toBe(1000);
  });
});

describe("version future (SW en cache après déploiement)", () => {
  const futureState = () => JSON.stringify({ version: 99, state: { ...fixture.data, server: "Orukam" } });

  it("version courante : pas de drapeau, écriture normale", async () => {
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: 3, state: fixture.data }));
    await useStore.persist.rehydrate();
    expect(st().futureVersion).toBe(false);
    expect(st().setPrice("Imagiro", "g5", 123000)).toBe(true);
    expect(JSON.parse(mem.getItem(STORAGE_KEY)!).state.prices.Imagiro.g5.v).toBe(123000);
  });

  it("version 99 : drapeau vrai, et aucune écriture après des actions", async () => {
    mem.setItem(STORAGE_KEY, futureState());
    const before = [...mem.m];
    await useStore.persist.rehydrate();
    expect(st().futureVersion).toBe(true);
    expect(st().server).toBe("Draconiros"); // état non lu, défauts en mémoire

    st().setPrice("Imagiro", "g5", 1);
    st().setCalc({ target: 9 });
    st().setServer("Orukam");
    st().clearServer("Imagiro");
    st().copyToAll("Imagiro");
    st().importPaste("Orukam", "5 300k");
    st().importJSON(fixtureText);
    expect([...mem.m]).toStrictEqual(before);
    expect(mem.getItem(STORAGE_KEY)).toBe(before[0][1]);
  });

  it("version 99 : aucune écriture même sans hydratation préalable", () => {
    mem.setItem(STORAGE_KEY, futureState());
    const before = [...mem.m];
    st().setPrice("Imagiro", "g5", 1);
    expect([...mem.m]).toStrictEqual(before);
  });

  it("retour à une version courante : le drapeau repasse à faux", async () => {
    mem.setItem(STORAGE_KEY, futureState());
    await useStore.persist.rehydrate();
    expect(st().futureVersion).toBe(true);
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: 3, state: fixture.data }));
    await useStore.persist.rehydrate();
    expect(st().futureVersion).toBe(false);
  });

  it("le magasin démo n'est jamais en version future", () => {
    expect(useDemoStore.getState().futureVersion).toBe(false);
  });
});

describe("import JSON rejeté proprement", () => {
  const rejects = (text: string, msg?: RegExp) => {
    st().importJSON(fixtureText);
    const before = snapshot();
    const r = st().importJSON(text);
    expect(r.ok).toBe(false);
    if (msg) expect(r.msg).toMatch(msg);
    expect(snapshot()).toBe(before);
  };
  const withData = (patch: (d: Record<string, any>) => void, version = 2) => {
    const o = structuredClone(fixture) as Record<string, any>;
    o.schemaVersion = version;
    patch(o.data);
    return JSON.stringify(o);
  };

  it("JSON invalide", () => rejects("{pas du json", /JSON/));
  it("fichier d'une autre appli", () => rejects(JSON.stringify({ app: "autre", data: {} }), /non reconnu/));
  it("sans data", () => rejects(JSON.stringify({ app: "dd-elevage", schemaVersion: 2 })));
  it("version future", () => rejects(JSON.stringify({ ...fixture, schemaVersion: 5 }), /plus récente/));
  it("version illisible", () => rejects(JSON.stringify({ ...fixture, schemaVersion: "x" })));
  it("prix négatif", () =>
    rejects(
      withData((d) => {
        d.prices.Imagiro.g1.v = -100;
      }),
    ));
  it("prix NaN (null dans le JSON)", () =>
    rejects(
      withData((d) => {
        d.prices.Imagiro.g1.v = null;
      }),
    ));
  it("prix nul ou texte", () => {
    rejects(
      withData((d) => {
        d.prices.Imagiro.g1.v = 0;
      }),
    );
    rejects(
      withData((d) => {
        d.prices.Imagiro.g1.v = "12";
      }),
    );
  });
  it("réglage négatif ou hors bornes", () => {
    rejects(
      withData((d) => {
        d.calc.fuel = -1;
      }),
    );
    rejects(
      withData((d) => {
        d.calc.target = 42;
      }),
    );
  });
  it("serveur inconnu", () =>
    rejects(
      withData((d) => {
        d.server = "Nulle part";
      }),
    ));
  it("un rejet ne corrompt pas le localStorage", () => {
    rejects(
      withData((d) => {
        d.prices.Orukam.g5.v = -1;
      }),
    );
    expect(mem.getItem(STORAGE_KEY)).not.toContain("-1");
  });
});

describe("actions", () => {
  it("setPrice date, arrondit, efface à 0, refuse négatif / NaN / clé inconnue", () => {
    const now = Date.now();
    expect(st().setPrice("Imagiro", "g3", 90000.4)).toBe(true);
    expect(st().prices.Imagiro?.g3?.v).toBe(90000);
    expect(st().prices.Imagiro!.g3!.t).toBeGreaterThanOrEqual(now);
    expect(st().setPrice("Imagiro", "g3", -1)).toBe(false);
    expect(st().setPrice("Imagiro", "g3", NaN)).toBe(false);
    expect(st().setPrice("Imagiro", "zzz", 5)).toBe(false);
    expect(st().setPrice("Nulle part", "g3", 5)).toBe(false);
    expect(st().prices.Imagiro?.g3?.v).toBe(90000);
    expect(st().setPrice("Imagiro", "g3", 0)).toBe(true);
    expect(st().prices.Imagiro?.g3).toBeUndefined();
  });

  it("setCalc valide ; setServer refuse un serveur inconnu", () => {
    expect(st().setCalc({ takeza: true, target: 7 })).toBe(true);
    expect(st().calc).toMatchObject({ takeza: true, target: 7 });
    expect(st().setCalc({ target: 99 })).toBe(false);
    expect(st().calc.target).toBe(7);
    expect(st().setServer("Orukam")).toBe(true);
    expect(st().setServer("Nulle part")).toBe(false);
    expect(st().server).toBe("Orukam");
  });

  it("copyToAll copie en profondeur ; clearServer vide un seul serveur", () => {
    st().importJSON(fixtureText);
    st().copyToAll("Imagiro");
    expect(st().prices.Tylezia).toEqual(fixPrices.Imagiro);
    expect(st().prices.Tylezia).not.toBe(st().prices.Imagiro);
    st().clearServer("Imagiro");
    expect(st().prices.Imagiro).toBeUndefined();
    expect(st().prices.Tylezia?.g1?.v).toBe(21000);
  });

  it("âge des prix", () => {
    st().importJSON(fixtureText);
    const now = fixture.data.prices.Imagiro.neurone.t + 3 * 864e5;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(st().ageDays("Imagiro", "neurone")).toBe(3);
    expect(st().ageDays("Imagiro", "g10")).toBeNull();
    expect(st().oldestAge("Imagiro")).toBe(Math.floor((now - fixture.data.prices.Imagiro.g1.t) / 864e5));
    expect(st().oldestAge("Tylezia")).toBeNull();
  });
});

describe("Optimakina par génération : migration", () => {
  const gens = [2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("migrateOptimakina recopie le prix unique (et sa date) vers opti2..opti10", () => {
    const m = migrateOptimakina({
      prices: { Imagiro: { g1: { v: 5, t: 1 }, optimakina: { v: 150000, t: 99 } } },
    }) as { prices: { Imagiro: Record<string, unknown> } };
    const p = m.prices.Imagiro;
    expect("optimakina" in p).toBe(false);
    for (const g of gens) expect(p[`opti${g}`]).toEqual({ v: 150000, t: 99 });
    expect(p.g1).toEqual({ v: 5, t: 1 });
  });

  it("n'écrase jamais un prix déjà saisi par génération, et est idempotent", () => {
    const src = { prices: { Imagiro: { optimakina: { v: 100, t: 1 }, opti6: { v: 777, t: 2 } } } };
    const m = migrateOptimakina(src) as typeof src;
    expect((m.prices.Imagiro as Record<string, { v: number }>).opti6.v).toBe(777);
    expect((m.prices.Imagiro as Record<string, { v: number }>).opti5.v).toBe(100);
    expect(migrateOptimakina(m)).toEqual(m);
    expect("optimakina" in src.prices.Imagiro).toBe(true); // entrée non modifiée
  });

  it("l'import de l'export v2 (fixture) reporte l'Optimakina sur toutes les générations", () => {
    const r = parseExport(fixtureText);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const sp = r.data.prices.Imagiro!;
    for (const g of gens) expect(sp[`opti${g}` as PriceKey]).toEqual({ v: 150000, t: 1762972800000 });
    expect(priceValues(r.data.prices, "Imagiro").opti.slice(2)).toEqual(Array(9).fill(150000));
  });

  it("l'import d'un export v3 migre aussi ; un export v4 reste intact", () => {
    const data = { prices: { Orukam: { optimakina: { v: 1000, t: 5 } } } };
    const r3 = parseExport(JSON.stringify({ app: "dd-elevage", schemaVersion: 3, data }));
    expect(r3.ok && r3.data.prices.Orukam?.opti10?.v).toBe(1000);
    const v4 = { prices: { Orukam: { opti3: { v: 1, t: 5 } } } };
    const r4 = parseExport(JSON.stringify({ app: "dd-elevage", schemaVersion: 4, data: v4 }));
    expect(r4.ok && Object.keys(r4.data.prices.Orukam ?? {})).toEqual(["opti3"]);
  });

  it("export puis réimport : mêmes données", () => {
    useStore.setState(defaultAppData());
    st().importJSON(JSON.stringify({ app: "dd-elevage", schemaVersion: 3, data: { prices: { Orukam: { optimakina: { v: 42000, t: 7 } } } } }));
    expect(st().prices.Orukam?.opti4?.v).toBe(42000);
    const before = dataOf(st());
    const out = st().exportJSON();
    useStore.setState(defaultAppData());
    expect(st().importJSON(out).ok).toBe(true);
    expect(dataOf(st())).toEqual(before);
  });

  it("hydratation d'un localStorage v3 (clé v3) : prix unique recopié", async () => {
    mem.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 3, state: { prices: { Orukam: { optimakina: { v: 90000, t: 3 } } } } }),
    );
    await useStore.persist.rehydrate();
    expect(st().prices.Orukam?.opti2?.v).toBe(90000);
    expect(st().prices.Orukam?.opti10?.v).toBe(90000);
    expect(st().futureVersion).toBe(false);
  });

  it("une clé `optimakina` n'est plus une clé de prix ; paste par génération", () => {
    expect(st().setPrice("Orukam", "optimakina", 5)).toBe(false);
    expect(parsePaste("optimakina 5 300k").entries).toEqual([["opti5", 300000]]);
    expect(parsePaste("optimakina 150k").entries.length).toBe(9);
  });
});

describe("import par collage", () => {
  it("parsePaste : lignes valides et invalides", () => {
    const r = parsePaste(
      "5 300k\ngen 9 2,4M\nneurone 25k\n\nGénétons: 3000\noptimakina = 150 000\ngen 11 5k\nblabla\n7 abc\n4 0",
    );
    expect(r.entries).toEqual([
      ["g5", 300000],
      ["g9", 2400000],
      ["neurone", 25000],
      ["genetons", 3000],
      ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((g) => [`opti${g}`, 150000]),
    ]);
    expect(r.bad).toEqual(["gen 11 5k", "blabla", "7 abc", "4 0"]);
  });

  it("importPaste écrit les lignes valides, signale les autres", () => {
    const r = st().importPaste("Orukam", "5 300k\nbof\ngen 9 2,4M");
    expect(r).toEqual({ ok: 2, bad: ["bof"] });
    expect(st().prices.Orukam?.g5?.v).toBe(300000);
    expect(st().prices.Orukam?.g9?.v).toBe(2400000);
    expect(mem.getItem(STORAGE_KEY)).toContain("300000");
  });

  it("refuse un prix négatif collé et un serveur inconnu", () => {
    expect(st().importPaste("Orukam", "5 -300k").ok).toBe(0);
    expect(st().importPaste("Nulle part", "5 300k").ok).toBe(0);
    expect(st().prices.Orukam).toBeUndefined();
  });
});

describe("mode démo isolé (cas de #5)", () => {
  it("part de prix fictifs, séparés du vrai store", () => {
    expect(useDemoStore.getState().demo).toBe(true);
    expect(st().demo).toBe(false);
    expect(useDemoStore.getState().prices.Imagiro?.g5?.v).toBe(300000);
    expect(st().prices).toEqual({});
  });

  it("vider, copier, coller et modifier en démo ne touchent ni au vrai store ni au localStorage", () => {
    st().importJSON(fixtureText);
    const before = snapshot();

    const d = useDemoStore.getState;
    d().clearServer("Imagiro");
    d().copyToAll("Orukam");
    d().importPaste("Imagiro", "5 999k\nneurone 1k");
    d().setPrice("Imagiro", "g1", 5);
    d().setCalc({ target: 9 });
    d().setServer("Tylezia");
    expect(d().importJSON(fixtureText).ok).toBe(false);
    expect(d().prices.Imagiro?.g5?.v).toBe(999000); // l'action a bien agi... sur la démo

    expect(snapshot()).toBe(before);
    expect(st().prices.Imagiro).toEqual(fixPrices.Imagiro);
    expect(st().calc.target).toBe(6);
  });

  it("la démo n'écrit jamais dans localStorage, même seule", () => {
    mem.m.clear();
    useDemoStore.getState().setPrice("Imagiro", "g1", 123);
    useDemoStore.getState().clearServer("Orukam");
    expect(mem.m.size).toBe(0);
  });

  it("resetDemo restaure les prix fictifs", () => {
    useDemoStore.getState().clearServer("Imagiro");
    resetDemo();
    expect(useDemoStore.getState().prices.Imagiro).toMatchObject(
      Object.fromEntries(Object.entries(demoData().prices.Imagiro!).map(([k, e]) => [k, { v: e.v }])),
    );
  });

  it("la démo donne des prix différents selon le serveur, et un serveur a des prix manquants (#67)", () => {
    const P = demoData().prices;
    expect(P.Imagiro?.g5?.v).toBe(300000); // Imagiro reste la référence
    const g5 = SERVER_IDS.map((id) => P[id]?.g5?.v);
    expect(new Set(g5).size).toBeGreaterThanOrEqual(3);
    expect(P.Orukam?.opti4?.v).not.toBe(P.Imagiro?.opti4?.v);
    expect(priceCount(P, "Ombre")).toBeLessThan(PRICE_KEYS.length);
    expect(P.Ombre?.g3).toBeUndefined();
  });

  it("la meilleure génération cible change d'au moins 3 serveurs par rapport à Imagiro (#67)", () => {
    const { calc, matB, prices } = demoData();
    const lignes = matrice(prices, calc, matB).lignes;
    const meilleure = (server: ServerId) => {
      const complets = lignes.find((l) => l.server === server)!.cases.filter((c) => !c.r.incomplete);
      return complets.reduce((a, b) => (b.r.profitExpected > a.r.profitExpected ? b : a)).g;
    };
    const ref = meilleure("Imagiro");
    const differents = SERVER_IDS.filter((id) => id !== "Imagiro" && meilleure(id) !== ref);
    expect(differents.length).toBeGreaterThanOrEqual(3);
  });

  it("priceValues fournit les prix numériques pour calc", () => {
    const P = priceValues(useDemoStore.getState().prices, "Imagiro");
    expect(P.gen[10]).toBe(4000000);
    expect(P.neurone).toBe(25000);
    expect(P.gen[0]).toBe(0);
  });
});

describe("rappel par enclos (#16) : version 5", () => {
  const enclosSaisi = (saisieLe: number, rappel: unknown = undefined) => ({
    nom: "Nord", jaugeSerenite: "+", niveauSerenite: 1000, saisieLe, ...(rappel === undefined ? {} : { rappel }),
  });

  it("la version de stockage est au moins 5", () => {
    expect(STORAGE_VERSION).toBeGreaterThanOrEqual(5);
  });

  it("migrateRappels : ajoute rappel null, garde un rappel valide, répare un rappel illisible ou push, idempotent", () => {
    const src = {
      enclos: [enclosSaisi(1), enclosSaisi(2, { methode: "agenda", at: 5 }), enclosSaisi(3, { messageId: 42 }), enclosSaisi(4, { messageId: "msg_1", at: 5 })],
    };
    const m = migrateRappels(src) as { enclos: Record<string, unknown>[] };
    expect(m.enclos.map((e) => e.rappel)).toEqual([null, { methode: "agenda", at: 5 }, null, null]);
    expect(migrateRappels(m)).toEqual(m);
    expect("rappel" in src.enclos[0]).toBe(false); // argument non modifié
    expect(migrateRappels({ autre: 1 })).toEqual({ autre: 1 });
  });

  it("hydratation d'un localStorage v4 : enclos conservés, rappel à null", async () => {
    const enclos = Array.from({ length: 6 }, (_, i) => enclosSaisi(1000 + i));
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: 4, state: { ...fixture.data, enclos } }));
    await useStore.persist.rehydrate();
    expect(st().futureVersion).toBe(false);
    expect(st().enclos.map((e) => e.saisieLe)).toEqual([1000, 1001, 1002, 1003, 1004, 1005]);
    expect(st().enclos.every((e) => e.rappel === null)).toBe(true);
  });

  it("un rappel corrompu sur le disque ne fait jamais perdre les enclos", async () => {
    const enclos = Array.from({ length: 6 }, (_, i) => enclosSaisi(1000 + i, i === 2 ? { messageId: "" } : null));
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: 5, state: { ...fixture.data, enclos } }));
    await useStore.persist.rehydrate();
    expect(st().enclos[2].saisieLe).toBe(1002);
    expect(st().enclos[2].rappel).toBeNull();
  });

  it("setRappel : enregistre et persiste, refuse si l'enclos a été ressaisi", () => {
    useStore.setState({ enclos: st().enclos.map((e, i) => (i === 1 ? { ...e, saisieLe: 77 } : e)) });
    expect(st().setRappel(1, 77, { methode: "agenda", at: 123 })).toBe(true);
    expect(st().enclos[1].rappel).toEqual({ methode: "agenda", at: 123 });
    expect(JSON.parse(mem.getItem(STORAGE_KEY)!).state.enclos[1].rappel.at).toBe(123);
    expect(st().setRappel(1, 78, null)).toBe(false); // ressaisi entre-temps
    expect(st().setRappel(1, 77, { methode: "push", at: 1 } as never)).toBe(false); // push retiré : invalide
    expect(st().setRappel(9, null, null)).toBe(false);
    expect(st().setRappel(1, 77, null)).toBe(true);
    expect(st().enclos[1].rappel).toBeNull();
  });

  it("setRappel : rien n'est écrit en version future", async () => {
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: 99, state: {} }));
    await useStore.persist.rehydrate();
    const before = [...mem.m];
    expect(st().setRappel(0, null, { methode: "agenda", at: 1 })).toBe(false);
    expect([...mem.m]).toStrictEqual(before);
  });

  it("le rappel est propre à l'appareil : ni exporté ni importé", () => {
    useStore.setState({ enclos: st().enclos.map((e, i) => (i === 0 ? { ...e, saisieLe: 5, rappel: { methode: "google", at: 987654 } } : e)) });
    const out = st().exportJSON();
    expect(out).not.toContain("987654");
    expect(JSON.parse(out).data.enclos[0]).not.toHaveProperty("rappel");
    const avecRappel = JSON.parse(out);
    avecRappel.data.enclos[0].rappel = { methode: "push", messageId: "msg_y", at: 9 };
    expect(st().importJSON(JSON.stringify(avecRappel)).ok).toBe(true);
    expect(st().enclos[0].saisieLe).toBe(5);
    expect(st().enclos[0].rappel).toBeNull();
  });
});

describe("refonte (#4) : objectif par enclos, marge des rappels, démo", () => {
  it("l'objectif est enregistré et persisté ; une valeur illisible retombe sur « aucun » sans perdre l'enclos", async () => {
    expect(st().setObjectif(2, "maturite")).toBe(true);
    expect(st().setObjectif(2, "nimporte" as never)).toBe(false);
    expect(JSON.parse(mem.getItem(STORAGE_KEY)!).state.enclos[2].objectif).toBe("maturite");
    const enclos = st().enclos.map((e, i) => ({ ...e, saisieLe: 10 + i, objectif: i === 1 ? 42 : e.objectif }));
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, state: { ...fixture.data, enclos } }));
    await useStore.persist.rehydrate();
    expect(st().enclos[1].saisieLe).toBe(11);
    expect(st().enclos[1].objectif).toBe("aucun");
    expect(st().enclos[2].objectif).toBe("maturite");
  });

  it("marge des rappels : 5 min par défaut, valeurs de la liste seulement, conservée à l'import d'un export v2", () => {
    expect(st().reglages.margeRappelMin).toBe(5);
    expect(st().setMargeRappel(15)).toBe(true);
    expect(st().setMargeRappel(7)).toBe(false);
    expect(st().reglages.margeRappelMin).toBe(15);
    expect(st().importJSON(fixtureText).ok).toBe(true);
    expect(st().reglages.margeRappelMin).toBe(15);
    expect(JSON.parse(st().exportJSON()).data.reglages).toEqual({ margeRappelMin: 15, methodeRappel: null });
  });

  it("setEnclos : remplace l'enclos, remet le rappel à null, refuse un indice invalide", () => {
    const e = { ...st().enclos[0], nom: "Nord", saisieLe: 5, rappel: { methode: "agenda" as const, at: 1 } };
    expect(st().setEnclos(0, e)).toBe(true);
    expect(st().enclos[0]).toMatchObject({ nom: "Nord", saisieLe: 5, rappel: null });
    expect(st().setEnclos(6, e)).toBe(false);
  });

  it("la démo a des enclos saisis, et les modifier ne touche jamais au vrai magasin", () => {
    const d = useDemoStore.getState();
    expect(d.enclos.filter((e) => e.saisieLe !== null)).toHaveLength(3);
    const before = snapshot();
    d.setObjectif(0, "maturite");
    d.setMargeRappel(30);
    d.setEnclos(1, { ...d.enclos[1], nom: "x" });
    expect(snapshot()).toBe(before);
    expect(useDemoStore.getState().reglages.margeRappelMin).toBe(30);
  });
});

describe("version 6 (#38) : onglets et anciennes versions", () => {
  const enclosV5 = () => {
    const enclos = defaultAppData().enclos;
    enclos[4] = { ...enclos[4], nom: "Cinq", jaugeSerenite: "+", niveauSerenite: 1000, saisieLe: 7 };
    return enclos;
  };

  it("la version de stockage est au moins 6", () => {
    expect(STORAGE_VERSION).toBeGreaterThanOrEqual(6);
  });

  it("migration v5 → v6 : données inchangées, objectif et marge par défaut, réécrit en v6", async () => {
    const enclos = enclosV5();
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: 5, state: { ...fixture.data, enclos } }));
    await useStore.persist.rehydrate();
    expect(st().futureVersion).toBe(false);
    expect(st().enclos[4].nom).toBe("Cinq");
    expect(st().enclos[4].saisieLe).toBe(7);
    expect(st().enclos[4].objectif).toBe(defaultAppData().enclos[4].objectif);
    expect(st().reglages).toEqual(defaultAppData().reglages);
    expect(st().prices.Imagiro).toEqual(fixPrices.Imagiro);
    expect(JSON.parse(mem.getItem(STORAGE_KEY)!).version).toBe(STORAGE_VERSION);
  });

  it("une version plus ancienne (v5) voit les données v6 comme futures : lecture seule, rien écrit", async () => {
    /* simule le store de l'ancienne version : sa STORAGE_VERSION est 5, la nouvelle écrit 6 → on
       reproduit le même rapport avec une version supérieure à celle du code courant */
    const brut = JSON.stringify({ version: STORAGE_VERSION + 1, state: { ...fixture.data, enclos: enclosV5() } });
    mem.setItem(STORAGE_KEY, brut);
    await useStore.persist.rehydrate();
    expect(st().futureVersion).toBe(true);
    st().setPrice("Imagiro", "g5", 1);
    st().setMargeRappel(30);
    st().setObjectif(0, "maturite");
    expect(mem.getItem(STORAGE_KEY)).toBe(brut);
  });

  it("une réhydratation à valeur identique n'écrit rien", async () => {
    st().setPrice("Imagiro", "g5", 300000);
    const setItem = vi.spyOn(mem, "setItem");
    await useStore.persist.rehydrate();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("syncOnglets : un événement storage sur la clé relance la lecture ; nettoyage à la fin", async () => {
    const cible = new EventTarget();
    vi.stubGlobal("window", cible);
    const stop = syncOnglets();
    st().setPrice("Imagiro", "g5", 300000);
    const autre = JSON.parse(mem.getItem(STORAGE_KEY)!);
    autre.state.server = "Orukam";
    mem.setItem(STORAGE_KEY, JSON.stringify(autre));
    const evt = (key: string) => Object.assign(new Event("storage"), { key, storageArea: mem });
    cible.dispatchEvent(evt("autre-cle"));
    await Promise.resolve();
    expect(st().server).toBe("Draconiros");
    cible.dispatchEvent(evt(STORAGE_KEY));
    await vi.waitFor(() => expect(st().server).toBe("Orukam"));
    stop();
    autre.state.server = "Imagiro";
    mem.setItem(STORAGE_KEY, JSON.stringify(autre));
    cible.dispatchEvent(evt(STORAGE_KEY));
    await Promise.resolve();
    expect(st().server).toBe("Orukam");
  });
});

describe("version 7 (#51) : méthode de rappel mémorisée", () => {
  it("la version de stockage est au moins 7", () => {
    expect(STORAGE_VERSION).toBeGreaterThanOrEqual(7);
  });

  it("migration v6 → v7 : données gardées, méthode null, réécrit en v7", async () => {
    const enclos = defaultAppData().enclos;
    enclos[2] = { ...enclos[2], nom: "Trois", saisieLe: 9 };
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: 6, state: { ...fixture.data, enclos, reglages: { margeRappelMin: 15 } } }));
    await useStore.persist.rehydrate();
    expect(st().futureVersion).toBe(false);
    expect(st().reglages).toEqual({ margeRappelMin: 15, methodeRappel: null, rappelTournee: null });
    expect(st().enclos[2].nom).toBe("Trois");
    expect(JSON.parse(mem.getItem(STORAGE_KEY)!).version).toBe(STORAGE_VERSION);
  });

  it("migrateMethodeRappel : absent ou illisible vaut null, valide gardé, idempotent, argument intact", () => {
    const sans = { reglages: { margeRappelMin: 5 } };
    expect(migrateMethodeRappel(sans).reglages).toEqual({ margeRappelMin: 5, methodeRappel: null });
    expect(sans.reglages).toEqual({ margeRappelMin: 5 });
    expect(migrateMethodeRappel({ reglages: { margeRappelMin: 5, methodeRappel: "bip" } }).reglages.methodeRappel).toBeNull();
    expect(migrateMethodeRappel({ reglages: { margeRappelMin: 5, methodeRappel: "push" } }).reglages.methodeRappel).toBeNull(); // push retiré
    const bon = { reglages: { margeRappelMin: 5, methodeRappel: "google" } };
    expect(migrateMethodeRappel(migrateMethodeRappel(bon))).toEqual(bon);
  });

  it("setMethodeRappel : mémorisée, persistée, rechargée ; valeur invalide refusée", async () => {
    expect(st().reglages.methodeRappel).toBeNull();
    expect(st().setMethodeRappel("agenda")).toBe(true);
    expect(JSON.parse(mem.getItem(STORAGE_KEY)!).state.reglages.methodeRappel).toBe("agenda");
    expect(st().setMethodeRappel("bip" as never)).toBe(false);
    expect(st().reglages.methodeRappel).toBe("agenda");
    await useStore.persist.rehydrate();
    expect(st().reglages.methodeRappel).toBe("agenda");
    expect(st().setMethodeRappel(null)).toBe(true);
    expect(st().reglages.methodeRappel).toBeNull();
  });

  it("une méthode illisible sur le disque retombe sur null sans perdre le reste", async () => {
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: 7, state: { ...fixture.data, reglages: { margeRappelMin: 30, methodeRappel: "x" } } }));
    await useStore.persist.rehydrate();
    expect(st().reglages).toEqual({ margeRappelMin: 30, methodeRappel: null, rappelTournee: null });
  });

  it("version plus récente : la méthode ne s'écrit pas (lecture seule)", async () => {
    const brut = JSON.stringify({ version: STORAGE_VERSION + 1, state: fixture.data });
    mem.setItem(STORAGE_KEY, brut);
    await useStore.persist.rehydrate();
    st().setMethodeRappel("agenda");
    expect(mem.getItem(STORAGE_KEY)).toBe(brut);
  });

  it("l'export contient la méthode", () => {
    st().setMethodeRappel("google");
    expect(JSON.parse(st().exportJSON()).data.reglages).toEqual({ margeRappelMin: 5, methodeRappel: "google" });
  });
});

describe("version 9 : notifications push retirées", () => {
  it("la version de stockage est au moins 9", () => {
    expect(STORAGE_VERSION).toBeGreaterThanOrEqual(9);
  });

  it("migration v8 → v9 : rappel push et méthode « push » remis à null, enclos et autres rappels gardés", async () => {
    const base = { nom: "Nord", jaugeSerenite: "+", niveauSerenite: 1000 };
    const enclos = Array.from({ length: 6 }, (_, i) => ({
      ...base,
      saisieLe: 60 + i,
      rappel: i === 0 ? { methode: "push", messageId: "msg_8", at: 999 } : i === 1 ? { methode: "google", at: 555 } : null,
    }));
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: 8, state: { ...fixture.data, enclos, reglages: { margeRappelMin: 15, methodeRappel: "push" } } }));
    await useStore.persist.rehydrate();
    expect(st().futureVersion).toBe(false);
    expect(st().enclos.map((e) => e.saisieLe)).toEqual([60, 61, 62, 63, 64, 65]);
    expect(st().enclos[0].rappel).toBeNull();
    expect(st().enclos[1].rappel).toEqual({ methode: "google", at: 555 });
    expect(st().reglages).toEqual({ margeRappelMin: 15, methodeRappel: null, rappelTournee: null });
  });

  it("un export contenant un ancien rappel push s'importe (rappel ignoré)", () => {
    const exp = JSON.parse(st().exportJSON());
    exp.data.enclos[0] = { ...exp.data.enclos[0], saisieLe: 7, rappel: { methode: "push", messageId: "m", at: 9 } };
    expect(st().importJSON(JSON.stringify(exp)).ok).toBe(true);
    expect(st().enclos[0]).toMatchObject({ saisieLe: 7, rappel: null });
  });
});

describe("version 10 (#63) : objectifs Endurance et Amour", () => {
  it("la version de stockage est 10", () => {
    expect(STORAGE_VERSION).toBeGreaterThanOrEqual(10);
  });

  it("migration v9 → v10 : enclos et objectifs gardés tels quels (l'objectif n'est pas déduit de l'autre jauge)", async () => {
    const enclos = Array.from({ length: 6 }, (_, i) => ({
      nom: `E${i}`, jaugeSerenite: "-", niveauSerenite: 1000, saisieLe: 70 + i,
      autreJauge: i < 3 ? "Endurance" : null, niveauAutre: i < 3 ? 5000 : 0,
      objectif: i === 1 ? "maturite" : "aucun",
      rappel: i === 2 ? { methode: "agenda", at: 777 } : null,
    }));
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: 9, state: { ...fixture.data, enclos } }));
    await useStore.persist.rehydrate();
    expect(st().futureVersion).toBe(false);
    expect(st().enclos.map((e) => e.objectif)).toEqual(["aucun", "maturite", "aucun", "aucun", "aucun", "aucun"]);
    expect(st().enclos.map((e) => e.saisieLe)).toEqual([70, 71, 72, 73, 74, 75]);
    expect(st().enclos[2].rappel).toEqual({ methode: "agenda", at: 777 });
    expect(JSON.parse(mem.getItem(STORAGE_KEY)!).version).toBe(STORAGE_VERSION);
  });

  it("« endurance » et « amour » s'enregistrent, se persistent et se relisent", async () => {
    expect(st().setObjectif(0, "endurance")).toBe(true);
    expect(st().setObjectif(1, "amour")).toBe(true);
    const disque = JSON.parse(mem.getItem(STORAGE_KEY)!);
    expect(disque.version).toBe(STORAGE_VERSION);
    expect(disque.state.enclos.slice(0, 2).map((e: any) => e.objectif)).toEqual(["endurance", "amour"]);
    await useStore.persist.rehydrate();
    expect(st().enclos.slice(0, 2).map((e) => e.objectif)).toEqual(["endurance", "amour"]);
    /* l'export les contient aussi */
    expect(JSON.parse(st().exportJSON()).data.enclos[1].objectif).toBe("amour");
  });

  it("une appli plus ancienne voit ces données comme futures : lecture seule, l'objectif « endurance » n'est pas écrasé", async () => {
    /* même rapport que v9 face à v10 : données d'une version supérieure au code courant */
    const enclos = defaultAppData().enclos.map((e, i) => (i === 0 ? { ...e, saisieLe: 3, objectif: "endurance" } : e));
    const brut = JSON.stringify({ version: STORAGE_VERSION + 1, state: { ...fixture.data, enclos } });
    mem.setItem(STORAGE_KEY, brut);
    await useStore.persist.rehydrate();
    expect(st().futureVersion).toBe(true);
    st().setObjectif(0, "aucun");
    expect(mem.getItem(STORAGE_KEY)).toBe(brut);
  });
});

describe("version 8 (#53) : rappel agenda / Google mémorisé par enclos", () => {
  const saisi = (saisieLe: number, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    nom: "Nord", jaugeSerenite: "+", niveauSerenite: 1000, saisieLe, ...extra,
  });
  const marquer = (i: number, saisieLe: number) =>
    useStore.setState({ enclos: st().enclos.map((e, k) => (k === i ? { ...e, saisieLe } : e)) });

  it("migration v7 → v9 : l'ancien rappel push est remis à null, rien d'autre ne change", async () => {
    const enclos = Array.from({ length: 6 }, (_, i) =>
      i === 1 ? saisi(50, { rappel: { messageId: "msg_7", at: 999 } }) : saisi(40 + i),
    );
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: 7, state: { ...fixture.data, enclos } }));
    await useStore.persist.rehydrate();
    expect(st().futureVersion).toBe(false);
    expect(st().enclos[1].rappel).toBeNull();
    expect(st().enclos[1].saisieLe).toBe(50);
    expect(st().enclos[0].rappel).toBeNull();
    expect(st().enclos.every((e) => e.ancienRappel === null)).toBe(true);
    expect(JSON.parse(mem.getItem(STORAGE_KEY)!).version).toBe(STORAGE_VERSION);
  });

  it("migrateRappelsAgenda : push legacy → null, ancienRappel null, illisible → null, idempotent, argument intact", () => {
    const src = { enclos: [saisi(1, { rappel: { messageId: "m", at: 5 } }), saisi(2, { ancienRappel: { methode: "bip", at: 1 } }), saisi(3, { rappel: { methode: "agenda", at: 8 } })] };
    const m = migrateRappelsAgenda(src) as { enclos: Record<string, unknown>[] };
    expect(m.enclos[0]).toMatchObject({ rappel: null, ancienRappel: null });
    expect(m.enclos[1].ancienRappel).toBeNull();
    expect(m.enclos[2].rappel).toEqual({ methode: "agenda", at: 8 });
    expect(migrateRappelsAgenda(m)).toEqual(m);
    expect(src.enclos[0].rappel).toEqual({ messageId: "m", at: 5 });
  });

  it("setRappel agenda / google : enregistré, persisté, rechargé ; push (retiré) et page refusés", async () => {
    marquer(0, 10);
    expect(st().setRappel(0, 10, { methode: "agenda", at: 1234 })).toBe(true);
    expect(st().setRappel(0, 10, { methode: "push", at: 1 } as never)).toBe(false);
    expect(st().setRappel(0, 10, { methode: "page" as never, at: 1 })).toBe(false);
    expect(JSON.parse(mem.getItem(STORAGE_KEY)!).state.enclos[0].rappel).toEqual({ methode: "agenda", at: 1234 });
    await useStore.persist.rehydrate();
    expect(st().enclos[0].rappel).toEqual({ methode: "agenda", at: 1234 });
    expect(st().setRappel(0, 11, { methode: "google", at: 5 })).toBe(false); // ressaisi entre-temps
  });

  it("ressaisie : le rappel est remis à null et l'événement d'agenda est noté dans ancienRappel", () => {
    marquer(0, 10);
    st().setRappel(0, 10, { methode: "agenda", at: 1234 });
    expect(st().setEnclos(0, { ...st().enclos[0], saisieLe: 20 })).toBe(true);
    expect(st().enclos[0]).toMatchObject({ saisieLe: 20, rappel: null, ancienRappel: { methode: "agenda", at: 1234 } });
    /* nouvelle ressaisie sans rappel entre-temps : l'ancien événement reste noté */
    st().setEnclos(0, { ...st().enclos[0], saisieLe: 30 });
    expect(st().enclos[0].ancienRappel).toEqual({ methode: "agenda", at: 1234 });
  });

  it("vidage : rappel null et ancien événement noté", () => {
    marquer(1, 10);
    st().setRappel(1, 10, { methode: "google", at: 77 });
    st().setEnclos(1, { ...st().enclos[1], saisieLe: null, jaugeSerenite: null, niveauSerenite: 0 });
    expect(st().enclos[1]).toMatchObject({ saisieLe: null, rappel: null, ancienRappel: { methode: "google", at: 77 } });
  });

  it("annuler ou changer de méthode note l'ancien événement ; reprogrammer à l'identique ne note rien", () => {
    marquer(0, 10);
    st().setRappel(0, 10, { methode: "agenda", at: 5 });
    st().setRappel(0, 10, { methode: "agenda", at: 5 });
    expect(st().enclos[0].ancienRappel).toBeNull();
    st().setRappel(0, 10, { methode: "google", at: 9 });
    expect(st().enclos[0].ancienRappel).toEqual({ methode: "agenda", at: 5 });
    marquer(1, 10);
    st().setRappel(1, 10, { methode: "google", at: 6 });
    st().setRappel(1, 10, null);
    expect(st().enclos[1].ancienRappel).toEqual({ methode: "google", at: 6 });
  });

  it("le rappel et l'ancien rappel restent propres à l'appareil : ni exportés ni importés", () => {
    marquer(0, 5);
    st().setRappel(0, 5, { methode: "agenda", at: 9 });
    st().setEnclos(0, { ...st().enclos[0], saisieLe: 6 });
    st().setRappel(0, 6, { methode: "google", at: 12 });
    const out = st().exportJSON();
    const e0 = JSON.parse(out).data.enclos[0];
    expect(e0).not.toHaveProperty("rappel");
    expect(e0).not.toHaveProperty("ancienRappel");
    const forge = JSON.parse(out);
    forge.data.enclos[0].rappel = { methode: "agenda", at: 1 };
    forge.data.enclos[0].ancienRappel = { methode: "agenda", at: 1 };
    expect(st().importJSON(JSON.stringify(forge)).ok).toBe(true);
    expect(st().enclos[0]).toMatchObject({ rappel: null, ancienRappel: null });
  });

  it("un rappel ou un ancien rappel corrompu sur le disque ne fait jamais perdre l'enclos", async () => {
    const enclos = Array.from({ length: 6 }, (_, i) => saisi(100 + i, i === 3 ? { rappel: { methode: "bip", at: 1 }, ancienRappel: 42 } : {}));
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: 8, state: { ...fixture.data, enclos } }));
    await useStore.persist.rehydrate();
    expect(st().enclos[3]).toMatchObject({ saisieLe: 103, rappel: null, ancienRappel: null });
  });

  it("version plus récente : rien n'est écrit (lecture seule)", async () => {
    const brut = JSON.stringify({ version: STORAGE_VERSION + 1, state: fixture.data });
    mem.setItem(STORAGE_KEY, brut);
    await useStore.persist.rehydrate();
    expect(st().setRappel(0, null, { methode: "agenda", at: 1 })).toBe(false);
    expect(mem.getItem(STORAGE_KEY)).toBe(brut);
  });

  it("synchro entre onglets : un rappel agenda écrit dans un autre onglet apparaît après l'événement storage", async () => {
    const cible = new EventTarget();
    vi.stubGlobal("window", cible);
    marquer(0, 10);
    const stop = syncOnglets();
    st().setRappel(0, 10, { methode: "agenda", at: 55 });
    const ecrit = JSON.parse(mem.getItem(STORAGE_KEY)!);
    ecrit.state.enclos[0].rappel = { methode: "google", at: 66 };
    mem.setItem(STORAGE_KEY, JSON.stringify(ecrit));
    cible.dispatchEvent(Object.assign(new Event("storage"), { key: STORAGE_KEY, storageArea: mem }));
    await vi.waitFor(() => expect(st().enclos[0].rappel).toEqual({ methode: "google", at: 66 }));
    stop();
  });
});

describe("version 11 (#65) : rappel de la tournée", () => {
  const rt = { methode: "agenda" as const, at: 1234, cle: "5|0@100,1@200" };

  it("la version de stockage est au moins 11", () => {
    expect(STORAGE_VERSION).toBeGreaterThanOrEqual(11);
  });

  it("migration v10 → v11 : données gardées, rappelTournee null, réécrit en v11", async () => {
    const enclos = defaultAppData().enclos;
    enclos[1] = { ...enclos[1], nom: "Deux", saisieLe: 9 };
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: 10, state: { ...fixture.data, enclos, reglages: { margeRappelMin: 15, methodeRappel: "agenda" } } }));
    await useStore.persist.rehydrate();
    expect(st().futureVersion).toBe(false);
    expect(st().reglages).toEqual({ margeRappelMin: 15, methodeRappel: "agenda", rappelTournee: null });
    expect(st().enclos[1].nom).toBe("Deux");
    expect(JSON.parse(mem.getItem(STORAGE_KEY)!).version).toBe(STORAGE_VERSION);
  });

  it("migrateRappelTournee : absent ou illisible vaut null, valide gardé, idempotent, argument intact", () => {
    const sans = { reglages: { margeRappelMin: 5 } };
    expect(migrateRappelTournee(sans).reglages).toEqual({ margeRappelMin: 5, rappelTournee: null });
    expect(sans.reglages).toEqual({ margeRappelMin: 5 });
    expect(migrateRappelTournee({ reglages: { rappelTournee: { methode: "push", at: 1, cle: "x" } } }).reglages.rappelTournee).toBeNull();
    const bon = { reglages: { margeRappelMin: 5, rappelTournee: rt } };
    expect(migrateRappelTournee(migrateRappelTournee(bon))).toEqual(bon);
  });

  it("setRappelTournee : enregistré, persisté, rechargé, effacé ; valeur invalide ou « page » refusée", async () => {
    expect(st().reglages.rappelTournee).toBeNull();
    expect(st().setRappelTournee(rt)).toBe(true);
    expect(JSON.parse(mem.getItem(STORAGE_KEY)!).state.reglages.rappelTournee).toEqual(rt);
    expect(st().setRappelTournee({ ...rt, methode: "page" } as never)).toBe(false);
    expect(st().setRappelTournee({ methode: "agenda", at: -1, cle: "" })).toBe(false);
    await useStore.persist.rehydrate();
    expect(st().reglages.rappelTournee).toEqual(rt);
    expect(st().setRappelTournee(null)).toBe(true);
    expect(st().reglages.rappelTournee).toBeNull();
  });

  it("propre à l'appareil : jamais exporté, jamais importé ; un import garde celui de l'appareil", () => {
    st().setRappelTournee(rt);
    st().setMargeRappel(15);
    const json = st().exportJSON();
    expect(JSON.parse(json).data.reglages).toEqual({ margeRappelMin: 15, methodeRappel: null });
    const avecRappel = JSON.parse(json);
    avecRappel.data.reglages.rappelTournee = { methode: "google", at: 9, cle: "autre" };
    const p = parseExport(JSON.stringify(avecRappel));
    expect(p.ok && p.data.reglages.rappelTournee).toBeNull();
    expect(st().importJSON(JSON.stringify(avecRappel)).ok).toBe(true);
    expect(st().reglages.rappelTournee).toEqual(rt);
  });

  it("en démo : le rappel de la tournée reste en mémoire, rien n'est écrit sur le disque", () => {
    const avant = mem.getItem(STORAGE_KEY);
    useDemoStore.getState().setRappelTournee(rt);
    expect(mem.getItem(STORAGE_KEY)).toBe(avant);
    resetDemo();
  });
});

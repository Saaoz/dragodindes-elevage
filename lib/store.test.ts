/* eslint-disable @typescript-eslint/no-explicit-any -- manipulation de JSON brut dans les tests */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./__fixtures__/export-v2.json";
import { defaultAppData } from "./schema";
import {
  LEGACY_V1_KEY, LEGACY_V2_KEY, STORAGE_KEY, demoData, migrateV1, parsePaste, priceValues, resetDemo,
  useDemoStore, useStore,
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
const st = () => useStore.getState();

beforeEach(() => {
  mem = new MemStorage();
  vi.stubGlobal("localStorage", mem);
  useStore.setState(defaultAppData());
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
    expect(s.prices.Imagiro).toEqual(fixture.data.prices.Imagiro);
    expect(s.prices.Orukam).toEqual(fixture.data.prices.Orukam);
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
    expect(parsed).toMatchObject({ app: "dd-elevage", schemaVersion: 3 });
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
    expect(st().prices.Imagiro).toEqual(fixture.data.prices.Imagiro);
    expect(st().calc.optiBonus).toBe(10);
    expect(mem.getItem(LEGACY_V2_KEY)).not.toBeNull(); // clé v2 jamais modifiée
  });
});

describe("persistance", () => {
  it("écrit sous la clé v3 avec le numéro de version, et relit", async () => {
    st().setPrice("Imagiro", "g5", 300000);
    const stored = JSON.parse(mem.getItem(STORAGE_KEY)!);
    expect(stored.version).toBe(3);
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
    mem.setItem(STORAGE_KEY, JSON.stringify({ version: 9, state: { server: "Orukam" } }));
    await useStore.persist.rehydrate();
    expect(st().server).toBe("Draconiros");
    expect(JSON.parse(mem.getItem(STORAGE_KEY)!).version).toBe(9);
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
  it("version future", () => rejects(JSON.stringify({ ...fixture, schemaVersion: 4 }), /plus récente/));
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
    expect(st().prices.Tylezia).toEqual(fixture.data.prices.Imagiro);
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
      ["optimakina", 150000],
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
    expect(st().prices.Imagiro).toEqual(fixture.data.prices.Imagiro);
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

  it("priceValues fournit les prix numériques pour calc", () => {
    const P = priceValues(useDemoStore.getState().prices, "Imagiro");
    expect(P.gen[10]).toBe(4000000);
    expect(P.neurone).toBe(25000);
    expect(P.gen[0]).toBe(0);
  });
});

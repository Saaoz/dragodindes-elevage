import { describe, expect, it } from "vitest";
import {
  brouillonDe,
  CONSEIL_RETARD,
  enclosUrgents,
  raisonRetour,
  texteAlerte,
  heureRappel,
  libelleMarge,
  enclosDeBrouillon,
  formatCompteARebours,
  formatDuree,
  formatHeure,
  formatNombre,
  parseNombre,
  remplacerEnclos,
  trierParUrgence,
  visageDe,
  VISAGES,
  vueEnclos,
} from "@/lib/enclos";
import { defaultEnclos, enclosSchema } from "@/lib/schema";
import { pointsConsommes } from "@/lib/serenity";

const T0 = new Date(2026, 10, 20, 21, 0, 0).getTime();
/* Les espaces insécables (#32) ne changent pas le texte : on les ramène à des espaces pour comparer. */
const ss = (s: string) => s.replace(/[  ]/g, " ");

const enclosTest = (serenites: number[], niveau: number, sens: "+" | "-" | null = "+") =>
  enclosSchema.parse({
    nom: "Test",
    montures: serenites.map((serenite) => ({ serenite })),
    jaugeSerenite: sens,
    niveauSerenite: niveau,
    saisieLe: T0,
  });

describe("visages", () => {
  it("valeurs représentatives = milieu de chaque tranche", () => {
    expect(VISAGES.map((v) => v.valeur)).toEqual([-3500, -1000, 1000, 3500]);
  });
  it("chaque valeur retombe sur son propre visage", () => {
    for (const v of VISAGES) expect(visageDe(v.valeur).id).toBe(v.id);
    expect(visageDe(-5000).id).toBe("rouge");
    expect(visageDe(0).id).toBe("violet");
    expect(visageDe(5000).id).toBe("vert");
  });
});

describe("parseNombre", () => {
  it("accepte 85k, espaces, virgule, signe moins typographique", () => {
    expect(parseNombre("85k")).toBe(85000);
    expect(parseNombre("85 K")).toBe(85000);
    expect(parseNombre("1,5k")).toBe(1500);
    expect(parseNombre("200 000")).toBe(200000);
    expect(parseNombre("−3000")).toBe(-3000);
    expect(parseNombre("+2000")).toBe(2000);
  });
  it("refuse le reste", () => {
    expect(parseNombre("")).toBeNull();
    expect(parseNombre("abc")).toBeNull();
    expect(parseNombre("12k5")).toBeNull();
  });
});

describe("enclosDeBrouillon", () => {
  const base = { nom: " Mon enclos ", serenites: ["-3000", ""], sens: "+" as const, niveau: "200k", autre: null, niveauAutre: "" };
  it("convertit et horodate", () => {
    const r = enclosDeBrouillon(base, T0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.enclos.nom).toBe("Mon enclos");
      expect(r.enclos.montures).toEqual([{ nom: "", serenite: -3000 }]);
      expect(r.enclos.niveauSerenite).toBe(200000);
      expect(r.enclos.saisieLe).toBe(T0);
    }
  });
  it("refuse les valeurs hors bornes ou illisibles", () => {
    expect(enclosDeBrouillon({ ...base, serenites: ["6000"] }, T0).ok).toBe(false);
    expect(enclosDeBrouillon({ ...base, serenites: ["x"] }, T0).ok).toBe(false);
    expect(enclosDeBrouillon({ ...base, niveau: "300k" }, T0).ok).toBe(false);
    expect(enclosDeBrouillon({ ...base, niveau: "" }, T0).ok).toBe(false);
    expect(enclosDeBrouillon({ ...base, serenites: [""] }, T0).ok).toBe(false);
  });
  it("brouillonDe refait le même enclos", () => {
    const r = enclosDeBrouillon(base, T0);
    if (!r.ok) throw new Error("attendu ok");
    const b = brouillonDe(r.enclos);
    expect(b.serenites).toEqual(["-3000"]);
    expect(b.niveau).toBe("200000");
  });
  it("brouillonDe avec état estimé : l'autre jauge repart de son niveau estimé", () => {
    const e = enclosSchema.parse({
      nom: "Test",
      montures: [{ serenite: 0 }],
      jaugeSerenite: "+",
      niveauSerenite: 200000,
      autreJauge: "Endurance",
      niveauAutre: 90000,
      saisieLe: T0 - 20 * 60_000,
    });
    const etat = vueEnclos(e, 0, T0).plan.etat;
    const attendu = 90000 - Math.round(pointsConsommes(90000, 1200));
    expect(brouillonDe(e, etat).niveauAutre).toBe(String(attendu));
    expect(attendu).toBeLessThan(90000);
  });
  it("brouillonDe avec état estimé : jauge autre vidée → 0", () => {
    const e = enclosSchema.parse({
      nom: "Test",
      montures: [{ serenite: 0 }],
      jaugeSerenite: "+",
      niveauSerenite: 200000,
      autreJauge: "Endurance",
      niveauAutre: 1000,
      saisieLe: T0 - 60 * 60_000,
    });
    const etat = vueEnclos(e, 0, T0).plan.etat;
    expect(brouillonDe(e, etat).niveauAutre).toBe("0");
  });
  it("brouillonDe sans état estimé : niveau de l'autre jauge inchangé", () => {
    const e = enclosSchema.parse({
      nom: "Test",
      montures: [{ serenite: 0 }],
      autreJauge: "Endurance",
      niveauAutre: 90000,
      saisieLe: T0 - 20 * 60_000,
    });
    expect(brouillonDe(e).niveauAutre).toBe("90000");
  });
});

describe("vueEnclos", () => {
  it("une monture à -3 000, Sérénité + pleine : alerte +5 000 dans ~33 min", () => {
    const v = vueEnclos(enclosTest([-3000], 200000), 0, T0);
    expect(v.alerte).not.toBeNull();
    expect(v.alerte?.valeur).toBe(5000);
    expect(v.retour?.quandMs).toBe(T0 + 2000 * 1000);
    expect(v.alerte?.gaspille).toBe(192000);
  });
  it("pas d'alerte si la jauge se vide avant la borne", () => {
    const v = vueEnclos(enclosTest([0], 3000), 0, T0);
    expect(v.alerte).toBeNull();
    expect(v.retour?.evenement.type).toBe("jaugeVide");
  });
  it("sans jauge active : pas de retour", () => {
    expect(vueEnclos(enclosTest([0], 0, null), 0, T0).retour).toBeNull();
    expect(vueEnclos(defaultEnclos()[0], 0, T0).retour).toBeNull();
  });
  it("estime la sérénité maintenant", () => {
    const v = vueEnclos(enclosTest([-3000], 200000), 0, T0 + 600_000);
    expect(v.plan.etat.serenites[0]).toBe(-3000 + 600 * 4);
  });
  it("heure de vidage de l'autre jauge", () => {
    const e = enclosSchema.parse({ ...enclosTest([0], 1000), autreJauge: "Endurance", niveauAutre: 3600 });
    expect(vueEnclos(e, 0, T0).autreVideMs).toBe(T0 + 3600 * 1000);
  });
});

describe("trierParUrgence", () => {
  it("le plus proche d'abord, les sans-retour à la fin", () => {
    const r = (q: number) => ({ evenement: {} as never, quandMs: q });
    const vues = [
      { index: 0, retour: null },
      { index: 1, retour: r(500) },
      { index: 2, retour: r(100) },
      { index: 3, retour: null },
    ];
    expect(trierParUrgence(vues).map((v) => v.index)).toEqual([2, 1, 0, 3]);
  });
});

describe("remplacerEnclos", () => {
  it("remplace sans muter, ignore un indice invalide", () => {
    const l = defaultEnclos();
    const e = enclosTest([1], 1);
    const n = remplacerEnclos(l, 2, e);
    expect(n[2]).toBe(e);
    expect(l[2]).not.toBe(e);
    expect(remplacerEnclos(l, 9, e).includes(e)).toBe(false);
  });
});

describe("formats (#32 : espaces insécables)", () => {
  it("formatHeure", () => {
    expect(ss(formatHeure(new Date(2026, 10, 20, 21, 40).getTime(), T0))).toBe("21 h 40");
    expect(ss(formatHeure(new Date(2026, 10, 21, 9, 5).getTime(), T0))).toBe("demain 09 h 05");
  });
  it("formatDuree et compte à rebours", () => {
    expect(ss(formatDuree(45))).toBe("45 s");
    expect(ss(formatDuree(723))).toBe("12 min 03 s");
    expect(ss(formatDuree(3900))).toBe("1 h 05 min");
    expect(formatCompteARebours(723)).toBe("12:03");
    expect(formatCompteARebours(3909)).toBe("1:05:09");
  });
  it("les heures, durées et nombres formatés n'ont que des espaces insécables entre leurs parties", () => {
    expect(formatHeure(new Date(2026, 10, 20, 21, 33).getTime(), T0)).toBe("21 h 33");
    expect(formatDuree(3900)).toBe("1 h 05 min");
    expect(formatDuree(723)).toBe("12 min 03 s");
    expect(formatDuree(45)).toBe("45 s");
    expect(formatNombre(18600)).toMatch(/^18[  ]600$/);
    expect(formatNombre(-3000)).toMatch(/^−3[  ]000$/);
    for (const texte of [formatDuree(3900), formatHeure(new Date(2026, 10, 20, 21, 33).getTime(), T0), formatNombre(18600)]) {
      expect(texte).not.toMatch(/ /);
    }
  });
});

describe("refonte (#4) : marge réglable et tableau de bord", () => {
  it("heureRappel : retour moins la marge, jamais dans le passé", () => {
    expect(heureRappel(T0 + 3_600_000, 10, T0)).toBe(T0 + 3_000_000);
    expect(heureRappel(T0 + 60_000, 5, T0)).toBe(T0);
    expect(heureRappel(T0 + 60_000, 0, T0)).toBe(T0 + 60_000);
    expect(libelleMarge(0)).toBe("à l’heure exacte");
    expect(ss(libelleMarge(15))).toBe("15 min avant");
  });

  it("enclosUrgents : saisis avec heure de retour, le plus urgent d'abord, 3 au plus", () => {
    const liste = defaultEnclos();
    liste[4] = enclosTest([-3000], 200000); // ±5 000 vite atteint
    liste[1] = enclosTest([0], 200000, "-");
    liste[2] = enclosTest([0], 0, null); // pas de jauge : pas de retour
    const u = enclosUrgents(liste, T0);
    expect(u.map((v) => v.index)).toEqual([1, 4]); // Sérénité − : −5 000 en 1 250 s ; Sérénité + : +5 000 en 2 000 s
    expect(enclosUrgents(liste, T0, 1)).toHaveLength(1);
  });

  it("vueEnclos utilise l'objectif enregistré par défaut", () => {
    const e = { ...enclosTest([1500], 200000), objectif: "maturite" as const };
    expect(vueEnclos(e, 0, T0).retour?.evenement.type).toBe("sortieZone");
    expect(vueEnclos(e, 0, T0, "aucun").retour?.evenement.type).not.toBe("sortieZone");
  });
});

describe("raison du retour (#32) : une seule formulation, à venir ou dépassée", () => {
  it("objectif « Rester en Maturité » : à venir, la sortie de la zone Maturité", () => {
    const e = { ...enclosTest([1500], 200000), objectif: "maturite" as const };
    const v = vueEnclos(e, 0, T0);
    expect(raisonRetour(v, T0)).toBe("une monture sort de la zone Maturité");
  });

  it("objectif « Éviter ±5 000 » : à venir, la borne ±5 000", () => {
    const v = vueEnclos(enclosTest([-3000], 200000), 0, T0);
    expect(ss(raisonRetour(v, T0)!)).toBe("une monture atteint ±5 000");
  });

  it("jauge vidée avant toute borne : à venir, la jauge sera vide", () => {
    const v = vueEnclos(enclosTest([0], 3000), 0, T0);
    expect(raisonRetour(v, T0)).toBe("la jauge de sérénité sera vide à ce moment-là");
  });

  it("pas d'heure de retour : null", () => {
    expect(raisonRetour(vueEnclos(defaultEnclos()[0], 0, T0), T0)).toBeNull();
  });
});

describe("retour dépassé (#31) : les événements gardent leur vraie heure, calculée depuis la saisie", () => {
  const S = 1000;
  /* −3 000 en Sérénité + pleine : +5 000 atteint après 8 000 points, en tier 4, soit 2 000 s (21 h 33 min 20 s) */
  const borne = enclosTest([-3000], 200000);
  const H_BORNE = T0 + 2000 * S;

  it("avant l'heure : mêmes heures que le calcul depuis maintenant, alerte au futur", () => {
    for (const t of [0, 600, 1999]) {
      const v = vueEnclos(borne, 0, T0 + t * S);
      expect(v.retour?.quandMs).toBe(H_BORNE);
      expect(v.retardS).toBeNull();
      expect(v.alerte).toMatchObject({ quandMs: H_BORNE, passee: false, gaspilleDeja: 0, gaspille: 192000 });
      expect(ss(raisonRetour(v, T0 + t * S)!)).toBe("une monture atteint ±5 000");
    }
    expect(ss(texteAlerte(vueEnclos(borne, 0, T0).alerte!, T0))).toBe(
      "la monture 1 atteindra +5 000 à 21 h 33. Si tu reviens plus tard, 192 000 points de jauge sont gaspillés pour elle.",
    );
  });

  it("pile à l'heure : retard de 0 s, alerte au passé, rien encore de gaspillé", () => {
    const v = vueEnclos(borne, 0, H_BORNE);
    expect(v.retour?.quandMs).toBe(H_BORNE);
    expect(v.retardS).toBe(0);
    expect(v.alerte).toMatchObject({ passee: true, gaspilleDeja: 0 });
    expect(ss(raisonRetour(v, H_BORNE)!)).toBe("la monture 1 est à +5 000 depuis 21 h 33");
  });

  it("monture à la borne depuis 1 h : vrai retard, points gaspillés, alerte au passé, plus « objectif déjà atteint »", () => {
    const maintenant = H_BORNE + 3600 * S;
    const v = vueEnclos(borne, 0, maintenant);
    expect(v.retour?.evenement.type).toBe("premiereBorne");
    expect(v.retour?.quandMs).toBe(H_BORNE);
    expect(v.retardS).toBe(3600);
    /* 5 600 s : 20 000 points en tier 4 (5 000 s) puis 600 s × 3 = 21 800 consommés, dont 8 000 avant la borne */
    expect(v.alerte).toMatchObject({ quandMs: H_BORNE, passee: true, gaspilleDeja: 13800, gaspille: 192000 });
    expect(ss(raisonRetour(v, maintenant)!)).toBe("la monture 1 est à +5 000 depuis 21 h 33, 13 800 points de jauge gaspillés");
    expect(ss(texteAlerte(v.alerte!, maintenant))).toBe(
      "la monture 1 a atteint +5 000 à 21 h 33 : 13 800 points de jauge gaspillés pour elle depuis, jusqu’à 192 000 si tu ne reviens pas.",
    );
    expect(v.plan.etat.serenites).toEqual([5000]);
    expect(v.plan.aRemplir.statut).not.toBe("dejaAtteint");
    expect(v.plan.aRemplir.message).not.toMatch(/déjà atteint/);
    expect(CONSEIL_RETARD).toMatch(/Je quitte l’enclos/);
  });

  it("jauge vide après la borne : tout le gaspillage est compté, la jauge vide garde son heure", () => {
    const maintenant = T0 + 48 * 3600 * S;
    const v = vueEnclos(borne, 0, maintenant);
    expect(v.retour?.quandMs).toBe(H_BORNE);
    expect(v.alerte).toMatchObject({ gaspilleDeja: 192000, gaspille: 192000 });
    expect(ss(texteAlerte(v.alerte!, maintenant))).toMatch(/^la monture 1 a atteint \+5 000 à .+ 21 h 33 : 192 000 points de jauge gaspillés pour elle\.$/);
    expect(v.jaugeVideMs).toBeLessThan(maintenant);
    expect(v.jaugeVideMs).toBe(T0 + Math.round(vueEnclos(borne, 0, T0).plan.tempsVide * S));
  });

  it("jauge vidée sans borne atteinte : la jauge vide reste l'heure de retour, l'enclos reste sur l'accueil", () => {
    /* −4 000 et 3 000 points en tier 1 : jauge vide à 21 h 50, la monture finit à −1 000 */
    const e = enclosTest([-4000], 3000);
    const maintenant = T0 + 2 * 3600 * S;
    const v = vueEnclos(e, 0, maintenant);
    expect(v.plan.etat.niveauJauge).toBe(0);
    expect(v.retour).toMatchObject({ evenement: { type: "jaugeVide" }, quandMs: T0 + 3000 * S });
    expect(v.retardS).toBe(4200);
    expect(v.jaugeVideMs).toBe(T0 + 3000 * S);
    expect(v.alerte).toBeNull();
    expect(ss(raisonRetour(v, maintenant)!)).toBe("jauge Sérénité + vide depuis 21 h 50");

    const liste = defaultEnclos();
    liste[3] = e;
    liste[0] = { ...enclosTest([0], 200000, "-"), saisieLe: maintenant }; // −5 000 dans le futur
    expect(enclosUrgents(liste, maintenant).map((x) => x.index)).toEqual([3, 0]);
  });

  it("Sérénité − : libellés avec le bon signe", () => {
    const e = enclosTest([0], 3000, "-");
    const v = vueEnclos(e, 0, T0 + 4000 * S);
    expect(ss(raisonRetour(v, T0 + 4000 * S)!)).toBe("jauge Sérénité − vide depuis 21 h 50");
  });

  it("objectif Maturité dépassé : sortie de zone à sa vraie heure, au passé", () => {
    /* +1 500 en Sérénité + pleine : +2 000 après 500 points (125 s), +5 000 après 3 500 points (875 s) */
    const e = { ...enclosTest([1500], 200000), objectif: "maturite" as const };
    const maintenant = T0 + 3600 * S;
    const v = vueEnclos(e, 0, maintenant);
    expect(v.retour).toMatchObject({ evenement: { type: "sortieZone" }, quandMs: T0 + 125 * S });
    expect(v.retardS).toBe(3475);
    expect(ss(raisonRetour(v, maintenant)!)).toBe("la monture 1 est sortie de la zone Maturité à 21 h 02");
    expect(v.alerte).toMatchObject({ quandMs: T0 + 875 * S, passee: true });
    /* toutes les montures au-dessus de la Maturité : le conseil est de passer à Sérénité − */
    expect(v.plan.aRemplir).toMatchObject({ statut: "sensIncoherent", sensConseille: "-" });
  });

  it("enclos en retard en tête du tableau de bord, devant un retour à venir", () => {
    const maintenant = H_BORNE + 3600 * S;
    const liste = defaultEnclos();
    liste[5] = borne;
    liste[1] = { ...enclosTest([0], 200000), saisieLe: maintenant };
    const u = enclosUrgents(liste, maintenant);
    expect(u.map((v) => v.index)).toEqual([5, 1]);
    expect(u[0].retardS).toBe(3600);
    expect(u[1].retardS).toBeNull();
  });
});

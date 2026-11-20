import { describe, expect, it } from "vitest";
import { CAPACITE_JAUGE, TIERS } from "./data";
import { enclosSchema } from "./schema";
import {
  capaciteJauge,
  etatApres,
  etatEnclos,
  planEnclos,
  pointsConsommes,
  serenityPlan,
  SERENITE_MAX,
  tempsPourConsommer,
  tempsVidage,
  vitesseAuNiveau,
  ZONE_MATURITE,
  type SensJauge,
} from "./serenity";

const near = (got: number, want: number, eps = 1e-6) => expect(Math.abs(got - want)).toBeLessThan(eps);

/* Durée de vidage complète d'une jauge 3.7 pleine : 20 000/4 + 40 000/3 + 60 000/2 + 80 000/1 */
const VIDAGE_PLEIN_37 = 5000 + 40000 / 3 + 30000 + 80000;

describe("jauge : tiers 3.7 lus depuis lib/data.ts", () => {
  it("capacité et vitesses par tier", () => {
    expect(capaciteJauge()).toBe(CAPACITE_JAUGE);
    expect(vitesseAuNiveau(0)).toBe(TIERS[0].xpS);
    expect(vitesseAuNiveau(80000)).toBe(1);
    expect(vitesseAuNiveau(80001)).toBe(2);
    expect(vitesseAuNiveau(140000)).toBe(2);
    expect(vitesseAuNiveau(150000)).toBe(3);
    expect(vitesseAuNiveau(200000)).toBe(4);
  });

  it("jauge pleine : ≈ 35 h 38 pour se vider (somme des durées de TIERS)", () => {
    near(tempsVidage(CAPACITE_JAUGE), VIDAGE_PLEIN_37);
  });

  it("J = 85 000 : 5 000 pts à 2 pt/s, puis le reste à 1 pt/s", () => {
    near(tempsPourConsommer(85000, 5000), 2500);
    near(tempsPourConsommer(85000, 6000), 3500);
    near(tempsVidage(85000), 2500 + 80000);
    near(pointsConsommes(85000, 2500), 5000);
    near(pointsConsommes(85000, 3000), 5500);
  });

  it("points > niveau : Infinity ; points ≤ 0 : 0 ; temps énorme : tout est consommé", () => {
    expect(tempsPourConsommer(1000, 1001)).toBe(Infinity);
    expect(tempsPourConsommer(1000, 0)).toBe(0);
    expect(tempsPourConsommer(1000, -5)).toBe(0);
    expect(pointsConsommes(1000, 1e9)).toBe(1000);
    expect(pointsConsommes(1000, -3)).toBe(0);
  });

  it("paramètres : capacité 100 000 = tiers 3.5 mis à l'échelle ; vitesseMult ; tiers personnalisés", () => {
    expect(vitesseAuNiveau(40000, { capacite: 100000 })).toBe(1);
    expect(vitesseAuNiveau(40001, { capacite: 100000 })).toBe(2);
    near(tempsPourConsommer(45000, 5000, { capacite: 100000 }), 2500);
    near(tempsVidage(CAPACITE_JAUGE, { vitesseMult: 2 }), VIDAGE_PLEIN_37 / 2);
    const tiers = [{ min: 0, max: 10, xpS: 1 }, { min: 11, max: 20, xpS: 5 }];
    expect(capaciteJauge({ tiers })).toBe(20);
    near(tempsVidage(20, { tiers }), 10 / 5 + 10);
  });
});

describe("serenityPlan : exemples de l'issue #1 (valeurs 3.7)", () => {
  it("−3 000, Sérénité + pleine (200 000) : +5 000 après 8 000 pts en tier 4 → 2 000 s ; 192 000 pts gaspillés", () => {
    const plan = serenityPlan({ serenites: [-3000], sens: "+", niveauJauge: 200000 });
    const borne = plan.evenements.find((e) => e.type === "premiereBorne");
    expect(borne).toMatchObject({ points: 8000, monture: 0, valeur: 5000, niveauJauge: 192000 });
    near(borne!.temps, 2000);
    expect(plan.final).toEqual([5000]);
    expect(plan.gaspillage).toEqual([192000]);
    near(plan.tempsVide, VIDAGE_PLEIN_37);
    /* ≈ 35 h de jauge gaspillées */
    expect((plan.tempsVide - borne!.temps) / 3600).toBeGreaterThan(35);
    /* seuils −2 000, 0, +2 000 franchis dans l'ordre, tous en tier 4 */
    const seuils = plan.evenements.filter((e) => e.type === "seuil");
    expect(seuils.map((e) => e.valeur)).toEqual([-2000, 0, 2000]);
    expect(seuils.map((e) => e.temps)).toEqual([250, 750, 1250]);
    /* recommandation : 8 000 points suffisent, 192 000 de trop */
    expect(plan.aRemplir).toMatchObject({ statut: "ok", points: 8000, excedent: 192000 });
  });

  it("−3 000, cible 0, jauge à 3 000 (tier 1) : 0 atteint en 3 000 s, final 0, gaspillage 0", () => {
    const plan = serenityPlan({ serenites: [-3000], sens: "+", niveauJauge: 3000, cible: 0 });
    const cible = plan.evenements.find((e) => e.type === "cible");
    expect(cible).toMatchObject({ points: 3000, valeur: 0, temps: 3000 });
    expect(plan.final).toEqual([0]);
    expect(plan.gaspillage).toEqual([0]);
    expect(plan.tempsVide).toBe(3000);
    expect(plan.aRemplir).toMatchObject({ statut: "ok", atteignable: true, points: 3000, aAjouter: 0, excedent: 0 });
  });

  it("−3 000 et +1 000, Sérénité +, zone [−2 000 ; 2 000] : aRemplir = 1 000", () => {
    const plan = serenityPlan({ serenites: [-3000, 1000], sens: "+", niveauJauge: 0, zone: ZONE_MATURITE });
    expect(plan.aRemplir).toMatchObject({
      statut: "ok",
      atteignable: true,
      sensConseille: "+",
      points: 1000,
      pointsMin: 1000,
      pointsMax: 1000,
      aAjouter: 1000,
      ecart: 4000,
      ecartMax: 4000,
    });
    near(plan.aRemplir.duree, 1000);
  });

  it("J = 85 000 avec une monture à −5 000 : changement de tier pris en compte dans les événements", () => {
    const plan = serenityPlan({ serenites: [-5000], sens: "+", niveauJauge: 85000 });
    const temps = Object.fromEntries(plan.evenements.filter((e) => e.type === "seuil").map((e) => [e.valeur, e.temps]));
    /* −2 000 après 3 000 pts : 5 000 pts à 2 pt/s ne sont pas encore consommés → 1 500 s */
    expect(temps[-2000]).toBe(1500);
    /* 0 après 5 000 pts : 2 500 s ; +2 000 après 7 000 pts : 2 500 + 2 000 = 4 500 s */
    expect(temps[0]).toBe(2500);
    expect(temps[2000]).toBe(4500);
  });

  it("monture déjà à 5 000 avec Sérénité + : temps 0, tout est gaspillé pour elle", () => {
    const plan = serenityPlan({ serenites: [5000, 0], sens: "+", niveauJauge: 20000 });
    const borne = plan.evenements[0];
    expect(borne).toMatchObject({ type: "premiereBorne", temps: 0, points: 0, monture: 0 });
    expect(plan.gaspillage).toEqual([20000, 15000]);
    expect(plan.final).toEqual([5000, 5000]);
    expect(plan.aRemplir).toMatchObject({ points: 0, pointsMax: 0, excedent: 20000 });
  });

  it("exemples de la 3.5 retrouvés avec capacite = 100 000", () => {
    const plan = serenityPlan({ serenites: [-3000], sens: "+", niveauJauge: 100000, capacite: 100000 });
    near(plan.evenements.find((e) => e.type === "premiereBorne")!.temps, 2000);
    expect(plan.gaspillage).toEqual([92000]);
  });
});

describe("serenityPlan : Sérénité −, zone, regroupement", () => {
  it("Sérénité − : symétrique", () => {
    const plan = serenityPlan({ serenites: [3000, -1000], sens: "-", niveauJauge: 10000 });
    const borne = plan.evenements.find((e) => e.type === "premiereBorne")!;
    expect(borne).toMatchObject({ points: 4000, monture: 1, valeur: -5000 });
    expect(plan.final).toEqual([-5000, -5000]);
    expect(plan.gaspillage).toEqual([2000, 6000]);
  });

  it("sortie de zone : signalée quand la plus haute atteint +2 000", () => {
    const plan = serenityPlan({ serenites: [-3000, 1000], sens: "+", niveauJauge: 3000, zone: ZONE_MATURITE });
    const sortie = plan.evenements.find((e) => e.type === "sortieZone")!;
    expect(sortie).toMatchObject({ points: 1000, monture: 1, valeur: 2000, temps: 1000 });
    expect(plan.aRemplir.excedent).toBe(2000);
    expect(plan.aRemplir.message).toMatch(/de trop/);
  });

  it("zone seule, une monture : centrée dans la zone", () => {
    const plan = serenityPlan({ serenites: [-3000], sens: "+", niveauJauge: 0, zone: ZONE_MATURITE });
    expect(plan.aRemplir).toMatchObject({ statut: "ok", points: 3000, pointsMin: 1000, pointsMax: 5000 });
  });

  it("ramener la plus basse à 0 sans que la plus haute dépasse +2 000 : impossible → regrouper", () => {
    const plan = serenityPlan({
      serenites: [-3000, 1000, -2800, 500],
      sens: "+",
      niveauJauge: 0,
      cible: 0,
      zone: ZONE_MATURITE,
    });
    expect(plan.aRemplir).toMatchObject({
      statut: "tropEcartees",
      atteignable: false,
      pointsMin: 3000,
      pointsMax: 1000,
      points: 1000,
      ecart: 4000,
      ecartMax: 2000,
    });
    expect(plan.aRemplir.groupes).toEqual([[0, 2], [1, 3]]);
    expect(plan.aRemplir.message).toMatch(/regroupe/);
  });

  it("sens incohérent avec la cible : conseille l'autre jauge", () => {
    const plan = serenityPlan({ serenites: [1000, 2000], sens: "+", niveauJauge: 5000, cible: 0 });
    expect(plan.aRemplir).toMatchObject({ statut: "sensIncoherent", atteignable: false, sensConseille: "-", points: 0 });
    expect(plan.evenements.some((e) => e.type === "cible")).toBe(false);
  });

  it("une monture déjà hors zone dans le sens de la jauge", () => {
    const plan = serenityPlan({ serenites: [-3000, 2500], sens: "+", niveauJauge: 0, zone: ZONE_MATURITE });
    expect(plan.aRemplir).toMatchObject({ statut: "horsZone", atteignable: false, points: 0 });
  });

  it("aucune jauge active : sens déduit de la cible, rien ne bouge", () => {
    const plan = serenityPlan({ serenites: [-3000, -2500], sens: null, niveauJauge: 99999, cible: 0 });
    expect(plan.final).toEqual([-3000, -2500]);
    expect(plan.tempsVide).toBe(0);
    expect(plan.evenements).toEqual([]);
    expect(plan.aRemplir).toMatchObject({ statut: "ok", sensConseille: "+", points: 3000, aAjouter: 3000 });
  });

  it("monture déjà à ±5 000 sans objectif : pas « objectif déjà atteint », les points sont gaspillés (#31)", () => {
    const plan = serenityPlan({ serenites: [5000, 1000], sens: "+", niveauJauge: 50000 });
    expect(plan.aRemplir).toMatchObject({ statut: "horsZone", atteignable: false, points: 0, sensConseille: null });
    expect(plan.aRemplir.message).not.toMatch(/déjà atteint/);
    expect(plan.aRemplir.message).toMatch(/déjà à \+5 000.*gaspillé/);
    expect(plan.aRemplir.message).not.toMatch(/reviens la couper/);
    const moins = serenityPlan({ serenites: [-5000], sens: "-", niveauJauge: 0 });
    expect(moins.aRemplir.message).toMatch(/déjà à −5 000.*Sérénité −.*Sérénité \+/);
  });

  it("aucune jauge et aucun objectif", () => {
    const plan = serenityPlan({ serenites: [0], sens: null, niveauJauge: 0 });
    expect(plan.aRemplir).toMatchObject({ statut: "dejaAtteint", points: 0 });
  });

  it("jauge vide : aucun événement, final = départ", () => {
    const plan = serenityPlan({ serenites: [-3000], sens: "+", niveauJauge: 0 });
    expect(plan.evenements).toEqual([]);
    expect(plan.final).toEqual([-3000]);
    expect(plan.tempsVide).toBe(0);
    expect(plan.aRemplir).toMatchObject({ points: 8000, aAjouter: 8000 });
  });

  it("liste vide : seulement « jauge vide »", () => {
    const plan = serenityPlan({ serenites: [], sens: "+", niveauJauge: 1000 });
    expect(plan.evenements.map((e) => e.type)).toEqual(["jaugeVide"]);
    expect(plan.final).toEqual([]);
    expect(plan.gaspillage).toEqual([]);
    expect(plan.aRemplir.statut).toBe("aucuneMonture");
  });

  it("valeurs hors bornes ramenées dans les bornes", () => {
    const plan = serenityPlan({ serenites: [9000, -12000, Number.NaN], sens: "-", niveauJauge: 999999 });
    expect(plan.final).toEqual([-5000, -5000, -5000]);
    expect(plan.gaspillage).toEqual([CAPACITE_JAUGE - 10000, CAPACITE_JAUGE, CAPACITE_JAUGE - 5000]);
    near(plan.tempsVide, VIDAGE_PLEIN_37);
    expect(serenityPlan({ serenites: [0], sens: "+", niveauJauge: -50 }).tempsVide).toBe(0);
  });

  it("jauge déjà à moitié : points à ajouter seulement", () => {
    const plan = serenityPlan({ serenites: [-4000], sens: "+", niveauJauge: 1500, cible: 0 });
    expect(plan.aRemplir).toMatchObject({ points: 4000, aAjouter: 2500, excedent: 0 });
    expect(plan.aRemplir.message).toMatch(/ajoute 2 500/);
  });

  it("événements triés par temps", () => {
    const plan = serenityPlan({ serenites: [-4500, -1000, 3000], sens: "+", niveauJauge: 150000, cible: 0, zone: ZONE_MATURITE });
    const temps = plan.evenements.map((e) => e.temps);
    expect(temps).toEqual([...temps].sort((a, b) => a - b));
    expect(plan.evenements[plan.evenements.length - 1].type).toBe("jaugeVide");
  });
});

describe("état estimé à un instant", () => {
  it("etatApres : niveau restant et sérénités", () => {
    const e = etatApres({ serenites: [-3000, 4900], sens: "+", niveauJauge: 85000 }, 3000);
    near(e.pointsConsommes, 5500);
    near(e.niveauJauge, 79500);
    expect(e.serenites).toEqual([2500, 5000]);
    expect(etatApres({ serenites: [10], sens: null, niveauJauge: 500 }, 1e6).serenites).toEqual([10]);
  });

  it("etatEnclos / planEnclos : directement sur un enclos du schéma", () => {
    const t0 = Date.UTC(2026, 10, 20, 18, 0, 0);
    const enclos = enclosSchema.parse({
      montures: [{ serenite: -3000 }, { serenite: -1000 }],
      jaugeSerenite: "+",
      niveauSerenite: 3000,
      saisieLe: t0,
    });
    const maintenant = t0 + 1000 * 1000;
    const e = etatEnclos(enclos, maintenant);
    expect(e).toMatchObject({ serenites: [-2000, 0], niveauJauge: 2000, pointsConsommes: 1000, tempsEcoule: 1000 });
    const plan = planEnclos(enclos, maintenant, { zone: ZONE_MATURITE });
    expect(plan.final).toEqual([0, 2000]);
    expect(plan.tempsVide).toBe(2000);
    /* sans horodatage : état saisi */
    expect(etatEnclos({ ...enclos, saisieLe: null }, maintenant).serenites).toEqual([-3000, -1000]);
    /* aucune jauge : niveau ignoré */
    expect(etatEnclos({ ...enclos, jaugeSerenite: null }, maintenant).niveauJauge).toBe(0);
  });
});

describe("propriétés", () => {
  const niveaux = [0, 1, 999, 80000, 80001, 85000, 139999, 140000, 150000, 180000, 190000, 200000];

  it("le temps croît avec le nombre de points", () => {
    for (const n of niveaux) {
      let avant = -1;
      for (let d = 0; d <= n; d += Math.max(1, Math.floor(n / 37))) {
        const t = tempsPourConsommer(n, d);
        expect(t).toBeGreaterThan(avant);
        avant = t;
      }
    }
  });

  it("aller-retour temps ↔ points", () => {
    for (const n of niveaux)
      for (const f of [0, 0.1, 0.33, 0.5, 0.77, 1]) {
        const d = n * f;
        near(pointsConsommes(n, tempsPourConsommer(n, d)), d, 1e-6);
        const t = tempsVidage(n) * f;
        near(tempsPourConsommer(n, pointsConsommes(n, t)), t, 1e-6);
      }
  });

  it("aucune sérénité hors bornes, gaspillage ≥ 0, sérénité finale cohérente", () => {
    const sens: SensJauge[] = ["+", "-"];
    for (const s of sens)
      for (const n of niveaux)
        for (const v of [-5000, -4999, -2000, 0, 1234, 4999, 5000]) {
          const plan = serenityPlan({ serenites: [v, -v], sens: s, niveauJauge: n });
          for (const x of plan.final) expect(Math.abs(x)).toBeLessThanOrEqual(SERENITE_MAX);
          for (const g of plan.gaspillage) expect(g).toBeGreaterThanOrEqual(0);
          for (const t of [0, 1000, 50000, 1e7]) {
            const e = etatApres({ serenites: [v, -v], sens: s, niveauJauge: n }, t);
            for (const x of e.serenites) expect(Math.abs(x)).toBeLessThanOrEqual(SERENITE_MAX);
            expect(e.niveauJauge).toBeGreaterThanOrEqual(-1e-9);
          }
        }
  });

  it("aRemplir ne fait jamais dépasser la zone quand c'est atteignable", () => {
    for (const a of [-5000, -3000, -1500, 0, 1500])
      for (const b of [-4000, -2000, 0, 1000, 2000]) {
        const plan = serenityPlan({ serenites: [a, b], sens: "+", niveauJauge: 0, zone: ZONE_MATURITE });
        if (!plan.aRemplir.atteignable) continue;
        const fin = serenityPlan({ serenites: [a, b], sens: "+", niveauJauge: plan.aRemplir.points }).final;
        for (const x of fin) {
          expect(x).toBeGreaterThanOrEqual(ZONE_MATURITE.min);
          expect(x).toBeLessThanOrEqual(ZONE_MATURITE.max);
        }
      }
  });
});

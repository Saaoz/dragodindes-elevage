import { describe, expect, it } from "vitest";
import {
  annonceEnregistre,
  APERCU_NEUTRE,
  apercuSaisie,
  CONSEIL_MAINTENANT,
  SEUIL_A_FAIRE_MAINTENANT_S,
  brouillonDe,
  alerteSurRetour,
  changerAutreJauge,
  objectifParDefaut,
  OPTIONS_OBJECTIF,
  texteAlerteJauge,
  texteAutreJauge,
  consoAutreJauge,
  ZONES,
  CONSEIL_RETARD,
  enclosUrgents,
  cleTournee,
  evenementTournee,
  FENETRE_TOURNEE_MIN,
  grouperTournees,
  type RetourEnclos,
  type VueEnclos,
  estUrgent,
  SEUIL_URGENCE_S,
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
  texteEnclosPasPlein,
  trierParUrgence,
  visageDe,
  VISAGES,
  vueEnclos,
} from "@/lib/enclos";
import { defaultEnclos, enclosSchema } from "@/lib/schema";
import { deplacer, pointsConsommes, ZONE_AMOUR, ZONE_ENDURANCE } from "@/lib/serenity";
import { demoData } from "@/lib/store";

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
  const base = { nom: " Mon enclos ", serenites: ["-3000", ""], sens: "+" as const, niveau: "200k", autre: null, niveauAutre: "", objectif: "aucun" as const };
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
    /* sérénité 0 poussée vers le haut : toujours en Amour, la jauge Amour se vide sans pause */
    const e = enclosSchema.parse({
      nom: "Test",
      montures: [{ serenite: 0 }],
      jaugeSerenite: "+",
      niveauSerenite: 200000,
      autreJauge: "Amour",
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
      autreJauge: "Amour",
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
    const e = enclosSchema.parse({ ...enclosTest([0], 1000), autreJauge: "Amour", niveauAutre: 3600 });
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

describe("conseil de remplissage de la carte (#33)", () => {
  const maturite = (e: ReturnType<typeof enclosTest>, t: number) => vueEnclos(e, 0, T0 + t * 1000, "maturite");

  it("avec excédent : jamais « pas besoin de revenir », conseil pour le retour, sans promesse de « couper »", () => {
    const v = maturite(enclosTest([-3000], 200000), 0);
    expect(v.retour).not.toBeNull();
    const c = ss(v.conseil!);
    /* à l'heure de retour la monture est à +2 000 et la jauge + pousse encore : jauge opposée (#45) */
    expect(c).toMatch(/^À ton retour : passe sur la jauge Sérénité − et mets 2 000 points au total pour recentrer tes montures dans la zone Maturité\./);
    expect(c).toMatch(/plus de points que nécessaire : change de jauge dès ton retour\.$/);
    expect(c).not.toMatch(/pas besoin de revenir|couper|à vérifier en jeu|carburant/);
    /* l'heure de retour est dans le titre de la carte : le conseil ne la répète pas (#57) */
    expect(c).not.toMatch(/\d{2} h \d{2}/);
  });

  it("stable : même conseil à t et t + 60 s avant l'heure de retour", () => {
    for (const objectif of ["aucun", "maturite"] as const) {
      const e = enclosTest([-3000, 1000], 50000);
      const a = vueEnclos(e, 0, T0, objectif).conseil;
      const b = vueEnclos(e, 0, T0 + 60_000, objectif).conseil;
      const c = vueEnclos(e, 0, T0 + 600_000, objectif).conseil;
      expect(b).toBe(a);
      expect(c).toBe(a);
    }
  });

  it("sans heure de retour (jauge vide à la saisie) : « pas besoin de revenir » reste possible", () => {
    const v = maturite(enclosTest([-3000], 0), 60);
    expect(v.retour).toBeNull();
    expect(ss(v.conseil!)).toMatch(/pas besoin de revenir avant qu.elle soit vide/);
  });

  it("une carte avec heure de retour n'affiche jamais « pas besoin de revenir »", () => {
    for (const niveau of [3000, 50000, 200000])
      for (const objectif of ["aucun", "maturite"] as const) {
        const v = vueEnclos(enclosTest([-3000, 1000], niveau), 0, T0, objectif);
        expect(v.retour).not.toBeNull();
        expect(v.conseil ?? "").not.toMatch(/pas besoin de revenir/);
      }
  });

  it("retour dépassé (#64) : conseil chiffré sur l'état estimé maintenant, puis CONSEIL_RETARD", () => {
    /* à 23 h 00, la monture est à +5 000 et la Sérénité + pousse encore : Sérénité −, 10 000 points au plus */
    const v = vueEnclos(enclosTest([-3000], 200000), 0, T0 + 2 * 3600_000);
    expect(v.retardS).not.toBeNull();
    expect(ss(v.conseil!)).toBe(
      "Maintenant : passe sur la jauge Sérénité − et mets 10 000 points au total : c'est le maximum avant qu'une monture atteigne −5 000.",
    );
    expect(CONSEIL_RETARD).toMatch(/Je quitte l’enclos/);
  });
});

describe("conseil au retour au bord de la zone (#45)", () => {
  const S = 1000;
  const maturite = (serenites: number[], niveau: number, sens: "+" | "-" = "+") => ({
    ...enclosTest(serenites, niveau, sens),
    objectif: "maturite" as const,
  });

  it("deux montures, Maturité, jauge + active : au retour, Sérénité − avec N > 0 (plus « déjà atteint »)", () => {
    /* −1 000 et +1 000 : +2 000 atteint après 1 000 points ; au retour [0 ; 2 000], recentrer = 1 000 points de Sérénité − */
    const v = vueEnclos(maturite([-1000, 1000], 50000), 0, T0);
    expect(v.retour?.evenement.type).toBe("sortieZone");
    const c = ss(v.conseil!);
    expect(c).toMatch(/^À ton retour : passe sur la jauge Sérénité − et mets 1 000 points au total pour recentrer tes montures dans la zone Maturité\./);
    expect(c).not.toMatch(/déjà atteint|pas besoin de revenir/);
  });

  it("deux montures, Maturité, jauge − active : au retour, Sérénité + avec N > 0", () => {
    /* +1 500 et −1 000 : −2 000 atteint après 1 000 points ; au retour [500 ; −2 000], 750 points de Sérénité + */
    const v = vueEnclos(maturite([1500, -1000], 50000, "-"), 0, T0);
    expect(ss(v.conseil!)).toMatch(/^À ton retour : passe sur la jauge Sérénité \+ et mets 750 points au total pour recentrer/);
  });

  it("objectif ±5 000 : la monture atteint +5 000, conseil Sérénité − (maximum sans gaspiller)", () => {
    /* −3 000 et 0 en Sérénité + pleine : +5 000 après 5 000 points ; au retour [2 000 ; 5 000] */
    const v = vueEnclos(enclosTest([-3000, 0], 200000), 0, T0);
    expect(v.retour?.evenement.type).toBe("premiereBorne");
    expect(ss(v.conseil!)).toMatch(
      /^À ton retour : passe sur la jauge Sérénité − et mets 7 000 points au total : c'est le maximum avant qu'une monture atteigne −5 000\./,
    );
  });

  it("groupe aussi large que la zone (−3 000 et +1 000 → −2 000 et +2 000) : séparer, plus « déjà atteint »", () => {
    for (const serenites of [[-3000, 1000], [-4000, 1000]]) {
      const c = ss(vueEnclos(maturite(serenites, 50000), 0, T0).conseil!);
      expect(c).toMatch(/^À ton retour : tes montures sont trop écartées pour être recentrées ensemble dans la zone Maturité \(\d \d{3} d'écart, il faut moins de 4 000\) : sépare-les/);
      expect(c).not.toMatch(/déjà atteint/);
    }
  });

  it("montures stables au retour (jauge vide pile au bord) : « objectif déjà atteint » reste juste", () => {
    /* 1 000 points : la jauge est vide quand les montures arrivent à −2 000 et +2 000 */
    const v = vueEnclos(maturite([-3000, 1000], 1000), 0, T0);
    expect(v.retour?.evenement.niveauJauge).toBe(0);
    expect(ss(v.conseil!)).toBe("À ton retour : objectif déjà atteint : aucun point de sérénité à mettre.");
  });

  it("stable dans le temps : même conseil à t, t + 60 s et t + 10 min avant l'heure de retour", () => {
    const e = maturite([-1000, 1000], 50000);
    const a = vueEnclos(e, 0, T0).conseil;
    expect(vueEnclos(e, 0, T0 + 60 * S).conseil).toBe(a);
    expect(vueEnclos(e, 0, T0 + 600 * S).conseil).toBe(a);
    expect(vueEnclos(e, 0, (vueEnclos(e, 0, T0).retour?.quandMs ?? 0) - 1).conseil).toBe(a);
  });

  it("retour dépassé (#64) : conseil de jauge opposée calculé sur l'état estimé maintenant", () => {
    const e = maturite([-1000, 1000], 50000);
    const quand = vueEnclos(e, 0, T0).retour!.quandMs;
    /* pile à l'heure : [0 ; +2 000] → 1 000 points ; 1 h plus tard (tier 1) : [+3 600 ; +5 000] → 4 300 points */
    for (const [t, points] of [[quand, "1 000"], [quand + 3600 * S, "4 300"]] as const) {
      const v = vueEnclos(e, 0, t);
      expect(v.retardS).not.toBeNull();
      expect(v.aFaireMaintenant).toBe(false);
      expect(ss(v.conseil!)).toBe(
        `Maintenant : passe sur la jauge Sérénité − et mets ${points} points au total pour recentrer tes montures dans la zone Maturité.`,
      );
    }
  });
});

describe("carte allégée (#57)", () => {
  const S = 1000;
  /* retour (+5 000) à T0 + 2 000 s = 33 min 20 s : au-dessus du seuil d'urgence */
  const borne = enclosTest([-3000], 200000);

  it("seuil d'urgence : 30 min", () => {
    expect(SEUIL_URGENCE_S).toBe(1800);
  });

  it("à plus de 30 min du retour : pas urgent, même avec une alerte ±5 000", () => {
    const v = vueEnclos(borne, 0, T0);
    expect(v.alerte).not.toBeNull();
    expect(estUrgent(v, T0)).toBe(false);
  });

  it("à moins de 30 min du retour : urgent ; pile à 30 min : pas encore", () => {
    const retour = vueEnclos(borne, 0, T0).retour!.quandMs;
    expect(estUrgent(vueEnclos(borne, 0, retour - 1800 * S), retour - 1800 * S)).toBe(false);
    expect(estUrgent(vueEnclos(borne, 0, retour - 1799 * S), retour - 1799 * S)).toBe(true);
    expect(estUrgent(vueEnclos(borne, 0, retour - 60 * S), retour - 60 * S)).toBe(true);
  });

  it("retour dépassé : urgent ; sans heure de retour : jamais urgent", () => {
    const retour = vueEnclos(borne, 0, T0).retour!.quandMs;
    expect(estUrgent(vueEnclos(borne, 0, retour + 5 * S), retour + 5 * S)).toBe(true);
    const sans = vueEnclos(enclosTest([0], 0, null), 0, T0);
    expect(sans.retour).toBeNull();
    expect(estUrgent(sans, T0)).toBe(false);
  });

  it("l'alerte sur le même événement que le titre ne répète pas l'heure, mais garde les points gaspillés", () => {
    const v = vueEnclos(borne, 0, T0);
    expect(alerteSurRetour(v)).toBe(true);
    const t = ss(texteAlerte(v.alerte!, T0, true));
    expect(t).toBe("la monture 1 atteindra +5 000. Si tu reviens plus tard, 192 000 points de jauge sont gaspillés pour elle.");
    expect(t).not.toMatch(/\d{2} h \d{2}/);
    const passe = vueEnclos(borne, 0, v.retour!.quandMs + 3600 * S);
    expect(ss(texteAlerte(passe.alerte!, passe.retour!.quandMs, true))).not.toMatch(/\d{2} h \d{2}/);
  });

  it("l'heure de retour n'est répétée ni dans le conseil ni dans l'alerte (une seule fois, dans le titre)", () => {
    const v = vueEnclos(borne, 0, T0);
    const textes = ss([v.conseil ?? "", texteAlerte(v.alerte!, T0, alerteSurRetour(v))].join(" "));
    expect(textes).not.toMatch(/\d{2} h \d{2}/);
    expect(textes).not.toMatch(/à vérifier en jeu|carburant/);
  });

  it("Rester en Maturité : l'alerte ±5 000 plus tardive est un autre événement, avec son heure", () => {
    const v = vueEnclos(borne, 0, T0, "maturite");
    expect(alerteSurRetour(v)).toBe(false);
    expect(ss(texteAlerte(v.alerte!, T0, alerteSurRetour(v)))).toMatch(/atteindra \+5 000 à 21 h 33/);
  });

  it("sans jauge de sérénité : aucune phrase « aucun objectif », pas de conseil en double", () => {
    for (const objectif of ["aucun", "maturite"] as const) {
      const v = vueEnclos(enclosTest([0, 1000], 0, null), 0, T0, objectif);
      expect(v.retour).toBeNull();
      expect(v.conseil ?? "").not.toMatch(/objectif/);
    }
    expect(vueEnclos(enclosTest([0], 0, null), 0, T0).conseil).toBeNull();
  });
});
describe("objectifs Endurance et Amour (#63)", () => {
  const avec = (serenites: number[], sens: "+" | "-" | null, niveau: number, extra: Record<string, unknown> = {}) =>
    enclosSchema.parse({
      nom: "Test",
      montures: serenites.map((serenite) => ({ serenite })),
      jaugeSerenite: sens,
      niveauSerenite: niveau,
      saisieLe: T0,
      ...extra,
    });
  /* « mets N points » du conseil */
  const pointsDuConseil = (conseil: string) => Number(/mets ([\d ]+) points/.exec(conseil)![1].replace(/\D/g, ""));

  it("quatre objectifs, chacun avec sa zone", () => {
    expect(OPTIONS_OBJECTIF.map((o) => o.valeur)).toEqual(["aucun", "maturite", "endurance", "amour"]);
    expect(ss(OPTIONS_OBJECTIF.map((o) => o.label).join(" / "))).toBe(
      "Éviter ±5 000 / Rester en Maturité / Rester en Endurance / Rester en Amour",
    );
    expect(ZONES.endurance).toBe(ZONE_ENDURANCE);
    expect(ZONES.amour).toBe(ZONE_AMOUR);
  });

  it("issue : −4 200 / −3 800 / −3 000 en Sérénité −, objectif Endurance : le conseil ne fait passer aucune monture à ≥ 0", () => {
    const e = avec([-4200, -3800, -3000], "-", 60000, { autreJauge: "Endurance", niveauAutre: 200000, objectif: "endurance" });
    const v = vueEnclos(e, 0, T0);
    expect(v.retour?.evenement.type).toBe("premiereBorne");
    expect(ss(v.conseil!)).toMatch(
      /^À ton retour : passe sur la jauge Sérénité \+ et mets 1 900 points au total pour recentrer tes montures dans la zone Endurance \(sérénité négative\)\./,
    );
    const auRetour = [-4200, -3800, -3000].map((s) => deplacer(s, "-", v.retour!.evenement.points));
    for (const s of auRetour) expect(deplacer(s, "+", pointsDuConseil(ss(v.conseil!)))).toBeLessThan(0);
    /* les sérénités restent négatives : l'Endurance monte, pas d'alerte de jauge */
    expect(v.alerteJauge).toBeNull();
  });

  it("issue : +3 000 / +4 200 / +4 900 en Sérénité +, objectif Amour : le conseil ne fait passer aucune monture sous 0", () => {
    const e = avec([3000, 4200, 4900], "+", 200000, { autreJauge: "Amour", niveauAutre: 90000, objectif: "amour" });
    const v = vueEnclos(e, 0, T0);
    /* +4 900 en Sérénité + pleine : +5 000 dans 25 s, c'est « à faire maintenant » (#64) ; conseil à l'instant de la borne */
    expect(v.aFaireMaintenant).toBe(true);
    expect(ss(v.conseil!)).toMatch(/^Passe sur la jauge Sérénité − et mets 1 550 points au total pour recentrer tes montures dans la zone Amour/);
    const auRetour = [3000, 4200, 4900].map((s) => deplacer(s, "+", v.retour!.evenement.points));
    for (const s of auRetour) expect(deplacer(s, "-", pointsDuConseil(ss(v.conseil!)))).toBeGreaterThanOrEqual(0);
  });

  it("heure de retour : Endurance en Sérénité + = sortie de la zone Endurance, avant que la sérénité devienne positive", () => {
    const v = vueEnclos(avec([-3000, -1200], "+", 60000, { objectif: "endurance" }), 0, T0);
    expect(v.retour?.evenement).toMatchObject({ type: "sortieZone", points: 1199 });
    expect(v.objectif).toBe("endurance");
    expect(raisonRetour(v, T0)).toBe("une monture sort de la zone Endurance (sérénité négative)");
    const tard = v.retour!.quandMs + 60_000;
    expect(ss(raisonRetour(vueEnclos(avec([-3000, -1200], "+", 60000, { objectif: "endurance" }), 0, tard), tard)!)).toBe("la monture 2 est sortie de la zone Endurance (sérénité négative) à 21 h 19");
    const amour = vueEnclos(avec([3000, 500], "-", 60000, { objectif: "amour" }), 0, T0);
    expect(raisonRetour(amour, T0)).toBe("une monture sort de la zone Amour (sérénité positive)");
    /* Maturité inchangé */
    expect(raisonRetour(vueEnclos(avec([1500], "+", 200000), 0, T0, "maturite"), T0)).toBe("une monture sort de la zone Maturité");
  });
});

describe("objectif proposé à la saisie selon l'autre jauge (#63)", () => {
  const brouillon = { nom: "", serenites: ["-3000"], sens: "-" as const, niveau: "60000", autre: null, niveauAutre: "", objectif: "aucun" as const };

  it("objectifParDefaut : Endurance, Amour, Maturité ; sinon l'objectif actuel", () => {
    expect(objectifParDefaut("Endurance", "aucun")).toBe("endurance");
    expect(objectifParDefaut("Amour", "maturite")).toBe("amour");
    expect(objectifParDefaut("Maturité", "endurance")).toBe("maturite");
    expect(objectifParDefaut("Expérience de monture", "amour")).toBe("amour");
    expect(objectifParDefaut(null, "maturite")).toBe("maturite");
  });

  it("choisir l'autre jauge propose son objectif, sauf si le joueur a déjà choisi l'objectif dans cette saisie", () => {
    const b = changerAutreJauge(brouillon, "Endurance", false);
    expect(b).toMatchObject({ autre: "Endurance", objectif: "endurance" });
    expect(changerAutreJauge(b, "Amour", false).objectif).toBe("amour");
    expect(changerAutreJauge(b, "Expérience de monture", false).objectif).toBe("endurance");
    expect(changerAutreJauge({ ...b, objectif: "aucun" }, "Maturité", true).objectif).toBe("aucun");
    /* l'objectif de la saisie est celui enregistré */
    const r = enclosDeBrouillon({ ...b, niveauAutre: "100k" }, T0);
    expect(r.ok && r.enclos.objectif).toBe("endurance");
  });

  it("brouillonDe : un objectif « Éviter ±5 000 » est remplacé par celui de l'autre jauge, un autre choix est gardé", () => {
    const e = (autreJauge: string | null, objectif: string) =>
      enclosSchema.parse({ nom: "x", montures: [{ serenite: -3000 }], autreJauge, niveauAutre: 1000, saisieLe: T0, objectif });
    expect(brouillonDe(e("Endurance", "aucun")).objectif).toBe("endurance");
    expect(brouillonDe(e("Maturité", "aucun")).objectif).toBe("maturite");
    expect(brouillonDe(e("Endurance", "maturite")).objectif).toBe("maturite");
    expect(brouillonDe(e("Expérience de monture", "aucun")).objectif).toBe("aucun");
    expect(brouillonDe(e(null, "amour")).objectif).toBe("amour");
  });

  it("issue : jauge Maturité saisie avec « Éviter ±5 000 » : la saisie suivante propose Maturité, le retour avance à la sortie de zone", () => {
    const e = enclosSchema.parse({
      nom: "Maturité A", montures: [{ serenite: 1000 }], jaugeSerenite: "+", niveauSerenite: 150000,
      autreJauge: "Maturité", niveauAutre: 150000, saisieLe: T0,
    });
    const avant = vueEnclos(e, 0, T0);
    const r = enclosDeBrouillon(brouillonDe(e), T0);
    if (!r.ok) throw new Error("attendu ok");
    expect(r.enclos.objectif).toBe("maturite");
    const apres = vueEnclos(r.enclos, 0, T0);
    expect(apres.retour?.evenement.type).toBe("sortieZone");
    expect(apres.retour!.quandMs).toBeLessThan(avant.retour!.quandMs);
  });
});

describe("alerte : Endurance / Amour / Maturité qui ne monte plus (#63)", () => {
  const enclos = (serenites: number[], sens: "+" | "-" | null, niveau: number, autreJauge: string, niveauAutre = 200000) =>
    enclosSchema.parse({
      nom: "A",
      montures: serenites.map((serenite) => ({ serenite })),
      jaugeSerenite: sens,
      niveauSerenite: niveau,
      autreJauge,
      niveauAutre,
      saisieLe: T0,
    });
  const texte = (v: ReturnType<typeof vueEnclos>, t = T0) => ss(texteAlerteJauge(v.alerteJauge!, t));

  it("ancienne démo : Endurance avec Sérénité +, montures poussées en positif : alerte datée, puis au présent", () => {
    const e = enclos([-3200, -2900, -2600, -2400], "+", 150000, "Endurance", 90000);
    const v = vueEnclos(e, 0, T0);
    expect(v.alerteJauge).toMatchObject({ jauge: "Endurance", deja: false, montures: [3], suivantes: [0, 1, 2] });
    expect(texte(v)).toBe(
      "À partir de 21 h 13, l’Endurance ne montera plus pour la monture 4 : sa sérénité ne sera plus négative (l’Endurance ne monte qu’en sérénité négative). Les montures 1, 2 et 3 suivront.",
    );
    const t = T0 + 60 * 60_000;
    const apres = vueEnclos(e, 0, t);
    expect(apres.alerteJauge).toMatchObject({ deja: true, montures: [0, 1, 2, 3] });
    expect(texte(apres, t)).toMatch(/^L’Endurance ne monte plus pour aucune de tes montures depuis 21 h 17 : leur sérénité n’est pas négative/);
  });

  it("ancienne démo : Amour avec des montures déjà négatives, sans mouvement : alerte au présent, sans heure", () => {
    const v = vueEnclos(enclos([-5000, -3900], null, 0, "Amour", 120000), 0, T0);
    expect(v.alerteJauge).toMatchObject({ jauge: "Amour", deja: true, montures: [0, 1], quandMs: null, revientMs: null });
    expect(texte(v)).toBe(
      "L’Amour ne monte pour aucune de tes montures en ce moment : leur sérénité est négative (l’Amour ne monte qu’en sérénité positive, 0 compris).",
    );
    expect(texte(vueEnclos(enclos([-500, 100], null, 0, "Amour"), 0, T0))).toBe(
      "L’Amour ne monte pas pour la monture 1 en ce moment : sa sérénité est négative (l’Amour ne monte qu’en sérénité positive, 0 compris).",
    );
  });

  it("montures négatives remontées par Sérénité + : l'Amour reprendra, avec l'heure", () => {
    const v = vueEnclos(enclos([-500, -100], "+", 60000, "Amour"), 0, T0);
    expect(v.alerteJauge).toMatchObject({ deja: true, montures: [0, 1] });
    expect(texte(v)).toMatch(/L’Amour reprendra vers 21 h 08\.$/);
  });

  it("même heure que le retour (objectif Amour) : l'heure n'est pas répétée", () => {
    const e = { ...enclos([3400, 2900, 2500], "-", 60000, "Amour", 120000), objectif: "amour" as const };
    const v = vueEnclos(e, 0, T0);
    expect(v.retour?.evenement.type).toBe("sortieZone");
    expect(v.alerteJauge).toMatchObject({ surRetour: true, quandMs: v.retour!.quandMs, montures: [2], suivantes: [0, 1] });
    expect(texte(v)).toMatch(/^À l’heure de retour, l’Amour ne montera plus pour la monture 3 : sa sérénité deviendra négative/);
    expect(texte(v)).not.toMatch(/\d\d h \d\d/);
  });

  it("Maturité : sortie de −2 000 à +2 000 signalée", () => {
    expect(texte(vueEnclos(enclos([1500], "+", 60000, "Maturité"), 0, T0))).toBe(
      "À partir de 21 h 08, la Maturité ne montera plus pour la monture 1 : sa sérénité sortira de −2 000 à +2 000 (la Maturité ne monte qu’entre −2 000 et +2 000).",
    );
  });

  it("pas d'alerte : montures dans la plage jusqu'au bout, jauge vide avant, XP, jauge vide, pas de saisie", () => {
    expect(vueEnclos(enclos([-3000, -2000], "-", 60000, "Endurance"), 0, T0).alerteJauge).toBeNull();
    /* la jauge Endurance (1 000 points ≈ 17 min) est vide avant que la monture passe en positif (≈ 33 min) */
    expect(vueEnclos(enclos([-2000], "+", 60000, "Endurance", 1000), 0, T0).alerteJauge).toBeNull();
    expect(vueEnclos(enclos([-2000], "+", 60000, "Expérience de monture"), 0, T0).alerteJauge).toBeNull();
    expect(vueEnclos(enclos([2000], null, 0, "Endurance", 0), 0, T0).alerteJauge).toBeNull();
    /* la monture 1 est en Endurance : la jauge se vide (1 000 s), plus d'alerte pour la monture 2 ensuite (#73) */
    expect(vueEnclos(enclos([-3000, 2000], null, 0, "Endurance", 1000), 0, T0 + 3 * 3600_000).alerteJauge).toBeNull();
    expect(vueEnclos({ ...enclos([2000], null, 0, "Endurance"), saisieLe: null }, 0, T0).alerteJauge).toBeNull();
  });

  it("l'alerte parle de temps perdu, jamais de carburant ni de note de développeur", () => {
    const v = vueEnclos(enclos([-3200, -2400], "+", 150000, "Endurance", 90000), 0, T0);
    expect(texte(v)).not.toMatch(/carburant|gaspill|vérifier/);
  });
});

describe("jauge Endurance / Amour / Maturité en pause hors plage (#73)", () => {
  const S = 1000;
  const enclos = (serenites: number[], sens: "+" | "-" | null, niveau: number, autreJauge: string, niveauAutre: number) =>
    enclosSchema.parse({
      nom: "A",
      montures: serenites.map((serenite) => ({ serenite })),
      jaugeSerenite: sens,
      niveauSerenite: niveau,
      autreJauge,
      niveauAutre,
      saisieLe: T0,
    });
  const ligne = (e: ReturnType<typeof enclos>, t: number) => ss(texteAutreJauge(e.autreJauge!, consoAutreJauge(e, t)!, t));

  /* −2 000 en Sérénité + (tier 1, 1 pt/s) : sort de l'Endurance (atteint −1) après 1 999 s, soit 21 h 33 */
  const sortie = enclos([-2000], "+", 60000, "Endurance", 90000);

  it("issue : les montures sortent de la plage à t1 et n'y reviennent pas → la jauge ne se vide plus après t1", () => {
    const avant = consoAutreJauge(sortie, T0)!;
    expect(avant).toMatchObject({ videMs: null, enPause: false, pauseMs: T0 + 1999 * S, niveau: 90000 });
    expect(ligne(sortie, T0)).toBe("Jauge Endurance en pause à partir de 21 h 33 : plus aucune monture en sérénité négative.");
    /* avant #73 : vide 85 000 s après la saisie, sans arrêt */
    expect(vueEnclos(sortie, 0, T0).autreVideMs).toBeNull();
    const niveauT1 = 90000 - pointsConsommes(90000, 1999);
    for (const t of [3600, 3 * 3600, 48 * 3600]) {
      const c = consoAutreJauge(sortie, T0 + t * S)!;
      expect(c).toMatchObject({ enPause: true, pauseMs: T0 + 1999 * S, repriseMs: null, videMs: null });
      expect(c.niveau).toBe(niveauT1);
    }
    expect(niveauT1).toBe(86002);
    expect(ligne(sortie, T0 + 3600 * S)).toBe("Jauge Endurance en pause depuis 21 h 33 : aucune monture en sérénité négative.");
  });

  it("la carte reçoit la consommation via vueEnclos", () => {
    const v = vueEnclos(sortie, 0, T0 + 3600 * S);
    expect(v.consoAutre).toEqual(consoAutreJauge(sortie, T0 + 3600 * S));
    expect(vueEnclos(enclosTest([0], 1000), 0, T0).consoAutre).toBeNull();
    expect(vueEnclos({ ...sortie, saisieLe: null }, 0, T0).consoAutre).toBeNull();
  });

  it("une monture reste dans la plage, une autre en sort : la jauge continue de se vider", () => {
    /* la jauge de sérénité (2 500 points) est vide avant que −4 000 atteigne −1 ; −2 000 sort à 1 999 s */
    const e = enclos([-4000, -2000], "+", 2500, "Endurance", 3600);
    expect(vueEnclos(e, 0, T0).autreVideMs).toBe(T0 + 3600 * S);
    const c = consoAutreJauge(e, T0 + 2400 * S)!;
    expect(c).toMatchObject({ enPause: false, niveau: 3600 - 2400 });
    expect(ligne(e, T0)).toBe("Jauge Endurance vide à 22 h 00");
  });

  it("déjà hors plage à la saisie, puis retour dans la plage : en pause, reprise, « vide à » recalculé", () => {
    /* −500 remonté par Sérénité + : entre en Amour (0) après 500 s, 21 h 08 ; 3 600 s de jauge → vide 22 h 08 */
    const e = enclos([-500], "+", 60000, "Amour", 3600);
    expect(consoAutreJauge(e, T0)).toMatchObject({ enPause: true, pauseMs: null, repriseMs: T0 + 500 * S, videMs: T0 + 4100 * S, niveau: 3600 });
    expect(ligne(e, T0)).toBe("Jauge Amour en pause : aucune monture en sérénité positive (0 compris). Elle reprend vers 21 h 08 et sera vide à 22 h 08.");
    expect(consoAutreJauge(e, T0 + 600 * S)).toMatchObject({ enPause: false, niveau: 3500 });
    expect(ligne(e, T0 + 600 * S)).toBe("Jauge Amour vide à 22 h 08");
  });

  it("pause au milieu : la Maturité s'arrête entre deux montures puis reprend", () => {
    /* Sérénité + (1 pt/s) : +1 000 sort de la Maturité à 1 000 s ; −5 000 y entre à 3 000 s, en sort à 7 000 s */
    const e = enclos([1000, -5000], "+", 60000, "Maturité", 3000);
    const c = consoAutreJauge(e, T0 + 2000 * S)!;
    expect(c).toMatchObject({ enPause: true, pauseMs: T0 + 1000 * S, repriseMs: T0 + 3000 * S, videMs: T0 + 5000 * S, niveau: 2000 });
    expect(ligne(e, T0 + 2000 * S)).toBe(
      "Jauge Maturité en pause depuis 21 h 16 : aucune monture entre −2 000 et +2 000. Elle reprend vers 21 h 50 et sera vide à 22 h 23.",
    );
    expect(consoAutreJauge(e, T0 + 4000 * S)).toMatchObject({ enPause: false, niveau: 1000 });
    expect(consoAutreJauge(e, T0 + 6000 * S)).toMatchObject({ enPause: false, niveau: 0 });
  });

  it("les tiers comptent : la vitesse dépend du niveau restant, pas du temps écoulé", () => {
    /* 90 000 : 10 000 points en tier 2 (2 pts/s, 5 000 s) puis tier 1 ; pause de 2 000 s au milieu */
    const e = enclos([1000, -5000], "+", 60000, "Maturité", 90000);
    /* 1 000 s actives (2 000 points), pause, reprise à 3 000 s : les 8 000 points restants du tier 2 prennent 4 000 s */
    expect(consoAutreJauge(e, T0 + 2000 * S)!.niveau).toBe(88000);
    expect(consoAutreJauge(e, T0 + 7000 * S)!.niveau).toBe(80000);
  });

  it("Expérience de monture : ne dépend pas de la sérénité, se vide sans arrêt", () => {
    const e = enclos([5000, -5000], null, 0, "Expérience de monture", 3600);
    expect(consoAutreJauge(e, T0 + 600 * S)).toMatchObject({ enPause: false, videMs: T0 + 3600 * S, niveau: 3000 });
    expect(ligne(e, T0)).toBe("Jauge Expérience de monture vide à 22 h 00");
  });

  it("jauge vide : ni pause ni reprise", () => {
    const e = enclos([-3000], null, 0, "Endurance", 0);
    expect(consoAutreJauge(e, T0 + 60 * S)).toMatchObject({ enPause: false, videMs: T0, niveau: 0 });
  });

  it("alerte #63 : sa fenêtre va jusqu'à la nouvelle heure « vide » (pauses comprises)", () => {
    /* sans pause, la jauge Maturité (6 000) serait vide à 6 000 s, avant la sortie de −5 000 (7 000 s) : la monture 2
       n'était pas annoncée. Avec la pause 1 000 → 3 000 s, il ne reste que 5 000 s actives : la jauge n'est jamais
       vide, la monture 2 sortira avant */
    const e = enclos([1000, -5000], "+", 60000, "Maturité", 6000);
    const v = vueEnclos(e, 0, T0);
    expect(v.autreVideMs).toBeNull();
    expect(v.consoAutre).toMatchObject({ enPause: false, pauseMs: T0 + 7000 * S });
    /* une jauge plus courte (4 500) est vide à 6 500 s (avant : 4 500 s) */
    expect(vueEnclos(enclos([1000, -5000], "+", 60000, "Maturité", 4500), 0, T0).autreVideMs).toBe(T0 + 6500 * S);
    /* à 6 500 s, l'ancienne heure (6 000 s) est passée : l'alerte disparaissait ; la jauge a encore du carburant */
    expect(vueEnclos(e, 0, T0 + 6500 * S).alerteJauge).toMatchObject({ deja: true, montures: [0], quandMs: T0 + 1000 * S });
    const tard = vueEnclos(e, 0, T0 + 7200 * S);
    expect(tard.alerteJauge).toMatchObject({ deja: true, montures: [0, 1], quandMs: T0 + 7000 * S });
    /* pause définitive : l'alerte reste tant que la jauge a du carburant */
    expect(vueEnclos(sortie, 0, T0 + 48 * 3600 * S).alerteJauge).toMatchObject({ deja: true, quandMs: T0 + 1999 * S });
  });

  it("brouillon de ressaisie : l'autre jauge repart du niveau estimé, sans compter la pause", () => {
    const t = T0 + 3600 * S;
    expect(brouillonDe(sortie, vueEnclos(sortie, 0, t).plan.etat).niveauAutre).toBe("86002");
    const m = enclos([1000, -5000], "+", 60000, "Maturité", 3000);
    expect(brouillonDe(m, vueEnclos(m, 0, T0 + 2000 * S).plan.etat).niveauAutre).toBe("2000");
  });
});

describe("enclos de démo cohérents (#63)", () => {
  const vues = demoData(T0).enclos.slice(0, 3).map((e, i) => ({ e, v: vueEnclos(e, i, T0) }));

  it("chaque jauge d'élevage a l'objectif de sa plage", () => {
    expect(vues.map(({ e }) => [e.autreJauge, e.objectif])).toEqual([
      ["Endurance", "endurance"],
      ["Amour", "amour"],
      ["Maturité", "maturite"],
    ]);
  });

  it("Endurance et Maturité : la jauge monte jusqu'au bout ; Amour : l'alerte montre une monture qui va passer en négatif", () => {
    expect(vues[0].v.alerteJauge).toBeNull();
    expect(vues[0].v.retour).not.toBeNull();
    expect(vues[0].v.plan.etat.serenites.every((s) => s < 0)).toBe(true);
    expect(vues[1].v.alerteJauge).toMatchObject({ jauge: "Amour", deja: false, surRetour: true });
    expect(vues[1].v.plan.etat.serenites.every((s) => s >= 0)).toBe(true);
    expect(vues[2].v.alerteJauge).toBeNull();
  });
});

describe("retour en retard et état saisi déjà au bord (#64)", () => {
  const S = 1000;
  const enclos = (serenites: number[], sens: "+" | "-" | null, niveau: number, objectif = "aucun", nom = "Tardif") =>
    enclosSchema.parse({ nom, montures: serenites.map((serenite) => ({ serenite })), jaugeSerenite: sens, niveauSerenite: niveau, saisieLe: T0, objectif });
  /* l'issue : le joueur arrive en retard et saisit ce qu'il voit */
  const tardif = enclos([5000, 4800, 5000], "+", 160000);
  const CONSEIL_TARDIF = "Passe sur la jauge Sérénité − et mets 9 800 points au total : c'est le maximum avant qu'une monture atteigne −5 000.";

  it("seuil : une minute", () => {
    expect(SEUIL_A_FAIRE_MAINTENANT_S).toBe(60);
  });

  it("Tardif : pas de « retour dépassé depuis 1 s », à faire maintenant avec le conseil de jauge opposée", () => {
    for (const t of [0, 1, 60, 3600]) {
      const v = vueEnclos(tardif, 0, T0 + t * S);
      expect(v.retour).toMatchObject({ evenement: { type: "premiereBorne" }, quandMs: T0 });
      expect(v.aFaireMaintenant).toBe(true);
      expect(v.retardS).toBeNull();
      expect(estUrgent(v, T0 + t * S)).toBe(true);
      expect(ss(raisonRetour(v, T0 + t * S)!)).toBe("la jauge Sérénité + pousse la monture 1 à +5 000");
      expect(ss(v.conseil!)).toMatch(/^Passe sur la jauge Sérénité − et mets [\d ]+ points au total/);
    }
    const v = vueEnclos(tardif, 0, T0);
    expect(ss(v.conseil!)).toBe(CONSEIL_TARDIF);
    expect(ss(CONSEIL_MAINTENANT)).toMatch(/^Ensuite, clique « Je quitte l’enclos »/);
    expect(CONSEIL_MAINTENANT).not.toMatch(/Retourne/);
    /* l'alerte ne dit pas « si tu ne reviens pas » au joueur qui est sur place */
    expect(alerteSurRetour(v)).toBe(true);
    expect(ss(texteAlerte(v.alerte!, T0, true, true))).toBe("jusqu’à 160 000 points de jauge seront gaspillés pour elle si rien ne change.");
    const tard = vueEnclos(tardif, 0, T0 + 600 * S);
    expect(ss(texteAlerte(tard.alerte!, T0 + 600 * S, true, true))).toMatch(/^[\d ]+ points de jauge déjà gaspillés pour elle, jusqu’à 160 000 si rien ne change\.$/);
  });

  it("Tardif : annonce après « Enregistrer » sans heure de retour dans le passé", () => {
    const v = vueEnclos(tardif, 0, T0);
    expect(ss(annonceEnregistre(v, "Tardif", T0))).toBe(`Tardif enregistré : à faire maintenant. ${CONSEIL_TARDIF}`);
    expect(annonceEnregistre(v, "Tardif", T0)).not.toMatch(/reviens avant/);
  });

  it("Tardif : en tête du tri par urgence, devant un retour à venir", () => {
    const liste = defaultEnclos();
    liste[0] = enclos([-3000], "+", 200000, "aucun", "À venir");
    liste[4] = tardif;
    expect(enclosUrgents(liste, T0).map((x) => x.index)).toEqual([4, 0]);
  });

  it("seuil d'une minute : 59 s → à faire maintenant ; 60 s et 61 s → heure de retour, puis vrai retard", () => {
    /* tier 1 (1 pt/s) : +4 941 atteint +5 000 en 59 s */
    expect(vueEnclos(enclos([4941], "+", 50000), 0, T0).aFaireMaintenant).toBe(true);
    for (const s of [4940, 4939]) {
      const e = enclos([s], "+", 50000);
      const v = vueEnclos(e, 0, T0);
      expect(v.aFaireMaintenant).toBe(false);
      expect(v.retardS).toBeNull();
      expect(ss(raisonRetour(v, T0)!)).toBe("une monture atteint ±5 000");
      expect(vueEnclos(e, 0, v.retour!.quandMs + S).retardS).toBe(1);
    }
  });

  it("monture déjà hors de la zone, la jauge l'en éloigne : à faire maintenant (au lieu d'attendre ±5 000)", () => {
    const v = vueEnclos(enclos([3000], "+", 50000, "maturite"), 0, T0);
    expect(v.retour).toMatchObject({ evenement: { type: "sortieZone", points: 0, monture: 0 }, quandMs: T0 });
    expect(v.aFaireMaintenant).toBe(true);
    expect(ss(raisonRetour(v, T0)!)).toBe("la jauge Sérénité + fait sortir la monture 1 de la zone Maturité");
    expect(ss(v.conseil!)).toBe("Passe sur la jauge Sérénité − et mets 3 000 points au total pour recentrer tes montures dans la zone Maturité.");
    /* Endurance : une monture à 0 en Sérénité + ; Amour : une monture à −300 en Sérénité − */
    expect(vueEnclos(enclos([-3000, 0], "+", 50000, "endurance"), 0, T0).aFaireMaintenant).toBe(true);
    const amour = vueEnclos(enclos([2000, -300], "-", 50000, "amour"), 0, T0);
    expect(amour.aFaireMaintenant).toBe(true);
    expect(ss(raisonRetour(amour, T0)!)).toBe("la jauge Sérénité − fait sortir la monture 2 de la zone Amour (sérénité positive)");
    expect(ss(amour.conseil!)).toMatch(/^Passe sur la jauge Sérénité \+ et mets [\d ]+ points au total pour recentrer tes montures dans la zone Amour/);
  });

  it("pas « à faire maintenant » : monture hors zone que la jauge y ramène, sans jauge, jauge presque vide", () => {
    expect(vueEnclos(enclos([-3000], "+", 50000, "maturite"), 0, T0).aFaireMaintenant).toBe(false);
    expect(vueEnclos(enclos([3000], null, 0, "maturite"), 0, T0).aFaireMaintenant).toBe(false);
    expect(vueEnclos(enclos([3000], "+", 0, "maturite"), 0, T0).aFaireMaintenant).toBe(false);
    /* 30 points : jauge vide en 30 s, aucun tort pour les montures */
    const presqueVide = vueEnclos(enclos([0], "+", 30), 0, T0);
    expect(presqueVide.retour?.evenement.type).toBe("jaugeVide");
    expect(presqueVide.aFaireMaintenant).toBe(false);
    /* Amour en Sérénité + : la borne +5 000 reste l'événement */
    expect(vueEnclos(enclos([4000], "+", 50000, "amour"), 0, T0).aFaireMaintenant).toBe(false);
  });

  it("retour dépassé, jauge vidée : conseil « Maintenant » calculé sur l'état estimé (zone), sans « pas besoin de revenir »", () => {
    /* −4 000 et 3 000 points : jauge vide à 21 h 50 à −1 000 ; 1 000 points de Sérénité + la recentrent dans la Maturité */
    const v = vueEnclos(enclos([-4000], "+", 3000, "maturite"), 0, T0 + 2 * 3600 * S);
    expect(v.retardS).not.toBeNull();
    expect(ss(v.conseil!)).toBe("Maintenant : mets 1 000 points au total dans la jauge Sérénité +.");
    const sansZone = vueEnclos(enclos([-4000], "+", 3000), 0, T0 + 2 * 3600 * S);
    expect(sansZone.conseil).toBeNull();
  });
});

describe("aperçu de la saisie dans le formulaire (#64)", () => {
  const brouillon = (p: Partial<Parameters<typeof apercuSaisie>[0]> = {}) => ({
    nom: "Tardif",
    serenites: ["5000", "4800", "5000"],
    sens: "+" as const,
    niveau: "160k",
    autre: null,
    niveauAutre: "",
    objectif: "aucun" as const,
    ...p,
  });

  it("brouillon incomplet ou illisible : aperçu neutre, sans message d'erreur", () => {
    for (const b of [brouillon({ serenites: [""] }), brouillon({ serenites: ["abc"] }), brouillon({ niveau: "" }), brouillon({ serenites: ["-"] })]) {
      const a = apercuSaisie(b, T0);
      expect(a).toBe(APERCU_NEUTRE);
      expect(a.titre).not.toMatch(/nombre|invalide|indique/i);
    }
  });

  it("Tardif tel que vu en arrivant : à faire maintenant, conseil de jauge opposée", () => {
    const a = apercuSaisie(brouillon(), T0);
    expect(ss(a.titre)).toBe("Avec cette saisie : à faire maintenant.");
    expect(ss(a.conseil!)).toBe("Passe sur la jauge Sérénité − et mets 9 800 points au total : c'est le maximum avant qu'une monture atteigne −5 000.");
  });

  it("le joueur suit le conseil (Sérénité −, 9 800) : l'heure de retour s'affiche avant d'enregistrer", () => {
    /* 9 800 points en tier 1 : 2 h 43 min 20 s */
    const a = apercuSaisie(brouillon({ sens: "-", niveau: "9800" }), T0);
    expect(ss(a.titre)).toBe("Avec cette saisie : reviens avant 23 h 43.");
    expect(a.conseil ?? "").not.toMatch(/pas besoin de revenir/);
  });

  it("l'aperçu suit l'objectif du brouillon", () => {
    const b = brouillon({ serenites: ["3000"], niveau: "50000" });
    expect(ss(apercuSaisie({ ...b, objectif: "maturite" }, T0).titre)).toBe("Avec cette saisie : à faire maintenant.");
    expect(ss(apercuSaisie({ ...b, objectif: "maturite" }, T0).conseil!)).toMatch(/zone Maturité/);
    expect(ss(apercuSaisie(b, T0).titre)).toMatch(/^Avec cette saisie : reviens avant \d\d h \d\d\.$/);
    expect(ss(apercuSaisie(b, T0).conseil!)).toMatch(/^À ton retour : /);
  });

  it("sans jauge de sérénité : pas d'heure de retour à prévoir", () => {
    expect(ss(apercuSaisie(brouillon({ sens: null, niveau: "" }), T0).titre)).toBe("Avec cette saisie : pas d’heure de retour à prévoir.");
  });
});

describe("tournée : regrouper les retours rapprochés (#65)", () => {
  const retour = (quandMs: number) => ({ quandMs, evenement: { type: "premiereBorne" } }) as unknown as RetourEnclos;
  const vueT = (index: number, quand: number | null, extra: Record<string, unknown> = {}) => ({
    index,
    retour: quand === null ? null : retour(quand),
    retardS: null as number | null,
    aFaireMaintenant: false,
    ...extra,
  });
  const T = new Date(2026, 10, 20, 19, 30, 0).getTime();
  const h = (hh: number, mm: number) => new Date(2026, 10, 20, hh, mm, 0).getTime();

  it("cas de l'issue : 20 h 00 / 20 h 08 / 20 h 13 / 20 h 31, fenêtre 15 min → « 20 h 00 : 3 enclos », le 4e à part", () => {
    const vues = [vueT(0, h(20, 31)), vueT(1, h(20, 0)), vueT(2, h(20, 13)), vueT(3, h(20, 8))];
    const t = grouperTournees(vues, T, 15);
    expect(t).toHaveLength(2);
    expect(ss(formatHeure(t[0].debutMs, T))).toBe("20 h 00");
    expect(t[0].membres.map((v) => v.index)).toEqual([1, 3, 2]);
    expect(t[0].immediat).toBe(false);
    expect(t[1].membres.map((v) => v.index)).toEqual([0]);
    expect(FENETRE_TOURNEE_MIN).toBe(15);
  });

  it("la fenêtre part du plus urgent (pas de chaîne) : 20 h 00, 20 h 10, 20 h 20 → 2 tournées", () => {
    const t = grouperTournees([vueT(0, h(20, 0)), vueT(1, h(20, 10)), vueT(2, h(20, 20))], T, 15);
    expect(t.map((x) => x.membres.length)).toEqual([2, 1]);
  });

  it("borne incluse (15 min pile), exclue à 16 min ; fenêtre 0 : seuls les retours simultanés se groupent", () => {
    expect(grouperTournees([vueT(0, h(20, 0)), vueT(1, h(20, 15))], T, 15)).toHaveLength(1);
    expect(grouperTournees([vueT(0, h(20, 0)), vueT(1, h(20, 16))], T, 15)).toHaveLength(2);
    expect(grouperTournees([vueT(0, h(20, 0)), vueT(1, h(20, 0)), vueT(2, h(20, 1))], T, 0).map((x) => x.membres.length)).toEqual([2, 1]);
  });

  it("sans heure de retour : ignoré ; liste vide : aucune tournée ; une seule : tournée d'un enclos", () => {
    expect(grouperTournees([vueT(0, null)], T)).toEqual([]);
    expect(grouperTournees([], T)).toEqual([]);
    expect(grouperTournees([vueT(0, null), vueT(1, h(20, 0))], T)[0].membres).toHaveLength(1);
  });

  it("à faire maintenant ou en retard : l'heure est maintenant, la tournée est immédiate et attire les retours proches", () => {
    const vues = [vueT(0, h(19, 0), { retardS: 1800 }), vueT(1, h(19, 40)), vueT(2, h(19, 50)), vueT(3, h(20, 5), { aFaireMaintenant: false })];
    const t = grouperTournees(vues, T, 15);
    expect(t[0].immediat).toBe(true);
    expect(t[0].debutMs).toBe(T);
    expect(t[0].membres.map((v) => v.index)).toEqual([0, 1]);
    expect(t[1].membres.map((v) => v.index)).toEqual([2, 3]);
    const m = grouperTournees([vueT(0, T - 10_000, { aFaireMaintenant: true }), vueT(1, T + 5 * 60_000)], T);
    expect(m[0].immediat).toBe(true);
    expect(m[0].membres).toHaveLength(2);
  });

  it("ne modifie pas la liste d'entrée", () => {
    const vues = [vueT(0, h(20, 31)), vueT(1, h(20, 0))];
    grouperTournees(vues, T);
    expect(vues.map((v) => v.index)).toEqual([0, 1]);
  });

  it("cleTournee change avec la composition, l'heure d'un retour ou la marge", () => {
    const a = grouperTournees([vueT(0, h(20, 0)), vueT(1, h(20, 8))], T)[0];
    const memeAvecAutreHeure = grouperTournees([vueT(0, h(20, 0)), vueT(1, h(20, 9))], T)[0];
    const plusUn = grouperTournees([vueT(0, h(20, 0)), vueT(1, h(20, 8)), vueT(2, h(20, 10))], T)[0];
    expect(cleTournee(a, 5)).toBe(cleTournee(grouperTournees([vueT(1, h(20, 8)), vueT(0, h(20, 0))], T + 1000)[0], 5));
    expect(cleTournee(a, 5)).not.toBe(cleTournee(a, 10));
    expect(cleTournee(a, 5)).not.toBe(cleTournee(memeAvecAutreHeure, 5));
    expect(cleTournee(a, 5)).not.toBe(cleTournee(plusUn, 5));
  });

  it("evenementTournee : un seul événement, heure = premier retour − marge, description listant les enclos", () => {
    const vues = [
      { ...vueT(0, h(20, 0)), conseil: "Remplis la jauge." },
      { ...vueT(1, h(20, 8)), conseil: null },
    ] as unknown as VueEnclos[];
    const t = grouperTournees(vues, T)[0];
    const e = evenementTournee(t, (v) => `Enclos ${v.index + 1}`, 5, T)!;
    expect(e.debutMs).toBe(h(19, 55));
    expect(ss(e.titre)).toBe("Tournée des enclos : passe avant 20 h 00");
    expect(ss(e.description!)).toBe("2 enclos à revoir dans la foulée :\nEnclos 1 : avant 20 h 00. Remplis la jauge.\nEnclos 2 : avant 20 h 08.");
    expect(e.dureeMin).toBe(13);
    expect(e.uid).toBe("tournee@dragodindes-elevage");
    const immediat = grouperTournees([{ ...vues[0], retardS: 60 }, vues[1]] as unknown as VueEnclos[], T)[0];
    expect(evenementTournee(immediat, () => "x", 5, T)).toBeNull();
  });
});

describe("enclos pas plein (#79) : la jauge consomme autant avec 10 montures", () => {
  it("2 à 9 montures avec une jauge active : la ligne, au singulier pour une seule monture", () => {
    expect(texteEnclosPasPlein(enclosTest([0, 0, 0, 0], 100))).toBe(
      "4 montures sur 10 : la jauge consomme autant qu'avec 10. Remplis l'enclos pour ne pas gaspiller de carburant.",
    );
    expect(texteEnclosPasPlein(enclosTest([0, 0], 100))).toMatch(/^2 montures sur 10 : /);
    expect(texteEnclosPasPlein(enclosTest([0], 100))).toMatch(/^1 monture sur 10 : /);
    expect(texteEnclosPasPlein(enclosTest([0, 0, 0, 0, 0, 0, 0, 0, 0], 100))).toMatch(/^9 montures sur 10 : /);
  });

  it("10 montures ou plus : aucune ligne", () => {
    expect(texteEnclosPasPlein(enclosTest(Array(10).fill(0), 100))).toBeNull();
  });

  it("sans jauge active (aucune, ou niveau à 0) : aucune ligne", () => {
    expect(texteEnclosPasPlein(enclosTest([0, 0], 100, null))).toBeNull();
    expect(texteEnclosPasPlein(enclosTest([0, 0], 0))).toBeNull();
  });

  it("une autre jauge active suffit ; une autre jauge à 0 ne compte pas", () => {
    const avecAutre = enclosSchema.parse({
      montures: [{ serenite: 0 }, { serenite: 0 }],
      autreJauge: "Amour",
      niveauAutre: 50,
      saisieLe: T0,
    });
    expect(texteEnclosPasPlein(avecAutre)).toMatch(/^2 montures sur 10 : /);
    const autreVide = enclosSchema.parse({ montures: [{ serenite: 0 }], autreJauge: "Amour", niveauAutre: 0, saisieLe: T0 });
    expect(texteEnclosPasPlein(autreVide)).toBeNull();
  });

  it("enclos non saisi : aucune ligne", () => {
    expect(texteEnclosPasPlein(enclosSchema.parse({ montures: [{ serenite: 0 }], jaugeSerenite: "+", niveauSerenite: 100 }))).toBeNull();
  });
});

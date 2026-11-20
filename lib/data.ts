/* =====================================================================
   DONNÉES — élevage DOFUS Unity 3.7 (mise à jour du 6 octobre 2026)
   Dernier correctif officiel vu : 3.7.13.17 (2 novembre 2026). Aucune 3.8 trouvée au 20/11/2026.
   Sources des constantes (recoupées) : notes de la 3.7 relayées par Dofus pour les Noobs
   (« Mise à jour 3.7 » + Guide de l'éleveur MàJ 13/10/2026), Duffus, Sigilos (guide MàJ 29/10/2026),
   JeuxEnd (patch notes 3.7). Notes officielles dofus.com (forum) non lisibles en automatique (403).
   Les valeurs en kamas ne sont PAS dans ce fichier : aucun prix fiable
   n'existe publiquement, tu les saisis toi-même dans l'onglet Rentabilité.
   Portage de legacy/data.js : valeurs identiques, aucune correction.
   ===================================================================== */

/* Constantes uniques — à modifier ICI à chaque nouvelle version du jeu. */
export const VERSION_JEU = "3.7" as const; // DOFUS Unity 3.7, sortie 6 octobre 2026 (3.5 : 3 mars 2026)
export const CAPACITE_JAUGE = 200000; // 3.5 : 100 000 ; 3.7 : doublée (Noobs, Duffus, Sigilos, JeuxEnd)
export const VITESSE_MULT = 1; // vitesse des tiers : 1 en 3.5 ET en 3.7 (10/20/30/40 pts par 10 s inchangés ; Noobs + Duffus)

export const SERVEURS = [
  { id: "Draconiros", type: "Monocompte (abonnement requis)", note: "Seul serveur monocompte. Prix plus fluctuants, ressources très disputées (galets, pépites, roses des sables). Moins de comptes = moins d'offre de montures, mais aussi moins de concurrence sur la vente." },
  { id: "Tal Kasha", type: "Classique (multicompte)", note: "Communauté internationale plus fournie. Économie qui tend vers les standards des autres serveurs." },
  { id: "Orukam", type: "Classique (multicompte)", note: "Aucune info spécifique trouvée." },
  { id: "Tylezia", type: "Classique (multicompte)", note: "Aucune info spécifique trouvée." },
  { id: "Hell Mina", type: "Classique (multicompte)", note: "Aucune info spécifique trouvée." },
  { id: "Imagiro", type: "Classique (multicompte)", note: "Serveur proposé par défaut aux débutants : probablement la plus grosse population, donc marché plus liquide." },
  { id: "Ombre", type: "Épique (mort définitive en PvM)", note: "Mort définitive en PvM : les dragodindes sauvages sont niveau 60-70 (~900 PV), mais une mort = perso perdu. Marché plus petit, farm à faire prudemment." },
] as const;

/* Générations 1 à 10 — couleurs / croisements (Guidactik). Neurones d'extraction = génération. */
export const GENERATIONS = [
  { gen: 1, sauvage: true, couleurs: ["Amande", "Rousse", "Dorée"] },
  { gen: 2, couleurs: ["Amande et Rousse", "Amande et Dorée", "Dorée et Rousse"] },
  { gen: 3, couleurs: ["Indigo", "Ébène"] },
  { gen: 4, couleurs: ["Amande et Indigo", "Amande et Ébène", "Ébène et Indigo", "Ébène et Rousse", "Dorée et Ébène", "Dorée et Indigo", "Indigo et Rousse"] },
  { gen: 5, couleurs: ["Orchidée", "Pourpre"] },
  { gen: 6, couleurs: ["Ébène et Orchidée", "Ébène et Pourpre", "Indigo et Pourpre", "Indigo et Orchidée", "Orchidée et Rousse", "Orchidée et Pourpre", "Dorée et Pourpre", "Dorée et Orchidée", "Pourpre et Rousse", "Amande et Pourpre", "Amande et Orchidée"] },
  { gen: 7, couleurs: ["Ivoire", "Turquoise"] },
  { gen: 8, couleurs: ["Indigo et Ivoire", "Indigo et Turquoise", "Ivoire et Orchidée", "Ivoire et Pourpre", "Ivoire et Rousse", "Ivoire et Turquoise", "Turquoise et Rousse", "Turquoise et Orchidée", "Turquoise et Pourpre", "Amande et Ivoire", "Amande et Turquoise", "Dorée et Turquoise", "Dorée et Ivoire", "Ébène et Ivoire", "Ébène et Turquoise"] },
  { gen: 9, couleurs: ["Prune", "Émeraude"] },
  { gen: 10, couleurs: ["Prune et Ivoire", "Prune et Pourpre", "Prune et Dorée", "Prune et Amande", "Prune et Orchidée", "Prune et Indigo", "Prune et Ébène", "Prune et Turquoise", "Prune et Émeraude", "Prune et Rousse", "Émeraude et Indigo", "Émeraude et Rousse", "Émeraude et Turquoise", "Émeraude et Pourpre", "Émeraude et Orchidée", "Émeraude et Ivoire", "Ébène et Émeraude", "Dorée et Émeraude", "Amande et Émeraude"] },
] as const;

/* Génétons gagnés par parent selon sa génération */
export const GENETONS: Readonly<Record<number, number>> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 15, 6: 30, 7: 60, 8: 120, 9: 250, 10: 0 };

/* Jauge d'enclos : tiers et durée de vidage (capacité CAPACITE_JAUGE ; seuils 3.7 doublés par rapport à la 3.5).
   Durées = taille du tier / vitesse (Noobs : 22 h 13, 8 h 19, 3 h 42, 1 h 23 ; total ≈ 35 h 37). */
export const TIERS = [
  { tier: 1, plage: "0 – 80 000", min: 0, max: 80000, duree: "22 h 13", xpS: 1 * VITESSE_MULT },
  { tier: 2, plage: "80 001 – 140 000", min: 80001, max: 140000, duree: "8 h 19", xpS: 2 * VITESSE_MULT },
  { tier: 3, plage: "140 001 – 180 000", min: 140001, max: 180000, duree: "3 h 42", xpS: 3 * VITESSE_MULT },
  { tier: 4, plage: "180 001 – 200 000", min: 180001, max: CAPACITE_JAUGE, duree: "1 h 23", xpS: 4 * VITESSE_MULT },
] as const;

/* Niveau de métier et prix en poussière inchangés depuis la 3.5 ; durabilité des carburants doublée en 3.7 (Minuscule 2 000 … Gigantesque 10 000). */
export const CARBURANTS = [
  { nom: "Extrait", tierMax: "1 (80 000)", metier: 5, poussiere: 50 },
  { nom: "Philtre", tierMax: "2 (140 000)", metier: 55, poussiere: 200 },
  { nom: "Potion", tierMax: "3 (180 000)", metier: 105, poussiere: 800 },
  { nom: "Élixir", tierMax: "4 (200 000)", metier: 155, poussiere: 3200 },
] as const;

/* Jauges de l'enclos, noms de la 3.7 (correspondance avec les anciens noms : onglet Sources).
   Sérénité + et Sérénité − sont liées : une seule des deux est active à la fois.
   2 jauges actives au maximum, toutes catégories confondues. */
export const JAUGES = [
  { nom: "Sérénité −", effet: "Fait baisser la sérénité. Liée à Sérénité + : une seule des deux est active." },
  { nom: "Sérénité +", effet: "Fait monter la sérénité. Liée à Sérénité − : une seule des deux est active." },
  { nom: "Endurance", effet: "Monte l'Endurance (sérénité négative)." },
  { nom: "Maturité", effet: "Monte la Maturité (sérénité entre -2 000 et 2 000)." },
  { nom: "Amour", effet: "Monte l'Amour (sérénité positive)." },
  { nom: "Expérience de monture", effet: "Donne de l'XP à la monture." },
] as const;

export const ENCLOS_METIER = [
  { niveau: 1, label: "Débutant" },
  { niveau: 40, label: "Novice" },
  { niveau: 80, label: "Apprenti" },
  { niveau: 120, label: "Initié" },
  { niveau: 160, label: "Vétéran" },
  { niveau: 200, label: "Maître" },
] as const;

export const FILETS = [
  { nom: "Universel", niveau: 1, effet: "Capture la cible." },
  { nom: "Multiplicateur", niveau: 100, effet: "Capture et duplique la cible (même couleur, sexe non garanti)." },
  { nom: "Renforcé", niveau: 150, effet: "Capture toutes les montures dans un rayon de 3." },
  { nom: "Multiplicateur renforcé", niveau: 200, effet: "Combine les deux effets." },
] as const;

export const MAKINAS = [
  { nom: "Animakina", effet: "Choisit le sexe du bébé (3.7 ; en 3.5 : capacité aléatoire). Sans Makina, capacité aléatoire à la naissance : Amoureuse 8 %, Endurante 8 %, Sage 6 %, Reproductrice 3 % (Précoce supprimée)." },
  { nom: "Kromakina", effet: "Donne la capacité Caméléone à 100 %." },
  { nom: "Optimakina", effet: "Augmente de +20 % les chances d'obtenir la génération cible (3.7 ; +10 % en 3.5). Chaque Makina existe par type de monture et par génération : une Makina de génération supérieure ou égale à la cible convient, pas une inférieure (Noobs : « au minimum une makina de génération 6 » pour une cible 6). Le simulateur prend le prix de la génération cible, sinon la moins chère des générations supérieures renseignées (sources : Dofus pour les Noobs, guide de l'éleveur MàJ 13/10/2026 ; Guidactik confirme l'Optimakina sans détailler les générations ; JeuxEnd 3.7 : « Les Makinas sont ajustées avec la 3.7 », sans détail)." },
] as const;

export const ALMANAX = [
  "Janvier (Trôma) : jauges de Maturité doublées (à vérifier en 3.7)",
  "Février (Meash) : capacité Endurante aux naissances",
  "Mars (Inndo) : jauges d'Endurance doublées (à vérifier en 3.7)",
  "Avril (Nunu) : jauges de Sérénité − doublées (à vérifier en 3.7)",
  "Mai (Loumi) : -15 % d'ingrédients sur les crafts d'éleveur",
  "Juin (Jibejan) : jauges d'Expérience de monture doublées (à vérifier en 3.7)",
  "Juillet (Jihelair) : capacité Amoureuse aux naissances",
  "Août (Rigamix) : 25 % de chances d'un second objet sur les crafts",
  "Septembre (Mau) : jauges de Sérénité + doublées (à vérifier en 3.7)",
  "Octobre (Benjo) : capacité Sage aux naissances — et Takeza (date variable) : +20 % sur la génération cible",
  "Novembre (Otoul) : +20 % sur la génération cible (1 source ; la capacité Précoce a été supprimée en 3.7)",
  "Décembre (Foya) : jauges d'Amour doublées (à vérifier en 3.7)",
] as const;

export const SOURCES = [
  ["Dofus pour les Noobs — Présentation de la màj 3.7 (6 octobre 2026)", "https://www.dofuspourlesnoobs.com/mise-a-jour-307.html"],
  ["Sigilos — Élevage de montures Dofus 3.7 : le guide (MàJ 29/10/2026)", "https://beta.sigilos.fr/guides/guide-elevage-enclos-guilde-dofus"],
  ["JeuxEnd — Patch notes DOFUS 3.7", "https://www.jeuxend.com/blog/dofus-3-7-patch-notes-changements"],
  ["JeuxEnd — Élevage DOFUS 3.7 : étable 500 montures, génétons, Makinas", "https://www.jeuxend.com/blog/dofus-3-7-elevage-montures-makinas-genetons"],
  ["Duffus — Guide élevage", "https://duffus.fr/tutoriels/guide-elevage"],
  ["Next Stage — Tuto élevage de dragodinde A à Z (avril 2026 ; chiffres 3.5, dépassés)", "https://www.next-stage.fr/2026/04/tuto-elevage-dragodinde-dofus-guide-complet-a-z.html"],
  ["Dofus pour les Pros — Guide de l'éleveur (édition 2026 ; jauge 100 000 = 3.5)", "https://dofuspourlespros.com/guide-de-l-eleveur.html"],
  ["Dofus pour les Noobs — Guide de l'éleveur (MàJ 13/10/2026, couvre la 3.7)", "https://www.dofuspourlesnoobs.com/guide-de-l-eleveur.html"],
  ["Guidactik — Guide complet de l'élevage sur DOFUS 3", "https://guidactik.com/dofus/guide-complet-de-lelevage-sur-dofus-3/"],
  ["Guidactik — Extraction et généalogie des dragodindes", "https://guidactik.com/dofus/guide-elevage-sur-dofus-extraction-et-genealogie-de-dragodindes/"],
  ["Gamewave — Dofus 3.5 est là", "https://gamewave.fr/dofus/dofus-3-5-est-la-elevage-refondu-songes-boostes-et-plein-d-ameliorations-en-jeu/"],
  ["Next Stage — Quel serveur choisir sur DOFUS 3 ?", "https://www.next-stage.fr/2026/05/dofus-3-unity-quel-serveur-choisir.html"],
  ["DAFOUS — Guide Dragodindes Unity 3.5 (témoignage de marge, 3.5)", "https://dafous.app/guides/dragodindes.html"],
] as const;

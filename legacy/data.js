/* =====================================================================
   DONNÉES — élevage Dofus 3.5 (refonte du 3 mars 2026)
   Source : guides Next Stage, Dofus pour les Pros / Noobs, Guidactik, DAFOUS.
   Les valeurs en kamas ne sont PAS dans ce fichier : aucun prix fiable
   n'existe publiquement, tu les saisis toi-même dans l'onglet Rentabilité.
   ===================================================================== */

const SERVEURS = [
  { id: "Draconiros", type: "Monocompte (abonnement requis)", note: "Seul serveur monocompte. Prix plus fluctuants, ressources très disputées (galets, pépites, roses des sables). Moins de comptes = moins d'offre de montures, mais aussi moins de concurrence sur la vente." },
  { id: "Tal Kasha", type: "Classique (multicompte)", note: "Communauté internationale plus fournie. Économie qui tend vers les standards des autres serveurs." },
  { id: "Orukam", type: "Classique (multicompte)", note: "Aucune info spécifique trouvée." },
  { id: "Tylezia", type: "Classique (multicompte)", note: "Aucune info spécifique trouvée." },
  { id: "Hell Mina", type: "Classique (multicompte)", note: "Aucune info spécifique trouvée." },
  { id: "Imagiro", type: "Classique (multicompte)", note: "Serveur proposé par défaut aux débutants : probablement la plus grosse population, donc marché plus liquide." },
  { id: "Ombre", type: "Épique (mort définitive en PvM)", note: "Mort définitive en PvM : les dragodindes sauvages sont niveau 60-70 (~900 PV), mais une mort = perso perdu. Marché plus petit, farm à faire prudemment." }
];

/* Générations 1 à 10 — couleurs / croisements (Guidactik). Neurones d'extraction = génération. */
const GENERATIONS = [
  { gen: 1, sauvage: true, couleurs: ["Amande", "Rousse", "Dorée"] },
  { gen: 2, couleurs: ["Amande et Rousse", "Amande et Dorée", "Dorée et Rousse"] },
  { gen: 3, couleurs: ["Indigo", "Ébène"] },
  { gen: 4, couleurs: ["Amande et Indigo", "Amande et Ébène", "Ébène et Indigo", "Ébène et Rousse", "Dorée et Ébène", "Dorée et Indigo", "Indigo et Rousse"] },
  { gen: 5, couleurs: ["Orchidée", "Pourpre"] },
  { gen: 6, couleurs: ["Ébène et Orchidée", "Ébène et Pourpre", "Indigo et Pourpre", "Indigo et Orchidée", "Orchidée et Rousse", "Orchidée et Pourpre", "Dorée et Pourpre", "Dorée et Orchidée", "Pourpre et Rousse", "Amande et Pourpre", "Amande et Orchidée"] },
  { gen: 7, couleurs: ["Ivoire", "Turquoise"] },
  { gen: 8, couleurs: ["Indigo et Ivoire", "Indigo et Turquoise", "Ivoire et Orchidée", "Ivoire et Pourpre", "Ivoire et Rousse", "Ivoire et Turquoise", "Turquoise et Rousse", "Turquoise et Orchidée", "Turquoise et Pourpre", "Amande et Ivoire", "Amande et Turquoise", "Dorée et Turquoise", "Dorée et Ivoire", "Ébène et Ivoire", "Ébène et Turquoise"] },
  { gen: 9, couleurs: ["Prune", "Émeraude"] },
  { gen: 10, couleurs: ["Prune et Ivoire", "Prune et Pourpre", "Prune et Dorée", "Prune et Amande", "Prune et Orchidée", "Prune et Indigo", "Prune et Ébène", "Prune et Turquoise", "Prune et Émeraude", "Prune et Rousse", "Émeraude et Indigo", "Émeraude et Rousse", "Émeraude et Turquoise", "Émeraude et Pourpre", "Émeraude et Orchidée", "Émeraude et Ivoire", "Ébène et Émeraude", "Dorée et Émeraude", "Amande et Émeraude"] }
];

/* Génétons gagnés par parent selon sa génération */
const GENETONS = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 15, 6: 30, 7: 60, 8: 120, 9: 250, 10: 0 };

/* Jauge d'enclos : tiers et durée de vidage (capacité 100 000) */
const TIERS = [
  { tier: 1, plage: "0 – 40 000", min: 0, max: 40000, duree: "11 h 06", xpS: 1 },
  { tier: 2, plage: "40 001 – 70 000", min: 40001, max: 70000, duree: "4 h 09", xpS: 2 },
  { tier: 3, plage: "70 001 – 90 000", min: 70001, max: 90000, duree: "1 h 51", xpS: 3 },
  { tier: 4, plage: "90 001 – 100 000", min: 90001, max: 100000, duree: "42 min", xpS: 4 }
];

const CARBURANTS = [
  { nom: "Extrait", tierMax: "1 (40 000)", metier: 5, poussiere: 50 },
  { nom: "Philtre", tierMax: "2 (70 000)", metier: 55, poussiere: 200 },
  { nom: "Potion", tierMax: "3 (90 000)", metier: 105, poussiere: 800 },
  { nom: "Élixir", tierMax: "4 (100 000)", metier: 155, poussiere: 3200 }
];

const JAUGES = [
  { nom: "Baffeur", effet: "Fait baisser la sérénité (lié au Caresseur : un seul actif)." },
  { nom: "Caresseur", effet: "Fait monter la sérénité." },
  { nom: "Foudroyeur", effet: "Monte l'Endurance (sérénité négative)." },
  { nom: "Abreuvoir", effet: "Monte la Maturité (sérénité entre -2 000 et 2 000)." },
  { nom: "Dragofesse", effet: "Monte l'Amour (sérénité positive)." },
  { nom: "Mangeoire", effet: "Donne de l'XP à la monture." }
];

const ENCLOS_METIER = [
  { niveau: 1, label: "Débutant" }, { niveau: 40, label: "Novice" }, { niveau: 80, label: "Apprenti" },
  { niveau: 120, label: "Initié" }, { niveau: 160, label: "Vétéran" }, { niveau: 200, label: "Maître" }
];

const FILETS = [
  { nom: "Universel", niveau: 1, effet: "Capture la cible." },
  { nom: "Multiplicateur", niveau: 100, effet: "Capture et duplique la cible (même couleur, sexe non garanti)." },
  { nom: "Renforcé", niveau: 150, effet: "Capture toutes les montures dans un rayon de 3." },
  { nom: "Multiplicateur renforcé", niveau: 200, effet: "Combine les deux effets." }
];

const MAKINAS = [
  { nom: "Animakina", effet: "Donne une capacité aléatoire au bébé : Amoureuse 27 %, Endurante 27 %, Précoce 27 %, Sage 14 %, Reproducteur 5 %." },
  { nom: "Kromakina", effet: "Donne la capacité Caméléone à 100 %." },
  { nom: "Optimakina", effet: "Augmente les chances d'obtenir la génération cible (+10 %, une source dit +20 %). Avec deux parents niveau 200 : 100 %." }
];

const ALMANAX = [
  "Janvier (Trôma) : Abreuvoirs doublés",
  "Février (Meash) : capacité Endurante aux naissances",
  "Mars (Inndo) : Foudroyeurs doublés",
  "Avril (Nunu) : Baffeurs doublés",
  "Mai (Loumi) : -15 % d'ingrédients sur les crafts d'éleveur",
  "Juin (Jibejan) : Mangeoires doublées",
  "Juillet (Jihelair) : capacité Amoureuse aux naissances",
  "Août (Rigamix) : 25 % de chances d'un second objet sur les crafts",
  "Septembre (Mau) : Caresseurs doublés",
  "Octobre (Benjo) : capacité Sage aux naissances — et Takeza (date variable) : +20 % sur la génération cible",
  "Novembre (Otoul) : capacité Précoce aux naissances",
  "Décembre (Foya) : Dragofesses doublées"
];

const SOURCES = [
  ["Next Stage — Tuto élevage de dragodinde A à Z (avril 2026)", "https://www.next-stage.fr/2026/04/tuto-elevage-dragodinde-dofus-guide-complet-a-z.html"],
  ["Dofus pour les Pros — Guide de l'éleveur (édition 2026)", "https://dofuspourlespros.com/guide-de-l-eleveur.html"],
  ["Dofus pour les Noobs — Guide de l'éleveur / màj 3.5", "https://www.dofuspourlesnoobs.com/guide-de-l-eleveur.html"],
  ["Guidactik — Guide complet de l'élevage sur DOFUS 3", "https://guidactik.com/dofus/guide-complet-de-lelevage-sur-dofus-3/"],
  ["Guidactik — Extraction et généalogie des dragodindes", "https://guidactik.com/dofus/guide-elevage-sur-dofus-extraction-et-genealogie-de-dragodindes/"],
  ["Gamewave — Dofus 3.5 est là", "https://gamewave.fr/dofus/dofus-3-5-est-la-elevage-refondu-songes-boostes-et-plein-d-ameliorations-en-jeu/"],
  ["Next Stage — Quel serveur choisir sur DOFUS 3 ?", "https://www.next-stage.fr/2026/05/dofus-3-unity-quel-serveur-choisir.html"],
  ["DAFOUS — Guide Dragodindes Unity 3.5 (témoignage de marge)", "https://dafous.app/guides/dragodindes.html"]
];

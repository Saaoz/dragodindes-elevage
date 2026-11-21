/* Carte du site (#85) : source unique des écrans, des fonctionnalités, de leurs explications et de leurs cibles.
   Écrite à la main, une fois : aucun calcul ni appel réseau à l'usage. `lib/carte.test.ts` vérifie que chaque
   cible existe (route, section du guide, onglet de Rentabilité, ancre de page). */

export type Fonctionnalite = {
  id: string;
  titre: string;
  /** Une phrase pour un joueur : à quoi ça sert. */
  explication: string;
  /** Cible exacte : route, avec ancre éventuelle (ex. `/rentabilite#comparer`). */
  href: string;
  /** Vrai quand la fonctionnalité n'apparaît qu'avec des données saisies (essayable en démo). */
  demo?: boolean;
};

export type Ecran = {
  id: "accueil" | "enclos" | "rentabilite" | "guide";
  titre: string;
  href: string;
  explication: string;
  fonctionnalites: readonly Fonctionnalite[];
};

export const SITE = {
  titre: "Élevage de dragodindes",
  explication:
    "Un outil de fan pour l'élevage de dragodindes dans DOFUS : à quelle heure revenir à l'enclos, un accouplement est-il rentable, et tout le guide de référence. Quatre écrans, tout reste dans ton navigateur.",
} as const;

export const ECRANS: readonly Ecran[] = [
  {
    id: "accueil",
    titre: "Accueil",
    href: "/",
    explication: "Ce qui compte maintenant, en un coup d'œil, et des raccourcis vers le reste.",
    fonctionnalites: [
      {
        id: "accueil-urgents",
        titre: "Enclos à surveiller",
        explication:
          "Les enclos à revoir en premier, classés par urgence, avec l'heure avant laquelle revenir. Un clic ouvre l'enclos concerné.",
        href: "/#titre-surveiller",
        demo: true,
      },
      {
        id: "accueil-tournee",
        titre: "Lien vers la tournée",
        explication:
          "Quand plusieurs enclos sont à revoir dans la foulée, un lien te mène directement à la tournée pour les faire d'un seul passage.",
        href: "/#titre-surveiller",
        demo: true,
      },
      {
        id: "accueil-almanax",
        titre: "Bonus Almanax",
        explication: "Le bonus d'élevage du mois en cours et celui du mois prochain, avec un lien vers les 12 mois du guide.",
        href: "/#titre-almanax",
      },
      {
        id: "accueil-installer",
        titre: "Installer l'appli",
        explication:
          "Ajoute le site à ton écran d'accueil pour l'ouvrir comme une appli, même sans connexion, une fois les pages chargées.",
        href: "/",
      },
    ],
  },
  {
    id: "enclos",
    titre: "Enclos",
    href: "/enclos",
    explication: "Tes 6 enclos : note la sérénité des montures en partant, l'outil te dit quand revenir.",
    fonctionnalites: [
      {
        id: "enclos-retour",
        titre: "Heure de retour",
        explication:
          "En quittant un enclos, tu notes l'état de tes montures : l'outil calcule l'heure avant laquelle revenir pour ne rien rater.",
        href: "/enclos",
        demo: true,
      },
      {
        id: "enclos-objectifs",
        titre: "Objectifs Maturité, Endurance, Amour",
        explication:
          "Choisis ce que tu veux faire monter (Maturité, Endurance ou Amour) : le calcul et le conseil s'adaptent à ton objectif.",
        href: "/enclos",
      },
      {
        id: "enclos-conseil",
        titre: "Conseil de jauge chiffré",
        explication:
          "Un conseil précis, avec des chiffres, sur la jauge de sérénité à viser : l'Endurance ne monte qu'en sérénité négative, l'Amour qu'en positive.",
        href: "/enclos",
        demo: true,
      },
      {
        id: "enclos-maintenant",
        titre: "À faire maintenant et retard",
        explication:
          "Quand l'heure de retour est arrivée ou dépassée, l'enclos passe en tête avec la mention « À faire maintenant » ou la durée du retard.",
        href: "/enclos",
        demo: true,
      },
      {
        id: "enclos-alertes",
        titre: "Alertes ±5 000 et « ne monte plus »",
        explication:
          "Une alerte te prévient quand la jauge approche de ±5 000, ou quand elle ne fait plus monter l'objectif choisi.",
        href: "/enclos",
        demo: true,
      },
      {
        id: "enclos-pause",
        titre: "Jauge en pause",
        explication:
          "Quand aucune monture n'est dans sa plage de pause, la jauge ne bouge pas : l'outil l'indique au lieu de te faire revenir pour rien.",
        href: "/enclos",
        demo: true,
      },
      {
        id: "enclos-maximum",
        titre: "Monture au maximum",
        explication:
          "Une monture arrivée au maximum de sa jauge (Endurance, Maturité ou Amour) est signalée : inutile de la laisser dans l'enclos pour ça.",
        href: "/enclos",
        demo: true,
      },
      {
        id: "enclos-pas-plein",
        titre: "Enclos pas plein",
        explication: "Si l'enclos n'est pas rempli, l'outil le signale : une place libre est un gain perdu.",
        href: "/enclos",
        demo: true,
      },
      {
        id: "enclos-tournee",
        titre: "Prochaine tournée",
        explication:
          "Les enclos à revoir dans la foulée sont regroupés dans une tournée : tu sais quand partir et dans quel ordre passer.",
        href: "/enclos#titre-tournee",
        demo: true,
      },
      {
        id: "enclos-rappels",
        titre: "Rappels : agenda, Google, page",
        explication:
          "Programme un rappel avant l'heure de retour : un fichier pour ton agenda, un lien Google Agenda, ou une alerte tant que la page reste ouverte.",
        href: "/enclos",
        demo: true,
      },
      {
        id: "enclos-apercu",
        titre: "Aperçu de saisie",
        explication:
          "Pendant que tu saisis les montures, un aperçu montre tout de suite l'heure de retour qui en résulterait, avant même de valider.",
        href: "/enclos",
        demo: true,
      },
      {
        id: "enclos-marge",
        titre: "Marge des rappels",
        explication: "Choisis combien de minutes avant l'heure de retour tes rappels se déclenchent, de « à l'heure » à plus en avance.",
        href: "/enclos",
      },
      {
        id: "enclos-demo",
        titre: "Démo",
        explication:
          "Un bouton charge des enclos fictifs pour tout essayer sans rien saisir. Tes vraies données ne sont pas touchées.",
        href: "/enclos",
      },
    ],
  },
  {
    id: "rentabilite",
    titre: "Rentabilité",
    href: "/rentabilite",
    explication: "Un accouplement est-il rentable avec tes prix HDV ? Simule, saisis tes prix, compare.",
    fonctionnalites: [
      {
        id: "rentabilite-simuler",
        titre: "Simuler",
        explication:
          "Choisis la génération visée et les parents, le simulateur donne le profit espéré et un verdict : rentable ou pas.",
        href: "/rentabilite",
      },
      {
        id: "rentabilite-taxe",
        titre: "Lieu de vente et taxe HDV",
        explication:
          "Indique où tu vends : la taxe de l'hôtel des ventes est déduite du profit espéré, ligne par ligne.",
        href: "/rentabilite",
        demo: true,
      },
      {
        id: "rentabilite-prix",
        titre: "Mes prix, export et import",
        explication:
          "Saisis tes prix HDV par serveur (chacun est daté), colle une liste, ou exporte et importe tout en un fichier JSON.",
        href: "/rentabilite#prix",
      },
      {
        id: "rentabilite-comparer",
        titre: "Comparer",
        explication:
          "Un graphique compare les générations cibles côte à côte avec tes prix : tu vois d'un coup d'œil laquelle rapporte le plus.",
        href: "/rentabilite#comparer",
        demo: true,
      },
    ],
  },
  {
    id: "guide",
    titre: "Guide",
    href: "/guide",
    explication: "Tout le contenu de référence de l'élevage, section par section.",
    fonctionnalites: [
      { id: "guide-essentiel", titre: "L'essentiel", explication: "Ce que les refontes 3.5 et 3.7 ont changé dans l'élevage.", href: "/guide#essentiel" },
      { id: "guide-capture", titre: "Capture", explication: "Où capturer, le sort de capture et les filets.", href: "/guide#capture" },
      { id: "guide-reproduction", titre: "Reproduction", explication: "Pas à pas, formule de la génération cible, enclos.", href: "/guide#reproduction" },
      { id: "guide-jauges", titre: "Jauges et tiers", explication: "Les 6 jauges, la vitesse par tier, les carburants.", href: "/guide#jauges" },
      { id: "guide-makinas", titre: "Makinas, clonage, extraction", explication: "Les Makinas, le clonage, l'extraction et les Génétons.", href: "/guide#makinas" },
      { id: "guide-capacites", titre: "Capacités", explication: "Amoureuse, Endurante, Sage, Reproductrice, Caméléone : ce qu'elles font, comment les obtenir, à quelles conditions.", href: "/guide#capacites" },
      { id: "guide-croisements", titre: "Croisements", explication: "Les couleurs par génération, avec une recherche sans accents.", href: "/guide#croisements" },
      { id: "guide-conseils", titre: "Quoi viser", explication: "Une stratégie d'élevage tirée des mécaniques.", href: "/guide#conseils" },
      { id: "guide-outils", titre: "Outil XP", explication: "Combien d'heures pour faire monter une monture.", href: "/guide#outils" },
      { id: "guide-almanax", titre: "Almanax", explication: "Les bonus d'élevage, mois par mois.", href: "/guide#almanax" },
      { id: "guide-serveurs", titre: "Serveurs", explication: "Ce que disent les guides de chaque serveur.", href: "/guide#serveurs" },
      { id: "guide-sources", titre: "Sources et doutes", explication: "Les guides utilisés, les anciens noms, les contradictions.", href: "/guide#sources" },
    ],
  },
];

export const TOUTES_FONCTIONNALITES: readonly Fonctionnalite[] = ECRANS.flatMap((e) => e.fonctionnalites);

/** Cherche un nœud par son identifiant (fonctionnalité ou écran). */
export function trouverNoeud(id: string): Fonctionnalite | Ecran | undefined {
  return ECRANS.find((e) => e.id === id) ?? TOUTES_FONCTIONNALITES.find((f) => f.id === id);
}

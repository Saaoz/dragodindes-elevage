"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Choix } from "@/components/commun/choix";
import { champ } from "@/components/commun/champ";
import { EnTete, Page } from "@/components/commun/en-tete";
import { Switch } from "@/components/ui/switch";
import {
  ALMANAX, CAPACITE_JAUGE, CARBURANTS, ENCLOS_METIER, FILETS, GENETONS, JAUGES, MAKINAS, SERVEURS, SOURCES, TIERS,
  VERSION_JEU,
} from "@/lib/data";
import { chercherCouleur, heuresXp, lireAlmanax, TRAJETS_XP } from "@/lib/guide";
import { cn } from "@/lib/utils";

/* ---------- briques de mise en page ---------- */
const SECTIONS = [
  { id: "essentiel", titre: "L'essentiel" },
  { id: "capture", titre: "Capture" },
  { id: "reproduction", titre: "Reproduction" },
  { id: "jauges", titre: "Jauges et tiers 3.7" },
  { id: "makinas", titre: "Makinas, clonage, extraction" },
  { id: "croisements", titre: "Croisements" },
  { id: "conseils", titre: "Quoi viser" },
  { id: "outils", titre: "Outil XP" },
  { id: "almanax", titre: "Almanax" },
  { id: "serveurs", titre: "Serveurs" },
  { id: "sources", titre: "Sources et doutes" },
] as const;
type IdSection = (typeof SECTIONS)[number]["id"];

function Section({
  id,
  titre,
  resume,
  ouvert,
  basculer,
  children,
}: {
  id: IdSection;
  titre: string;
  resume: string;
  ouvert: boolean;
  basculer: (id: IdSection, o: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <details
      id={id}
      open={ouvert}
      onToggle={(e) => basculer(id, (e.currentTarget as HTMLDetailsElement).open)}
      className="scroll-mt-20 rounded-xl border bg-card"
    >
      <summary className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 rounded-xl p-4 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
        <h2 className="font-semibold">{titre}</h2>
        <ChevronDown className="chevron row-span-2 size-5 shrink-0 text-muted-foreground transition-transform" aria-hidden />
        <span className="text-sm text-muted-foreground">{resume}</span>
      </summary>
      <div className="flex flex-col gap-4 border-t px-4 pt-4 pb-5 text-sm leading-relaxed">{children}</div>
    </details>
  );
}

const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="text-base font-semibold">{children}</h3>;

function Tableau({ entetes, lignes, legende }: { entetes: string[]; lignes: React.ReactNode[][]; legende?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        {legende && <caption className="sr-only">{legende}</caption>}
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
          <tr>
            {entetes.map((e) => (
              <th key={e} scope="col" className="px-3 py-2 font-medium">
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i} className="border-t align-top">
              {l.map((c, j) => (
                <td key={j} className={cn("px-3 py-2", j === 0 && "font-medium")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Note = ({ children, ton = "info" }: { children: React.ReactNode; ton?: "info" | "attention" }) => (
  <div
    className={cn(
      "rounded-lg border-l-4 p-3",
      ton === "attention" ? "border-warning bg-warning/10" : "border-primary bg-primary/5",
    )}
  >
    {children}
  </div>
);

const Liste = ({ items, ordonnee = false }: { items: React.ReactNode[]; ordonnee?: boolean }) => {
  const L = ordonnee ? "ol" : "ul";
  return (
    <L className={cn("flex flex-col gap-1.5 pl-5", ordonnee ? "list-decimal" : "list-disc")}>
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </L>
  );
};

/* ---------- croisements avec recherche ---------- */
function Croisements() {
  const [q, setQ] = useState("");
  const { generations, total } = chercherCouleur(q);
  return (
    <>
      <p className="text-muted-foreground">
        66 dragodindes élevables + 2 spéciales non reproductibles. Chaque couleur n&apos;a qu&apos;un seul croisement
        possible : vérifie la recette exacte dans l&apos;interface <em>Génétique</em> en jeu.
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor="recherche-couleur" className="text-sm font-medium">
          Chercher une couleur
        </label>
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            id="recherche-couleur"
            type="search"
            className={cn(champ, "pl-9")}
            placeholder="ex. Émeraude, prune, ivoire…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <p role="status" className="text-xs text-muted-foreground">
          {q.trim() ? (total ? `${total} couleur${total > 1 ? "s" : ""} trouvée${total > 1 ? "s" : ""}` : "Aucune couleur trouvée") : "Accents et majuscules ignorés."}
        </p>
      </div>
      <ol className="flex flex-col gap-2">
        {generations
          .filter((g) => !q.trim() || g.nbTrouves > 0)
          .map((g) => (
            <li key={g.gen} className="flex gap-3 rounded-lg border p-3" data-testid={`generation-${g.gen}`}>
              <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                <span className="text-[0.65rem] leading-none">Gén.</span>
                <span className="text-base leading-none font-bold">{g.gen}</span>
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {g.sauvage
                    ? "Capture directe · non extractible"
                    : `${g.gen} neurone${g.gen > 1 ? "s" : ""} à l'extraction · ${g.couleurs.length} couleur${g.couleurs.length > 1 ? "s" : ""}`}
                </p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {g.couleurs.map((c) => (
                    <li
                      key={c.nom}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs",
                        c.trouve ? "border-primary bg-primary text-primary-foreground font-semibold" : "bg-background",
                      )}
                    >
                      {c.trouve ? <mark className="bg-transparent text-inherit">{c.nom}</mark> : c.nom}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
      </ol>
      <Note ton="attention">
        Le nombre de neurones à l&apos;extraction est égal à la génération. Les recettes parentales exactes ne sont pas
        reproduites ici : les guides ne donnent qu&apos;une liste par génération. Exemples confirmés : Émeraude =
        Ivoire/Turquoise × Ivoire/Pourpre ; Pourpre (gén. 5) × Émeraude (gén. 9) → génération cible 10.
      </Note>
    </>
  );
}

/* ---------- outil XP ---------- */
function OutilXp() {
  const [trajet, setTrajet] = useState<(typeof TRAJETS_XP)[number]["id"]>("1-200");
  const [tier, setTier] = useState(4);
  const [sage, setSage] = useState(false);
  const xp = TRAJETS_XP.find((t) => t.id === trajet)!.xp;
  const h = heuresXp(xp, tier, sage);
  return (
    <>
      <p className="text-muted-foreground">Temps de montée en niveau d&apos;une monture avec la jauge Expérience de monture.</p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="font-medium">Trajet</span>
          <Choix
            label="Trajet"
            taille="sm"
            valeur={trajet}
            onChange={setTrajet}
            options={TRAJETS_XP.map((t) => ({ valeur: t.id, label: t.label }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="font-medium">Tier de la jauge</span>
          <Choix
            label="Tier de la jauge Expérience de monture"
            taille="sm"
            valeur={tier}
            onChange={setTier}
            options={TIERS.map((t) => ({ valeur: t.tier, label: `Tier ${t.tier} (${t.xpS} XP/s)` }))}
          />
        </div>
        <label className="flex items-center gap-3">
          <Switch checked={sage} onCheckedChange={setSage} aria-label="Capacité Sage (XP × 2)" />
          Capacité Sage (XP × 2)
        </label>
      </div>
      <Note>
        <p>
          <strong className="text-lg">{h.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h</strong> à régime
          constant ({xp.toLocaleString("fr-FR")} XP).
        </p>
        <p className="text-muted-foreground">
          En pratique la jauge se vide (le tier 4 ne dure que 1 h 23) : les guides annoncent 100 à 150 h pour le niveau
          200.
        </p>
      </Note>
    </>
  );
}

/* ---------- la page ---------- */
export function GuidePage() {
  const [ouverts, setOuverts] = useState<Set<IdSection>>(() => new Set());
  const basculer = (id: IdSection, o: boolean) =>
    setOuverts((p) => {
      if (p.has(id) === o) return p;
      const n = new Set(p);
      if (o) n.add(id);
      else n.delete(id);
      return n;
    });

  /* /guide#croisements : ouvre la section visée et la fait défiler. */
  useEffect(() => {
    const aller = () => {
      const id = location.hash.slice(1);
      if (!SECTIONS.some((s) => s.id === id)) return;
      basculer(id as IdSection, true);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    };
    aller();
    window.addEventListener("hashchange", aller);
    return () => window.removeEventListener("hashchange", aller);
  }, []);

  const tousOuverts = ouverts.size === SECTIONS.length;
  const p = { basculer };
  const o = (id: IdSection) => ouverts.has(id);

  return (
    <Page>
      <EnTete titre="Guide">
        Tout le contenu de référence de l&apos;élevage en DOFUS {VERSION_JEU}, section par section. Les outils
        d&apos;action sont dans Enclos et Rentabilité.
      </EnTete>

      <nav
        aria-label="Sections du guide"
        className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
      >
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="shrink-0 rounded-full border bg-card px-3 py-1 text-sm whitespace-nowrap outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {s.titre}
          </a>
        ))}
        <button
          type="button"
          className="ml-auto shrink-0 rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap text-primary underline-offset-4 hover:underline"
          onClick={() => setOuverts(tousOuverts ? new Set() : new Set(SECTIONS.map((s) => s.id)))}
        >
          {tousOuverts ? "Tout replier" : "Tout déplier"}
        </button>
      </nav>

      <div className="flex flex-col gap-3">
        <Section id="essentiel" titre="L'essentiel" resume="Ce que les refontes 3.5 et 3.7 ont changé." ouvert={o("essentiel")} {...p}>
          <p>
            La 3.5 (3 mars 2026) a transformé l&apos;élevage en vrai métier, planifiable : plus de gestation, plus de
            fatigue, un bébé par accouplement. La {VERSION_JEU} (6 octobre 2026) a doublé la capacité des jauges
            ({CAPACITE_JAUGE.toLocaleString("fr-FR")}) et porté l&apos;Optimakina à +20 %.
          </p>
          <ul className="flex flex-wrap gap-2">
            {[
              ["Niveau max monture", "200"],
              ["Bébé par accouplement", "1"],
              ["Enclos", "6 × 10 places"],
              ["Fécondité", "20 000 × 3 jauges"],
            ].map(([t, v]) => (
              <li key={t} className="rounded-full border bg-muted/50 px-3 py-1 text-xs">
                {t} : <strong>{v}</strong>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <H3>Supprimé</H3>
              <Liste
                items={[
                  "Certificats de monture (la dragodinde est un objet équipable)",
                  "Énergie et fatigue",
                  "Enclos privés (remboursés au prix d'achat de base)",
                  "Gestation et fenêtre de 7 jours : le bébé naît à l'accouplement",
                  "Objets d'élevage classiques, compensés en poussière d'élevage (0,55 par point de durabilité restant)",
                  "Quête du donjon Koulosse : le sort de capture vient du filet",
                ]}
              />
            </div>
            <div>
              <H3>Ajouté</H3>
              <Liste
                items={[
                  "Métier Éleveur (niveau 1 à 200)",
                  "Montures niveau 200 (Vitalité 300 au niv. 100, 400 au niv. 200)",
                  "Filets de capture (4 types), interface d'élevage accessible partout",
                  "Jauges d'enclos + carburants, sérénité",
                  "Génération cible, Makinas, clonage, extraction",
                  "Génétons → parchemins de caractéristiques",
                  "Succès d'élevage (38 succès, 1 211 points)",
                ]}
              />
            </div>
          </div>
          <Note ton="attention">
            <strong>Vieilles montures</strong> : celles possédées avant la 3.4 sont devenues <strong>séniles</strong> :
            montables et équipables, mais ni élevables ni accouplables. Extraction : une seule ressource quelle que soit la
            génération.
          </Note>
          <Note>
            Le système est devenu mécanique, donc calculable. L&apos;argent se fait sur trois leviers : monter les
            générations, extraire les neurones des parents stériles, convertir les Génétons en parchemins. Aucun prix de
            marché fiable n&apos;existe publiquement : c&apos;est pour ça que la Rentabilité te fait saisir tes propres prix.
          </Note>
        </Section>

        <Section id="capture" titre="Capture et sauvages" resume="Où capturer, le sort de capture, les filets." ouvert={o("capture")} {...p}>
          <p>
            Les sauvages sont de simples monstres niveau 60 (zone 62-70, ~900 PV). La capture ne demande plus de
            connaissance particulière.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <H3>Où capturer</H3>
              <Liste
                items={[
                  <>
                    <strong>Dragodindes</strong> : Territoires des Dragodindes sauvages (montagne des Koalaks)
                  </>,
                  <>
                    <strong>Volkornes</strong> : Haras de Brâkmar (sud de Brâkmar)
                  </>,
                  <>
                    <strong>Muldos</strong> : Bassin des Muldos, en bateau en [15,19]
                  </>,
                ]}
              />
            </div>
            <div>
              <H3>Le sort de capture</H3>
              <Liste
                items={[
                  "Accordé en équipant un filet dans les consommables de combat",
                  "Portée 7 PO sans ligne de vue, 1 PA, 1 fois par combat",
                  "La cible reçoit l'état Capturé ; la capture se valide en tuant tous les adversaires",
                  "En groupe : une monture ne peut être capturée qu'une fois, pas volable",
                  "+30 XP de métier par combat avec capture",
                ]}
              />
            </div>
          </div>
          <H3>Les filets</H3>
          <Tableau
            legende="Filets de capture"
            entetes={["Filet", "Niveau perso", "Effet"]}
            lignes={FILETS.map((f) => [f.nom, `${f.niveau}+`, f.effet])}
          />
          <H3>Les sauvages et la reproduction</H3>
          <Liste
            ordonnee
            items={[
              <>
                <strong>Capturée = génération 1, directement domestique.</strong> Pas de généalogie, tu l&apos;élèves tout
                de suite. Les 3 couleurs de base : Amande, Rousse, Dorée.
              </>,
              <>
                <strong>Deux gén. 1 de couleurs différentes → génération cible 2.</strong> La cible n&apos;est pas
                garantie : 30 % de base + 0,15 % par niveau de parent.
              </>,
              <>
                <strong>Le sexe est aléatoire.</strong> Le filet multiplicateur duplique la couleur mais pas le sexe :
                capture en masse pour avoir des couples M/F.
              </>,
              <>
                <strong>Un bébé par couple</strong>, parents stériles aussitôt : clone, extrais ou vends-les ensuite.
              </>,
            ]}
          />
          <Note ton="attention">
            <strong>Piège</strong> : beaucoup de vieux guides parlent de mâle sauvage qui s&apos;enfuit, de
            sauvage/domestique interdit ou de « jusqu&apos;à 4 bébés ». C&apos;est l&apos;ancien système : il ne
            s&apos;applique plus.
          </Note>
        </Section>

        <Section id="reproduction" titre="Reproduction" resume="Pas à pas, formule de la génération cible, enclos." ouvert={o("reproduction")} {...p}>
          <Liste
            ordonnee
            items={[
              <>
                <strong>Enclos publics</strong> : village des Éleveurs en [-16,1], 6 enclos de 10 places liés au compte,
                débloqués avec le niveau de métier.
              </>,
              <>
                <strong>Jauges et carburants</strong> : 6 jauges, 2 actives au maximum, appliquées à toutes les montures
                de l&apos;enclos. La consommation ne dépend pas du nombre de montures : remplis chaque enclos à 10.
              </>,
              <>
                <strong>Sérénité</strong> (−5 000 à +5 000) : elle décide quelle jauge progresse. Elle est propre à
                chaque monture ; la jauge de sérénité décale toutes les montures du même nombre de points. L&apos;heure
                de retour se calcule dans{" "}
                <Link href="/enclos" className="font-medium text-primary underline underline-offset-4">
                  Enclos
                </Link>
                .
              </>,
              <>
                <strong>Fécondité</strong> : Endurance, Maturité et Amour à 20 000 chacune. Dorée : cinq fois plus lente,
                Maturité jusqu&apos;à 10 000 au lieu de 1 000.
              </>,
              <>
                <strong>Accouplement</strong> : deux montures fécondes, sexes opposés, même type, dans l&apos;étable. Le
                bébé naît tout de suite, niveau 1, jauges à zéro, sexe aléatoire.
              </>,
              <>
                <strong>Après</strong> : les parents sont stériles. Tu les clones (2 → 1 fertile), les extrais ou les
                vends.
              </>,
            ]}
          />
          <H3>Génération cible : la formule</H3>
          <Note>
            <p className="font-semibold">Chance = 30 % + 0,15 % × (niveau parent A + niveau parent B) + bonus Optimakina</p>
            <Liste
              items={[
                "Deux parents niveau 100 : 60 %. Deux parents niveau 200 : 90 %.",
                "Optimakina (+20 % en 3.7) avec deux parents niveau 200 : 100 % (plafonné).",
                "Une couleur répétée dans l'arbre (jusqu'aux grands-parents) augmente ses chances d'apparaître.",
              ]}
            />
          </Note>
          <H3>Enclos débloqués par niveau de métier</H3>
          <Tableau
            legende="Enclos par niveau de métier"
            entetes={["Niveau de métier", "Palier", "Enclos"]}
            lignes={ENCLOS_METIER.map((e, i) => [e.niveau, e.label, `${i + 1} enclos (${(i + 1) * 10} places)`])}
          />
          <p className="text-muted-foreground">Conseil des guides : viser le niveau 120 pour 4 enclos (40 places).</p>
        </Section>

        <Section id="jauges" titre={`Jauges et tiers ${VERSION_JEU}`} resume="Les 6 jauges, la vitesse par tier, les carburants." ouvert={o("jauges")} {...p}>
          <Tableau legende="Jauges" entetes={["Jauge", "Effet"]} lignes={JAUGES.map((j) => [j.nom, j.effet])} />
          <p className="text-muted-foreground">
            Sérénité + et Sérénité − sont liées : une seule des deux est active. 2 jauges au maximum, toutes catégories
            confondues.
          </p>
          <H3>Tiers de jauge et vitesse</H3>
          <Tableau
            legende="Tiers de jauge"
            entetes={["Tier", "Niveau de la jauge", "Durée", "Pts / s"]}
            lignes={TIERS.map((t) => [
              t.tier,
              <div key={t.tier} className="flex min-w-36 flex-col gap-1">
                {t.plage}
                <span className="h-1.5 rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${((t.max - Math.max(0, t.min - 1)) / CAPACITE_JAUGE) * 100}%` }}
                  />
                </span>
              </div>,
              t.duree,
              t.xpS,
            ])}
          />
          <p className="text-muted-foreground">
            Jauge pleine ({CAPACITE_JAUGE.toLocaleString("fr-FR")}) ≈ 35 h 37 pour se vider (3.5 : 100 000 ≈ 17 h 48).
            Plus c&apos;est plein, plus ça donne vite… et plus ça se vide vite.
          </p>
          <H3>Carburants</H3>
          <Tableau
            legende="Carburants"
            entetes={["Carburant", "Tier max", "Niveau métier", "Gigantesque (poussière)"]}
            lignes={CARBURANTS.map((c) => [c.nom, c.tierMax, c.metier, c.poussiere.toLocaleString("fr-FR")])}
          />
          <p className="text-muted-foreground">
            5 tailles, de Minuscule (2 000 de durabilité) à Gigantesque (10 000), doublées en 3.7. Adèle Vage en [-18,1]
            vend les Gigantesques contre de la poussière ; aussi à l&apos;HDV. Anciens noms des jauges (Baffeur,
            Caresseur…) : voir « Sources et doutes ».
          </p>
        </Section>

        <Section id="makinas" titre="Makinas, clonage, extraction" resume="Makinas et capacités, Génétons." ouvert={o("makinas")} {...p}>
          <Tableau legende="Makinas" entetes={["Makina", "Effet"]} lignes={MAKINAS.map((m) => [m.nom, m.effet])} />
          <Liste
            items={[
              "Une seule Makina par accouplement. Les capacités ne s'héritent pas : elles viennent uniquement des Makinas.",
              <>
                <strong>Reproducteur</strong> : un bébé supplémentaire (actif même si seul le mâle l&apos;a, non cumulable).
              </>,
              <>
                <strong>Sage</strong> : double l&apos;XP de la monture.
              </>,
              "Utilise une Makina de génération au moins égale à la cible.",
            ]}
          />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <H3>Clonage</H3>
              <p>
                Fusionne deux montures stériles de même génération et type : une seule revient, fertile, même sexe et
                généalogie. Jauges réinitialisées, capacité perdue. Pas sur les séniles.
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <H3>Extraction</H3>
              <p>
                Détruit la monture. 1 ressource par génération (Neurone pour la dragodinde, Ambre pour le muldo, Corne
                pour le volkorne). Gén. 1 non extractible.
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <H3>Génétons</H3>
              <p>
                Gagnés quand le bébé dépasse la génération de toutes les montures des arbres parents ; ceux des deux
                parents s&apos;additionnent. Eugène Éton les échange contre parchemins, Tourmalines et Alitons.
              </p>
            </div>
          </div>
          <Tableau
            legende="Génétons par parent"
            entetes={["Génération du parent", ...Object.keys(GENETONS).filter((g) => +g < 10)]}
            lignes={[["Génétons", ...Object.entries(GENETONS).filter(([g]) => +g < 10).map(([, v]) => v)]]}
          />
        </Section>

        <Section id="croisements" titre="Croisements" resume="Couleurs par génération, recherche." ouvert={o("croisements")} {...p}>
          <Croisements />
        </Section>

        <Section id="conseils" titre="Quoi viser" resume="Une stratégie d'élevage tirée des mécaniques." ouvert={o("conseils")} {...p}>
          <p className="text-muted-foreground">
            Une analyse à partir des mécaniques, pas une vérité de marché : les prix, c&apos;est à toi de les mettre
            dans la Rentabilité pour trancher.
          </p>
          <Liste
            ordonnee
            items={[
              <><strong>Métier niveau 120 d&apos;abord</strong> (4 enclos = 40 places). XP : 30 par combat de capture, crafts, accouplements.</>,
              <><strong>Capture de masse en gén. 1</strong> (Amande / Rousse / Dorée) avec les filets multiplicateurs (dès le niveau 100).</>,
              <><strong>Enclos toujours pleins (10/10)</strong> : la consommation de carburant est la même pour 1 ou 10 montures.</>,
              <><strong>Sérénité entre −2 000 et +2 000</strong> sur chaque monture : hors de là, tu perds une jauge utile.</>,
              <><strong>Parents niveau 100+ minimum.</strong> Chaque niveau vaut 0,15 % ; à arbitrer contre une Optimakina.</>,
              <><strong>Monte les générations tant que le prix de la cible dépasse</strong> le coût des parents + carburant + Makina. Calcule-le, ne devine pas.</>,
              <><strong>Parents stériles</strong> : clone pour un succès, extrais seulement si neurones × prix &gt; prix de revente.</>,
              <><strong>Génétons</strong> : un parent gén. 9 × un gén. 1 qui donne un gén. 10 = 251 Génétons.</>,
              <><strong>Cale tes accouplements sur l&apos;Almanax</strong> (Takeza : +20 % sur la génération cible).</>,
            ]}
          />
          <Note ton="attention">
            <strong>Erreurs classiques</strong> : accoupler sans réserve fertile, extraire des montures pré-3.5 (une
            seule ressource), vendre un parent qu&apos;il fallait cloner, oublier que les Dorées sont 5 × plus lentes.
          </Note>
        </Section>

        <Section id="outils" titre="Outil XP" resume="Combien d'heures pour monter une monture." ouvert={o("outils")} {...p}>
          <OutilXp />
        </Section>

        <Section id="almanax" titre="Almanax" resume="Les bonus d'élevage mois par mois." ouvert={o("almanax")} {...p}>
          <Tableau
            legende="Bonus Almanax"
            entetes={["Mois", "Bonus"]}
            lignes={ALMANAX.map((l) => {
              const a = lireAlmanax(l);
              return [`${a.mois} (${a.dieu})`, a.bonus];
            })}
          />
          <p className="text-muted-foreground">
            Les bonus de jauges sont reformulés avec les noms 3.7 ; leur existence sous cette forme reste à vérifier.
          </p>
        </Section>

        <Section id="serveurs" titre="Serveurs" resume="Ce que disent les guides de chaque serveur." ouvert={o("serveurs")} {...p}>
          <Tableau legende="Serveurs" entetes={["Serveur", "Type", "Ce que disent les guides"]} lignes={SERVEURS.map((s) => [s.id, s.type, s.note])} />
          <p className="text-muted-foreground">Le mode Héroïque n&apos;existe plus sur DOFUS 3.</p>
        </Section>

        <Section id="sources" titre="Sources et doutes" resume="Guides utilisés, anciens noms, contradictions." ouvert={o("sources")} {...p}>
          <H3>Les guides utilisés</H3>
          <ul className="flex flex-col gap-1 pl-5 list-disc">
            {SOURCES.map(([t, u]) => (
              <li key={u}>
                <a href={u} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
                  {t}
                </a>
              </li>
            ))}
          </ul>
          <H3>Anciens noms → noms {VERSION_JEU}</H3>
          <Tableau
            legende="Anciens noms des jauges"
            entetes={["Ancien nom (guides anciens)", `Nom dans le jeu (${VERSION_JEU})`]}
            lignes={[
              ["Baffeur", "Sérénité −"],
              ["Caresseur", "Sérénité +"],
              ["Foudroyeur", "Endurance"],
              ["Abreuvoir", "Maturité"],
              ["Dragofesse", "Amour"],
              ["Mangeoire", "Expérience de monture (XP)"],
            ]}
          />
          <H3>Où les sources se contredisent</H3>
          <Tableau
            legende="Contradictions entre sources"
            entetes={["Sujet", "Version A", "Version B"]}
            lignes={[
              ["Bonus de l'Optimakina", "+10 % (3.5 : Next Stage, Pros, conseil final du guide Noobs non mis à jour)", "+20 % (3.7 : Noobs, Sigilos, JeuxEnd). Retenu : +20 %."],
              ["XP métier par accouplement", "10 XP × génération × monture", "30 × génération × monture"],
              ["Capacité de la jauge", "100 000 (3.5 : Next Stage, Pros, DAFOUS)", "200 000 (3.7 : Noobs, Duffus, Sigilos, JeuxEnd). Retenu : 200 000, paliers 80 / 140 / 180 / 200 k."],
              ["Durée de vidage du tier 4", "1 h 23 (tableau du guide Noobs, cohérent avec 20 000 ÷ 4 pts/s)", "42 min (résumé du même guide, valeur 3.5 restée)"],
              ["Durabilité des carburants", "1 000 à 5 000 (3.5)", "2 000 à 10 000 (3.7 : Noobs, JeuxEnd). Sigilos cite 6 000 pour un Normal, cohérent."],
              ["Animakina", "Capacité aléatoire (3.5)", "Choix du sexe du bébé (3.7 : Noobs, Sigilos). Retenu."],
              ["Probabilités de capacité", "27 / 27 / 27 / 14 / 5 % (3.5, avec Précoce)", "8 / 8 / 6 / 3 % (3.7 ; Précoce supprimée). Retenu."],
              ["Taxe de mise en vente à l'HDV", "1 % (Bonta/Brâkmar, bon alignement), 2 % (autre alignement), 5 % (Astrub) : taux donnés par un joueur (novembre 2026), cohérents avec le tutoriel officiel Dofus 3 (la taxe dépend de l'alignement et de l'HDV) ; non vérifiés officiellement", "Guides récents (dofocus.fr) : 2 % payés à la mise en vente, non remboursés si invendu. À vérifier en jeu au moment de la mise en vente (note du 21/11/2026). Défaut du simulateur : 2 %."],
              ["Bébés par accouplement", "1 (2 avec Reproducteur)", "« jusqu'à 4 » (guide qui mélange l'ancien système)"],
            ]}
          />
          <Note ton="attention">
            La version majoritaire ou la plus cohérente est retenue, mais compare toujours avec le jeu. Le simulateur
            suppose qu&apos;un bébé raté vaut le prix de la génération juste en dessous (ou ton prix forcé) et que le
            Reproducteur donne un second bébé avec les mêmes chances. Valeurs des visages de sérénité : milieu de chaque
            plage, à vérifier en jeu.
          </Note>
        </Section>
      </div>
    </Page>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ExternalLink, Maximize, Minus, Plus, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { champ } from "@/components/commun/champ";
import { CARTE_CODE as carte, chercher, lienGithub, relations, type Fichier } from "@/lib/carte-code";
import { cn } from "@/lib/utils";

/* Onglet « Pour les développeurs » (#85) : la carte du code, dessinée à la main en SVG à partir de
   `lib/carte-code.json` (positions déjà calculées par `scripts/export-carte-code.mjs`). Déplacement et zoom à la
   souris, au doigt (glisser, pincer) et au clavier ; recherche ; un clic sur un fichier affiche son résumé, ses
   dépendances dans les deux sens et son lien GitHub. Une liste en texte donne la même chose sans la carte. */

const { largeur: NL, hauteur: NH } = carte.noeud;
const K_MIN = 0.15;
const K_MAX = 3;
const borne = (k: number) => Math.min(K_MAX, Math.max(K_MIN, k));

/* Une teinte par couche, lisible en clair comme en sombre (contour coloré, fond très légèrement teinté). */
const TEINTES: Record<string, [number, number]> = {
  routes: [0.15, 35],
  features: [0.14, 150],
  shell: [0.15, 290],
  "ui-primitives": [0.12, 215],
  domain: [0.14, 75],
  tests: [0.15, 345],
  tooling: [0.03, 250],
};
const couleur = (couche: number) => {
  const [c, h] = TEINTES[carte.couches[couche].id] ?? [0.1, (couche * 51) % 360];
  return `oklch(0.62 ${c} ${h})`;
};

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
/* Date fixe lue dans la chaîne ISO : même rendu côté serveur et navigateur, quel que soit le fuseau. */
const dateAnalyse = (() => {
  const [a, m, j] = carte.analyseLe.slice(0, 10).split("-").map(Number);
  return a ? `${j} ${MOIS[m - 1]} ${a}` : "";
})();

type Vue = { x: number; y: number; k: number };

function chemin(a: Fichier, b: Fichier): string {
  const ya = a.y + NH / 2;
  const yb = b.y + NH / 2;
  if (a.x === b.x) {
    const x = a.x + NL;
    const d = 24 + Math.abs(yb - ya) * 0.12;
    return `M${x},${ya} C${x + d},${ya} ${x + d},${yb} ${x},${yb}`;
  }
  const [xa, xb] = b.x > a.x ? [a.x + NL, b.x] : [a.x, b.x + NL];
  const m = (xa + xb) / 2;
  return `M${xa},${ya} C${m},${ya} ${m},${yb} ${xb},${yb}`;
}

function Relation({ titre, liste, voir }: { titre: string; liste: number[]; voir: (i: number) => void }) {
  if (!liste.length) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {titre} ({liste.length})
      </h3>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {liste.map((j) => (
          <li key={j}>
            <button
              type="button"
              onClick={() => voir(j)}
              className="min-h-8 rounded-md border bg-background px-2 font-mono text-xs break-all outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              style={{ borderColor: couleur(carte.fichiers[j].couche) }}
            >
              {carte.fichiers[j].chemin}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CarteCode() {
  const [choisi, setChoisi] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [recherche, setRecherche] = useState("");
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const [vue, setVueEtat] = useState<Vue>({ x: 0, y: 0, k: 1 });
  const vueRef = useRef(vue);
  const setVue = useCallback((v: Vue) => {
    vueRef.current = v;
    setVueEtat(v);
  }, []);
  const cadre = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  const interagi = useRef(false);

  const resultats = useMemo(() => chercher(carte, recherche), [recherche]);
  const rel = useMemo(() => (choisi === null ? null : relations(carte, choisi)), [choisi]);
  const actifs = useMemo(() => {
    if (choisi !== null && rel) return new Set([choisi, ...Object.values(rel).flat()]);
    if (recherche.trim()) return new Set(resultats);
    return null;
  }, [choisi, rel, recherche, resultats]);

  const toutVoir = useCallback(
    (l = taille.l, h = taille.h) => {
      if (!l || !h) return;
      const k = borne(Math.min(l / carte.largeur, h / carte.hauteur));
      setVue({ k, x: (l - carte.largeur * k) / 2, y: (h - carte.hauteur * k) / 2 });
    },
    [taille, setVue],
  );

  /* Taille du cadre : la carte s'y ajuste tant qu'on ne l'a pas déplacée. */
  useEffect(() => {
    const el = cadre.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => {
      const l = Math.round(e.contentRect.width);
      const h = Math.round(e.contentRect.height);
      setTaille({ l, h });
      if (!interagi.current) toutVoir(l, h);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [toutVoir]);

  const zoomer = useCallback(
    (facteur: number, cx = taille.l / 2, cy = taille.h / 2) => {
      interagi.current = true;
      const v = vueRef.current;
      const k = borne(v.k * facteur);
      const r = k / v.k;
      setVue({ k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r });
    },
    [taille, setVue],
  );

  /* Molette : écouteur natif non passif, pour zoomer sans faire défiler la page. */
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const roue = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomer(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", roue, { passive: false });
    return () => el.removeEventListener("wheel", roue);
  }, [zoomer]);

  const centrer = useCallback(
    (i: number, zoom = true) => {
      if (!taille.l) return;
      interagi.current = true;
      const f = carte.fichiers[i];
      const k = zoom ? Math.max(vueRef.current.k, 0.9) : vueRef.current.k;
      setVue({ k, x: taille.l / 2 - (f.x + NL / 2) * k, y: taille.h / 2 - (f.y + NH / 2) * k });
    },
    [taille, setVue],
  );

  const choisir = (i: number, opts: { centrer?: boolean; defiler?: boolean } = {}) => {
    setChoisi(i);
    if (opts.centrer) centrer(i);
    if (opts.defiler)
      requestAnimationFrame(() => panneau.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  /* Glisser (un doigt ou la souris) et pincer (deux doigts). La capture du pointeur ne commence qu'après un
     vrai déplacement, sinon le clic sur un fichier serait perdu. */
  const pointeurs = useRef(new Map<number, { x: number; y: number }>());
  const depart = useRef<{ x: number; y: number; dist: number; vue: Vue } | null>(null);
  const glisse = useRef(false);
  const local = (e: PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const repartir = () => {
    const ps = [...pointeurs.current.values()];
    if (!ps.length) return (depart.current = null);
    const x = ps.reduce((a, p) => a + p.x, 0) / ps.length;
    const y = ps.reduce((a, p) => a + p.y, 0) / ps.length;
    const dist = ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0;
    depart.current = { x, y, dist, vue: vueRef.current };
  };
  const bas = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointeurs.current.set(e.pointerId, local(e));
    if (pointeurs.current.size === 1) glisse.current = false;
    repartir();
  };
  const bouge = (e: PointerEvent<SVGSVGElement>) => {
    if (!pointeurs.current.has(e.pointerId) || !depart.current) return;
    pointeurs.current.set(e.pointerId, local(e));
    const ps = [...pointeurs.current.values()];
    const d = depart.current;
    const x = ps.reduce((a, p) => a + p.x, 0) / ps.length;
    const y = ps.reduce((a, p) => a + p.y, 0) / ps.length;
    if (!glisse.current) {
      if (Math.hypot(x - d.x, y - d.y) < 5 && ps.length < 2) return;
      glisse.current = true;
      interagi.current = true;
      svg.current?.setPointerCapture(e.pointerId);
    }
    let k = d.vue.k;
    if (ps.length > 1 && d.dist > 0) k = borne(d.vue.k * (Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) / d.dist));
    const r = k / d.vue.k;
    setVue({ k, x: x - (d.x - d.vue.x) * r, y: y - (d.y - d.vue.y) * r });
  };
  const haut = (e: PointerEvent<SVGSVGElement>) => {
    pointeurs.current.delete(e.pointerId);
    repartir();
  };

  const clavier = (e: KeyboardEvent<HTMLDivElement>) => {
    const pas = 60;
    const v = vueRef.current;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => setVue({ ...v, x: v.x + pas }),
      ArrowRight: () => setVue({ ...v, x: v.x - pas }),
      ArrowUp: () => setVue({ ...v, y: v.y + pas }),
      ArrowDown: () => setVue({ ...v, y: v.y - pas }),
      "+": () => zoomer(1.25),
      "=": () => zoomer(1.25),
      "-": () => zoomer(0.8),
      "0": () => toutVoir(),
      Escape: () => setChoisi(null),
    };
    const action = actions[e.key];
    if (!action) return;
    e.preventDefault();
    interagi.current = true;
    action();
  };

  /* Un fichier atteint au clavier hors du cadre est ramené à l'écran. */
  const auFocus = (i: number) => {
    setFocus(i);
    const f = carte.fichiers[i];
    const v = vueRef.current;
    const x = f.x * v.k + v.x;
    const y = f.y * v.k + v.y;
    if (x < 0 || y < 0 || x + NL * v.k > taille.l || y + NH * v.k > taille.h) centrer(i, false);
  };

  const f = choisi === null ? null : carte.fichiers[choisi];
  const liensTries = useMemo(() => {
    const touche = (l: (typeof carte.liens)[number]) => choisi !== null && (l[0] === choisi || l[1] === choisi);
    return [...carte.liens].sort((a, b) => Number(touche(a)) - Number(touche(b)));
  }, [choisi]);

  const voir = (j: number) => choisir(j, { centrer: true });

  return (
    <div className="flex flex-col gap-4" data-testid="carte-code">
      {/* Grand écran : la carte à gauche, le détail à droite (collé en haut). Sinon : le détail au-dessus. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div
          ref={panneau}
          role="region"
          aria-label="Détail du fichier"
          aria-live="polite"
          data-testid="detail-code"
          className="z-20 scroll-mt-24 rounded-xl border bg-card p-4 text-card-foreground shadow-xs lg:sticky lg:top-20 lg:order-2 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto"
        >
          {f && rel ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="font-mono text-base font-semibold break-all">{f.chemin}</h2>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2.5 rounded-full" style={{ background: couleur(f.couche) }} aria-hidden />
                  {carte.couches[f.couche].nom}
                  {f.groupe && <> · {f.groupe}</>}
                </p>
              </div>
              <p className="text-sm">{f.resume}</p>
              <Relation titre="Importe" liste={rel.importe} voir={voir} />
              <Relation titre="Importé par" liste={rel.importePar} voir={voir} />
              <Relation titre="Testé par" liste={rel.testePar} voir={voir} />
              <Relation titre="Teste" liste={rel.teste} voir={voir} />
              <Relation titre="Autres liens" liste={rel.autres} voir={voir} />
              <a
                href={lienGithub(carte, f.chemin)}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "outline" }), "self-start")}
              >
                Voir sur GitHub <ExternalLink aria-hidden />
              </a>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Choisis un fichier sur la carte ou cherche-le : son rôle, ses dépendances et son lien GitHub s&apos;affichent
              ici.
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:order-1">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-0 flex-1 basis-56">
                <span className="sr-only">Chercher un fichier</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  type="search"
                  value={recherche}
                  placeholder="Chercher un fichier (nom ou rôle)"
                  onChange={(e) => setRecherche(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && resultats.length) {
                      e.preventDefault();
                      choisir(resultats[0], { centrer: true });
                    }
                  }}
                  className={cn(champ, "pl-9")}
                />
              </label>
              <div className="flex gap-1" role="group" aria-label="Zoom">
                <Button variant="outline" size="icon-lg" aria-label="Zoomer" onClick={() => zoomer(1.25)}>
                  <Plus />
                </Button>
                <Button variant="outline" size="icon-lg" aria-label="Dézoomer" onClick={() => zoomer(0.8)}>
                  <Minus />
                </Button>
                <Button
                  variant="outline"
                  size="icon-lg"
                  aria-label="Tout voir"
                  onClick={() => {
                    interagi.current = false;
                    toutVoir();
                  }}
                >
                  <Maximize />
                </Button>
              </div>
            </div>
            {recherche.trim() && (
              <div className="flex flex-wrap items-center gap-1.5 text-sm" aria-live="polite">
                <span className="text-muted-foreground">
                  {resultats.length ? `${resultats.length} fichier${resultats.length > 1 ? "s" : ""} :` : "Aucun fichier trouvé."}
                </span>
                {resultats.slice(0, 8).map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => choisir(i, { centrer: true, defiler: true })}
                    className="min-h-8 rounded-md border bg-background px-2 font-mono text-xs outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {carte.fichiers[i].chemin}
                  </button>
                ))}
                {resultats.length > 8 && <span className="text-muted-foreground">…</span>}
              </div>
            )}
          </div>

          <div
            ref={cadre}
            role="group"
            aria-label="Carte du code. Flèches pour déplacer, + et − pour zoomer, 0 pour tout voir."
            onKeyDown={clavier}
            className="relative h-[60vh] max-h-[720px] min-h-[360px] overflow-hidden rounded-xl border bg-card/50"
          >
            <svg
              ref={svg}
              width="100%"
              height="100%"
              viewBox={taille.l ? `0 0 ${taille.l} ${taille.h}` : undefined}
              className="block cursor-grab touch-none select-none active:cursor-grabbing"
              onPointerDown={bas}
              onPointerMove={bouge}
              onPointerUp={haut}
              onPointerCancel={haut}
              onClick={(e) => {
                if (e.target === svg.current && !glisse.current) setChoisi(null);
              }}
            >
              {taille.l > 0 && (
                <g transform={`translate(${vue.x} ${vue.y}) scale(${vue.k})`}>
                  {carte.couches.map((c, i) => (
                    <text key={c.id} x={c.x} y={30} className="fill-foreground text-[13px] font-semibold">
                      {c.titre.map((ligne, j) => (
                        <tspan key={j} x={c.x} dy={j ? 16 : 0}>
                          {ligne}
                        </tspan>
                      ))}
                      <tspan fill={couleur(i)} dx={6}>
                        ●
                      </tspan>
                    </text>
                  ))}
                  {carte.groupes.map((g) => (
                    <g key={`${g.couche}-${g.nom}`} aria-hidden>
                      <rect
                        x={carte.couches[g.couche].x - 8}
                        y={g.y}
                        width={NL + 16}
                        height={g.hauteur}
                        rx={10}
                        className="fill-muted/40 stroke-border"
                        strokeDasharray="4 3"
                      />
                      <text x={carte.couches[g.couche].x} y={g.y + 16} className="fill-muted-foreground text-[11px]">
                        {g.nom}
                      </text>
                    </g>
                  ))}
                  <g fill="none" aria-hidden>
                    {liensTries.map(([s, c, type]) => {
                      const touche = choisi !== null && (s === choisi || c === choisi);
                      const visible = actifs === null || (actifs.has(s) && actifs.has(c));
                      return (
                        <path
                          key={`${s}-${c}-${type}`}
                          d={chemin(carte.fichiers[s], carte.fichiers[c])}
                          className={touche ? "stroke-primary" : "stroke-muted-foreground"}
                          strokeWidth={touche ? 2 : 1}
                          strokeOpacity={touche ? 0.9 : visible && choisi === null ? 0.2 : 0.05}
                          strokeDasharray={type === "imports" ? undefined : type === "tested_by" ? "5 3" : "2 3"}
                        />
                      );
                    })}
                  </g>
                  {carte.fichiers.map((fi, i) => {
                    const estChoisi = choisi === i;
                    const attenue = actifs !== null && !actifs.has(i);
                    return (
                      <g
                        key={fi.chemin}
                        role="button"
                        tabIndex={0}
                        aria-pressed={estChoisi}
                        aria-label={`${fi.chemin} (${carte.couches[fi.couche].nom})`}
                        data-testid={`fichier-${fi.chemin}`}
                        transform={`translate(${fi.x} ${fi.y})`}
                        opacity={attenue ? 0.25 : 1}
                        className="cursor-pointer outline-none"
                        onClick={() => {
                          if (!glisse.current) choisir(i, { defiler: true });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            choisir(i, { defiler: true });
                          }
                        }}
                        onFocus={() => auFocus(i)}
                        onBlur={() => setFocus(null)}
                      >
                        <title>{fi.chemin}</title>
                        <rect
                          width={NL}
                          height={NH}
                          rx={7}
                          fill={`color-mix(in oklch, ${couleur(fi.couche)} ${estChoisi ? 45 : 14}%, var(--card))`}
                          stroke={focus === i ? "var(--ring)" : couleur(fi.couche)}
                          strokeWidth={estChoisi || focus === i ? 3 : 1.5}
                        />
                        <text x={10} y={NH / 2 + 4} className="fill-foreground font-mono text-[11.5px]">
                          {fi.etiquette}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}
            </svg>
          </div>

          <div className="flex flex-col gap-2 text-xs text-muted-foreground">
            <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Couches">
              {carte.couches.map((c, i) => (
                <li key={c.id} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ background: couleur(i) }} aria-hidden />
                  {c.nom} ({carte.fichiers.filter((fi) => fi.couche === i).length})
                </li>
              ))}
            </ul>
            <p>
              Glisse pour déplacer, molette ou pincement pour zoomer. Trait plein : import ; tirets : test ; pointillés :
              configuration ou documentation.
            </p>
            <p data-testid="carte-code-source">
              Graphe analysé le {dateAnalyse}, au commit{" "}
              <a
                href={`${carte.depot}/commit/${carte.commit}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-primary underline-offset-4 hover:underline"
              >
                {carte.commit.slice(0, 7)}
              </a>
              , avec le plugin Understand-Anything. {carte.fichiers.length} fichiers, mis à jour à la main.
            </p>
          </div>
        </div>
      </div>

      <details className="rounded-xl border p-3" data-testid="liste-code">
        <summary className="min-h-8 cursor-pointer font-medium">Liste complète en texte</summary>
        <div className="mt-3 flex flex-col gap-4">
          {carte.couches.map((c, i) => (
            <section key={c.id} aria-labelledby={`code-${c.id}`}>
              <h3 id={`code-${c.id}`} className="flex items-center gap-1.5 font-semibold">
                <span className="size-2.5 rounded-full" style={{ background: couleur(i) }} aria-hidden />
                {c.nom}
              </h3>
              <p className="text-sm text-muted-foreground">{c.description}</p>
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {carte.fichiers.map((fi, j) =>
                  fi.couche === i ? (
                    <li key={fi.chemin}>
                      <button
                        type="button"
                        onClick={() => choisir(j, { centrer: true, defiler: true })}
                        className="font-mono font-medium break-all text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {fi.chemin}
                      </button>{" "}
                      : {fi.resume}
                    </li>
                  ) : null,
                )}
              </ul>
            </section>
          ))}
        </div>
      </details>
    </div>
  );
}

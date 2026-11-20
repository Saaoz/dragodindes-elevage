import type { Visage } from "@/lib/enclos";
import { cn } from "@/lib/utils";

/* Visages de sérénité dessinés en SVG (#4 : remplacent « :C :( :) :D »), couleurs proches du jeu :
   rouge triste (Endurance), bleu moue (Endurance + Maturité), violet sourire (Maturité + Amour),
   vert grand sourire (Amour). Décoratifs : le texte voisin ou l'aria-label du bouton les nomme. */
const FOND: Record<Visage["id"], string> = {
  rouge: "#dc2626",
  bleu: "#2563eb",
  violet: "#7c3aed",
  vert: "#16a34a",
};

const BOUCHE: Record<Visage["id"], string> = {
  rouge: "M10 23.5 Q16 17.5 22 23.5", // triste
  bleu: "M11 22.5 Q16 20 21 22.5", // moue
  violet: "M11 20.5 Q16 24 21 20.5", // sourire
  vert: "M9.5 19 Q16 27 22.5 19 Z", // grand sourire, bouche ouverte
};

export function VisageIcone({ id, className }: { id: Visage["id"]; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden focusable="false" className={cn("size-6 shrink-0", className)}>
      <circle cx="16" cy="16" r="15" fill={FOND[id]} />
      <circle cx="16" cy="16" r="15" fill="none" stroke="#000" strokeOpacity=".15" strokeWidth="1" />
      {id === "rouge" ? (
        <>
          {/* sourcils froncés */}
          <path d="M8.5 10.5 L13.5 12.5 M23.5 10.5 L18.5 12.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="11.5" cy="15" r="1.9" fill="#fff" />
          <circle cx="20.5" cy="15" r="1.9" fill="#fff" />
        </>
      ) : (
        <>
          <circle cx="11.5" cy="13.5" r="1.9" fill="#fff" />
          <circle cx="20.5" cy="13.5" r="1.9" fill="#fff" />
        </>
      )}
      <path
        d={BOUCHE[id]}
        fill={id === "vert" ? "#fff" : "none"}
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

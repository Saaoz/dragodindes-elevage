import { Droplet, Heart, Star, Zap } from "lucide-react";
import type { AUTRES_JAUGES } from "@/lib/schema";
import { cn } from "@/lib/utils";

type Jauge = (typeof AUTRES_JAUGES)[number];

const ICONES = { Endurance: Zap, Maturité: Droplet, Amour: Heart, "Expérience de monture": Star } as const;
const COULEURS: Record<Jauge, string> = {
  Endurance: "text-amber-600 dark:text-amber-400",
  Maturité: "text-sky-600 dark:text-sky-400",
  Amour: "text-rose-600 dark:text-rose-400",
  "Expérience de monture": "text-yellow-600 dark:text-yellow-300",
};

/* Icône d'une jauge secondaire (remplace les émojis ⚡ 💧 ❤ ⭐). Décorative : le nom est toujours écrit à côté. */
export function IconeJauge({ jauge, className }: { jauge: Jauge; className?: string }) {
  const I = ICONES[jauge];
  return <I aria-hidden className={cn("size-4 shrink-0", COULEURS[jauge], className)} />;
}

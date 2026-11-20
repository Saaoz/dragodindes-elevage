import { Clock } from "lucide-react";
import { libelleAge } from "@/lib/rentabilite";
import { cn } from "@/lib/utils";

/* Badge d'ancienneté d'un prix : neutre, ou orange au-delà de 7 jours (« pense à le relever »). */
export function AgePrix({ jours, className }: { jours: number | null; className?: string }) {
  const a = libelleAge(jours);
  if (!a) return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs whitespace-nowrap",
        a.vieux ? "bg-warning/15 font-medium text-warning" : "bg-muted text-muted-foreground",
        className,
      )}
      title={a.vieux ? "Prix relevé il y a plus de 7 jours : pense à le mettre à jour" : "Date du relevé"}
    >
      {a.vieux && <Clock className="size-3" aria-hidden />}
      {a.texte}
    </span>
  );
}

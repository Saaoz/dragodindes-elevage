"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OptionChoix<T> {
  valeur: T;
  label: React.ReactNode;
  /* nom accessible si le label n'est pas du texte simple */
  aria?: string;
  icone?: React.ReactNode;
}

/* Groupe de boutons à choix unique (aria-pressed), contrasté dans les deux thèmes (#4) :
   sélectionné = fond vert plein + coche ; non sélectionné = contour, texte au contraste normal. */
export function Choix<T extends string | number | null>({
  options,
  valeur,
  onChange,
  label,
  taille = "md",
  className,
  disabled,
}: {
  options: readonly OptionChoix<T>[];
  valeur: T;
  onChange: (v: T) => void;
  label: string;
  taille?: "sm" | "md";
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const on = o.valeur === valeur;
        return (
          <button
            key={String(o.valeur)}
            type="button"
            aria-pressed={on}
            aria-label={o.aria}
            disabled={disabled}
            onClick={() => onChange(o.valeur)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
              taille === "sm" ? "h-8 px-2.5 text-[0.8rem]" : "h-9 px-3 text-sm",
              on
                ? "border-primary bg-primary text-primary-foreground shadow-sm [&_svg]:text-current!"
                : "border-input bg-background text-foreground hover:bg-muted dark:bg-input/20",
            )}
          >
            {on && <Check className="size-3.5 shrink-0" aria-hidden />}
            {o.icone}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { useId, useState } from "react";
import { champ } from "@/components/commun/champ";
import { fmt, parseKamas } from "@/lib/calc";
import { cn } from "@/lib/utils";

/* Champ de montant en kamas : « 250k », « 1,5M », « 1 200 000 »… Validé en quittant le champ (ou Entrée).
   Vide = 0 (prix effacé). Un texte illisible n'est jamais enregistré : message d'erreur à la place. */
export function ChampKamas({
  valeur,
  onValider,
  label,
  cacherLabel = false,
  placeholder = "ex. 250k",
  disabled,
  className,
}: {
  valeur: number;
  onValider: (v: number) => void;
  label: string;
  cacherLabel?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const affiche = valeur > 0 ? fmt(valeur) : "";
  const [texte, setTexte] = useState(affiche);
  const [base, setBase] = useState(valeur);
  const [erreur, setErreur] = useState(false);
  /* valeur changée ailleurs (collage, import, autre serveur) : on resynchronise le texte */
  if (base !== valeur) {
    setBase(valeur);
    setTexte(affiche);
    setErreur(false);
  }

  const valider = () => {
    const t = texte.trim();
    if (t === "") {
      setErreur(false);
      if (valeur !== 0) onValider(0);
      return;
    }
    const v = parseKamas(t);
    if (v === null) return setErreur(true);
    setErreur(false);
    setTexte(v > 0 ? fmt(v) : "");
    if (v !== valeur) onValider(v);
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className={cn("text-sm font-medium", cacherLabel && "sr-only")}>
        {label}
      </label>
      <input
        id={id}
        className={cn(champ, "tabular-nums")}
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={placeholder}
        value={texte}
        disabled={disabled}
        aria-invalid={erreur || undefined}
        aria-describedby={erreur ? `${id}-err` : undefined}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={valider}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            valider();
          }
        }}
      />
      {erreur && (
        <p id={`${id}-err`} className="text-xs text-destructive">
          Format : 250000, 250k, 1,5M
        </p>
      )}
    </div>
  );
}

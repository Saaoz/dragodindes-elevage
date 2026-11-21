"use client";

import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LIBELLE_CHOIX, type MethodeRappel } from "@/lib/rappel";
import { cn } from "@/lib/utils";

/* Choix de la façon d'être rappelé (#51) : dialogue modal, focus piégé, Échap pour fermer, et le focus
   revient au bouton qui l'a ouvert. Ne liste QUE les méthodes disponibles sur l'appareil, la meilleure d'abord. */
export function ChoixRappel({
  open,
  onOpenChange,
  nom,
  heure,
  methodes,
  initiale,
  rappelActif,
  onConfirmer,
  onAnnulerRappel,
  finalFocus,
}: {
  open: boolean;
  /** Où va le focus à la fermeture (true : là où il était ; false : l'appelant le place lui-même). */
  finalFocus: () => boolean;
  onOpenChange: (ouvert: boolean) => void;
  nom: string;
  /** Heure du rappel, déjà formatée (« 21 h 24 »). */
  heure: string;
  methodes: readonly MethodeRappel[];
  /** Méthode cochée à l'ouverture. */
  initiale: MethodeRappel;
  /** Un rappel est déjà programmé pour cet enclos : on peut l'annuler. */
  rappelActif: boolean;
  onConfirmer: (m: MethodeRappel) => void;
  onAnnulerRappel: () => void;
}) {
  const focusInitial = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Popup
          initialFocus={focusInitial}
          finalFocus={finalFocus}
          data-testid="choix-rappel"
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border bg-card p-5 text-card-foreground shadow-lg outline-none"
        >
          <Contenu
            nom={nom}
            heure={heure}
            methodes={methodes}
            initiale={initiale}
            rappelActif={rappelActif}
            focusInitial={focusInitial}
            onConfirmer={onConfirmer}
            onAnnulerRappel={onAnnulerRappel}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Contenu({
  nom,
  heure,
  methodes,
  initiale,
  rappelActif,
  focusInitial,
  onConfirmer,
  onAnnulerRappel,
}: {
  nom: string;
  heure: string;
  methodes: readonly MethodeRappel[];
  initiale: MethodeRappel;
  rappelActif: boolean;
  focusInitial: React.RefObject<HTMLElement | null>;
  onConfirmer: (m: MethodeRappel) => void;
  onAnnulerRappel: () => void;
}) {
  /* l'état vit ici : le contenu est démonté à la fermeture, donc chaque ouverture repart de `initiale` */
  const [choix, setChoix] = useState<MethodeRappel>(initiale);
  return (
    <>
      <div className="flex flex-col gap-1">
        <Dialog.Title className="flex items-center gap-2 text-lg font-semibold">
          <BellRing className="size-5 text-primary" aria-hidden />
          Comment te rappeler ?
        </Dialog.Title>
        <Dialog.Description className="text-sm text-muted-foreground">
          Rappel pour {nom} à {heure}. Tu pourras changer ce choix à tout moment.
        </Dialog.Description>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Façon d’être rappelé</legend>
        {methodes.map((m) => (
          <label
            key={m}
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/20",
              m === "google" && "ml-6",
            )}
          >
            <input
              ref={m === initiale ? (el) => void (focusInitial.current = el) : undefined}
              type="radio"
              name="methode-rappel"
              value={m}
              checked={choix === m}
              onChange={() => setChoix(m)}
              className="mt-0.5 size-5 shrink-0 accent-primary"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{LIBELLE_CHOIX[m].titre}</span>
              <span className="text-muted-foreground">{LIBELLE_CHOIX[m].detail}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {rappelActif && (
          <Button variant="ghost" className="mr-auto h-11 px-3" onClick={onAnnulerRappel}>
            Annuler le rappel
          </Button>
        )}
        <Dialog.Close render={<Button variant="outline" className="h-11 px-4" />}>Fermer</Dialog.Close>
        <Button className="h-11 px-4" onClick={() => onConfirmer(choix)}>
          Me rappeler à {heure}
        </Button>
      </div>
    </>
  );
}

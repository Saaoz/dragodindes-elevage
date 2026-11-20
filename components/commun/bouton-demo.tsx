"use client";

import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUi } from "@/components/app-state";

/* Entrer / sortir du mode démo (données fictives en mémoire, isolées des vraies). */
export function BoutonDemo() {
  const demo = useUi((u) => u.demo);
  const setDemo = useUi((u) => u.setDemo);
  return (
    <Button variant="outline" size="lg" aria-pressed={demo} onClick={() => setDemo(!demo)}>
      <FlaskConical aria-hidden />
      {demo ? "Quitter la démo" : "Voir une démo"}
    </Button>
  );
}

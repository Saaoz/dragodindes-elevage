/* Onglet « Pour les développeurs » : emplacement de la carte du code (#85, étapes 2 et 3).
   Plus tard, ce composant chargera `public/carte-code.json` (fichiers, couches, dépendances, résumés et positions
   déjà calculées, produits par `scripts/export-carte-code.mjs`) et dessinera le SVG. Pour l'instant : état d'attente. */
export function CarteCode() {
  return (
    <div
      data-testid="carte-code-attente"
      className="rounded-xl border border-dashed bg-muted/40 p-6 text-center text-muted-foreground"
    >
      <p>La carte du code arrive bientôt : elle sera générée à partir du code du projet.</p>
    </div>
  );
}

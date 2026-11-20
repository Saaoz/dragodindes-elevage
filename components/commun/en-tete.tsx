import { cn } from "@/lib/utils";

/* Conteneur de page + titre : une seule largeur et un seul rythme pour toutes les sections. */
export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <main id="contenu" tabIndex={-1} className={cn("mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pt-5 outline-none sm:px-6 sm:pt-8", className)}>
      {children}
    </main>
  );
}

export function EnTete({
  titre,
  children,
  actions,
}: {
  titre: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 flex-1 basis-72">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{titre}</h1>
        {children && <p className="mt-1 max-w-prose text-sm text-muted-foreground sm:text-base">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

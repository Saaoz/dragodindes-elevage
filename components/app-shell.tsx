"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Coins, Fence, House, RefreshCw, TriangleAlert, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useHydratation, useUi } from "@/components/app-state";
import { VERSION_JEU } from "@/lib/data";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const SECTIONS = [
  { href: "/", label: "Accueil", icone: House },
  { href: "/enclos", label: "Enclos", icone: Fence },
  { href: "/rentabilite", label: "Rentabilité", icone: Coins },
  { href: "/guide", label: "Guide", icone: BookOpen },
] as const;

const actif = (chemin: string, href: string) => (href === "/" ? chemin === "/" : chemin.startsWith(href));

/* Logo : l'œuf de l'icône de l'appli, dessiné en SVG (net à toutes les tailles). */
function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className="size-8 shrink-0">
      <rect width="32" height="32" rx="9" fill="#166534" />
      <ellipse cx="16" cy="17.5" rx="8" ry="10" fill="#fef3c7" />
      <circle cx="13" cy="14" r="1.8" fill="#d97706" />
      <circle cx="19" cy="19" r="2.2" fill="#d97706" />
      <circle cx="14.5" cy="22" r="1.3" fill="#d97706" />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  useHydratation();
  const chemin = usePathname() ?? "/";
  const demo = useUi((u) => u.demo);
  const setDemo = useUi((u) => u.setDemo);
  const futureVersion = useStore((s) => s.futureVersion);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenu"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Aller au contenu
      </a>
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Logo />
            <span className="leading-tight">
              <span className="block font-semibold">Dragodindes</span>
              <span className="block text-xs text-muted-foreground">Élevage · DOFUS {VERSION_JEU}</span>
            </span>
          </Link>
          <nav aria-label="Navigation principale" className="ml-4 hidden md:block">
            <ul className="flex items-center gap-1">
              {SECTIONS.map(({ href, label, icone: Icone }) => {
                const on = actif(chemin, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                        on ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                      )}
                    >
                      <Icone className="size-4" aria-hidden />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {futureVersion && (
        <div role="alert" className="border-b border-warning/40 bg-warning/10">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-2.5 text-sm sm:px-6">
            <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
            <p className="flex-1 font-medium">
              Une version plus récente de l&apos;appli a été utilisée sur cet appareil : recharge la page. En attendant,
              rien n&apos;est enregistré et l&apos;import est désactivé.
            </p>
            <Button size="sm" variant="outline" onClick={() => location.reload()}>
              <RefreshCw aria-hidden /> Recharger
            </Button>
          </div>
        </div>
      )}
      {demo && (
        <div role="status" className="border-b border-sky-500/40 bg-sky-500/10" data-testid="banniere-demo">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-2.5 text-sm sm:px-6">
            <FlaskConical className="size-4 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden />
            <p className="flex-1">
              <strong>Mode démo</strong> : prix et enclos fictifs. Rien n&apos;est enregistré, tes vraies données ne sont
              pas touchées.
            </p>
            <Button size="sm" variant="outline" onClick={() => setDemo(false)}>
              Quitter la démo
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
        <footer className="mx-auto w-full max-w-5xl px-4 pt-6 pb-6 text-xs text-muted-foreground sm:px-6">
          Outil de fan non officiel. DOFUS est une marque d&apos;Ankama. Tes données restent dans ce navigateur.
        </footer>
      </div>

      <nav
        aria-label="Navigation principale (mobile)"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-md grid-cols-4">
          {SECTIONS.map(({ href, label, icone: Icone }) => {
            const on = actif(chemin, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-0.5 text-xs font-medium outline-none focus-visible:bg-muted",
                    on ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                      on && "bg-primary text-primary-foreground",
                    )}
                  >
                    <Icone className="size-5" aria-hidden />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

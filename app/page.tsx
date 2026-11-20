import Link from "next/link";
import { InstallApp } from "@/components/install-app";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">Élevage de dragodindes</h1>
      <Link
        href="/enclos"
        className="flex flex-col gap-1 rounded-xl border-2 border-primary bg-primary/10 p-4 hover:bg-primary/15"
      >
        <span className="text-lg font-semibold">Mes enclos →</span>
        <span className="text-sm text-muted-foreground">À quelle heure revenir à chaque enclos : sérénité, rappels agenda.</span>
      </Link>
      <p className="text-lg font-medium">Migration en cours</p>
      <p className="text-muted-foreground">
        Cet outil de calcul pour l&apos;élevage de dragodindes (Dofus 3.5) est en cours de
        migration vers Next.js. La version actuelle (v2) reste disponible dans le dossier{" "}
        <code className="rounded bg-muted px-1">legacy/</code> du dépôt : double-clique sur{" "}
        <code className="rounded bg-muted px-1">legacy/index.html</code>, sans aucune installation.
      </p>
      <p>
        <a className="underline underline-offset-4" href="/legacy/index.html">
          Ouvrir la v2 (copie servie par cette application)
        </a>
      </p>
      <InstallApp />
      <div>
        <ThemeToggle />
      </div>
      <p className="text-sm text-muted-foreground">
        Outil de fan non officiel. DOFUS est une marque d&apos;Ankama.
      </p>
    </main>
  );
}

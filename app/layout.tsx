import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { SwRegister } from "@/components/sw-register";
import { AppShell } from "@/components/app-shell";
import { VERSION_JEU } from "@/lib/data";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const DESCRIPTION = `Outil de fan non officiel pour l'élevage de dragodindes (DOFUS ${VERSION_JEU}) : heure de retour à l'enclos, rentabilité d'un couple, guide.`;

export const metadata: Metadata = {
  /* adresse publique : les liens de la miniature de partage (og:image) sont absolus */
  metadataBase: new URL("https://elevage-dofus.saaoz.fr"),
  title: { default: "Élevage de dragodindes", template: "%s · Élevage de dragodindes" },
  description: DESCRIPTION,
  /* aperçu des liens partagés (Discord, réseaux) : l'image vient de app/opengraph-image.tsx */
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "Élevage de dragodindes",
    title: "Élevage de dragodindes",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "Élevage de dragodindes", description: DESCRIPTION },
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Dragodindes", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#166534" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1a14" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AppShell>{children}</AppShell>
          <SwRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}

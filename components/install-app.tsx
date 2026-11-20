"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallApp() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- détection navigateur, impossible côté serveur
    setIos(isIos());
    setInstalled(isStandalone());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  if (!event && !ios) return null;

  return (
    <section aria-label="Installer l'appli" className="rounded-lg border p-4">
      <h2 className="font-medium">Installer l&apos;appli</h2>
      {event ? (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            Utilisable hors ligne, comme une vraie appli.
          </p>
          <Button
            onClick={async () => {
              await event.prompt();
              await event.userChoice;
              setEvent(null);
            }}
          >
            Installer l&apos;appli
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Safari → Partager → Sur l&apos;écran d&apos;accueil (obligatoire pour les notifications).
        </p>
      )}
    </section>
  );
}

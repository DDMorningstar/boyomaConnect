"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Download, RefreshCw, WifiOff, X } from "lucide-react";
import { LogoMark } from "@/components/layout/logo";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const VIEWS_KEY = "boyoma.place-views";
const DISMISS_KEY = "boyoma.install-dismissed";
const safeGet = (k: string) => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string, v: string) => {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* stockage indisponible */
  }
};

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Bandeau réseau + enregistrement du Service Worker + proposition de mise à jour. */
export function PwaManager() {
  const online = useOnline();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const pathname = usePathname() ?? "";
  const [installEvent, setInstallEvent] = useState<InstallPrompt | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  // Proposition d'installation : seulement si le navigateur la permet réellement (aucun faux bouton).
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  // Moment opportun : après la consultation de 2 fiches, pas plus d'une fois par mois si refusée.
  useEffect(() => {
    if (pathname.startsWith("/lieux/")) safeSet(VIEWS_KEY, String(Number(safeGet(VIEWS_KEY) ?? 0) + 1));
    const views = Number(safeGet(VIEWS_KEY) ?? 0);
    const dismissed = Number(safeGet(DISMISS_KEY) ?? 0);
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
    setShowInstall(
      Boolean(installEvent) && !standalone && views >= 2 && Date.now() - dismissed > 30 * 86_400_000,
    );
  }, [pathname, installEvent]);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (reg.waiting) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
          });
        });
      })
      .catch(() => {
        /* SW non supporté ou bloqué : l'application fonctionne sans */
      });
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!reloaded) {
        reloaded = true;
        window.location.reload();
      }
    });
  }, []);

  return (
    <>
      {!online && (
        <div
          role="status"
          className="bg-night fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-sm text-white"
        >
          <WifiOff className="size-4" aria-hidden="true" />
          Hors connexion — fiches déjà consultées et favoris disponibles. Recherche et carte indisponibles.
        </div>
      )}
      {showInstall && installEvent && !waiting && (
        <div
          role="dialog"
          aria-label="Installer l'application"
          className="animate-fade-up bg-surface border-line fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border p-3 shadow-[var(--shadow-float)] md:bottom-6"
        >
          <LogoMark className="size-11" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Installer Boyoma Connect</p>
            <p className="text-muted text-xs">Accès en un geste, même avec peu de réseau.</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await installEvent.prompt();
              await installEvent.userChoice.catch(() => undefined);
              setInstallEvent(null);
              setShowInstall(false);
            }}
            className="bg-brand inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold text-white"
          >
            <Download className="size-4" aria-hidden="true" /> Installer
          </button>
          <button
            type="button"
            onClick={() => {
              safeSet(DISMISS_KEY, String(Date.now()));
              setShowInstall(false);
            }}
            className="text-muted hover:bg-surface-2 rounded-full p-1.5"
            aria-label="Plus tard"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      {waiting && (
        <div className="bg-night fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl p-3 pl-4 text-sm text-white shadow-[var(--shadow-float)] md:bottom-6">
          Une nouvelle version est disponible.
          <button
            type="button"
            onClick={() => waiting.postMessage("SKIP_WAITING")}
            className="bg-brand inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold"
          >
            <RefreshCw className="size-4" aria-hidden="true" /> Mettre à jour
          </button>
        </div>
      )}
    </>
  );
}

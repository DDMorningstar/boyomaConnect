"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { RefreshCw, WifiOff } from "lucide-react";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/** Bandeau réseau + enregistrement du Service Worker + proposition de mise à jour. */
export function PwaManager() {
  const online = useOnline();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

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
        <div role="status" className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-night px-4 py-2 text-sm text-white">
          <WifiOff className="size-4" aria-hidden="true" />
          Hors connexion — fiches déjà consultées et favoris disponibles. Recherche et carte indisponibles.
        </div>
      )}
      {waiting && (
        <div className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-night p-3 pl-4 text-sm text-white shadow-[var(--shadow-float)] md:bottom-6">
          Une nouvelle version est disponible.
          <button
            type="button"
            onClick={() => waiting.postMessage("SKIP_WAITING")}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 font-semibold"
          >
            <RefreshCw className="size-4" aria-hidden="true" /> Mettre à jour
          </button>
        </div>
      )}
    </>
  );
}

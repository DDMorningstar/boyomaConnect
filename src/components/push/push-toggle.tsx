"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { removePushSubscription, savePushSubscription } from "@/features/push/actions";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyToBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "unsupported" | "unconfigured" | "denied" | "off" | "on" | "busy";

/**
 * Notifications sur ce téléphone (nouvelles demandes de clients, bilan de la semaine).
 * Masqué si le navigateur ne les gère pas ; expliqué si l'envoi n'est pas encore configuré.
 */
export function PushToggle({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>("busy");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState("unsupported");
      }
      if (!PUBLIC_KEY) return setState("unconfigured");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setError(null);
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(PUBLIC_KEY),
      });
      const r = await savePushSubscription(sub.toJSON());
      if (r.error) {
        await sub.unsubscribe();
        setError(r.error);
        return setState("off");
      }
      setState("on");
    } catch {
      setError("Activation impossible sur cet appareil.");
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
  }

  if (state === "unsupported") return null;
  return (
    <div className={`border-line bg-surface rounded-2xl border ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-center gap-3">
        {state === "on" ? (
          <Bell className="text-brand size-5" aria-hidden="true" />
        ) : (
          <BellOff className="text-muted size-5" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Notifications sur ce téléphone</p>
          <p className="text-muted text-xs">
            {state === "unconfigured"
              ? "Bientôt disponible : l'envoi des notifications n'est pas encore configuré."
              : state === "denied"
                ? "Bloquées dans votre navigateur : autorisez-les dans les réglages du site."
                : "Soyez prévenu à chaque nouvelle demande de client et recevez votre bilan de la semaine."}
          </p>
        </div>
        {(state === "off" || state === "on" || state === "busy") && (
          <button
            type="button"
            disabled={state === "busy"}
            onClick={state === "on" ? disable : enable}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold disabled:opacity-50 ${
              state === "on"
                ? "border-line hover:bg-surface-2 border"
                : "bg-brand hover:bg-brand-strong text-white"
            }`}
          >
            {state === "busy" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {state === "on" ? "Désactiver" : "Activer"}
          </button>
        )}
      </div>
      {error && <p className="text-danger mt-2 text-xs">{error}</p>}
    </div>
  );
}

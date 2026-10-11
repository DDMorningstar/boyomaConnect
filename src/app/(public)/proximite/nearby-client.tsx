"use client";
import { useState } from "react";
import { LocateFixed, Loader2, MapPinOff } from "lucide-react";
import { PlaceCard, PlaceCardSkeleton } from "@/components/places/place-card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PlaceSearchRow } from "@/types/places";

const RADII = [500, 1000, 2000, 5000] as const;

/** La position n'est demandée qu'au clic, et n'est jamais enregistrée côté serveur. */
export function NearbyClient() {
  const [state, setState] = useState<"idle" | "locating" | "loading" | "done" | "denied" | "error">("idle");
  const [rows, setRows] = useState<PlaceSearchRow[]>([]);
  const [radius, setRadius] = useState<(typeof RADII)[number]>(2000);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);

  async function load(p: { lat: number; lng: number }, r: number) {
    setState("loading");
    const { data, error } = await getSupabaseBrowserClient().rpc("search_places", {
      p_latitude: p.lat,
      p_longitude: p.lng,
      p_radius_m: r,
      p_sort: "distance",
      p_limit: 50,
    });
    if (error) return setState("error");
    setRows((data as PlaceSearchRow[]) ?? []);
    setState("done");
  }

  function locate() {
    if (!navigator.geolocation) return setState("error");
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (g) => {
        const p = { lat: g.coords.latitude, lng: g.coords.longitude };
        setPos(p);
        void load(p, radius);
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  if (state === "idle" || state === "locating") {
    return (
      <div className="border-line bg-surface mt-6 flex flex-col items-center rounded-[var(--radius-card)] border p-8 text-center">
        <span className="bg-brand/10 text-brand flex size-16 items-center justify-center rounded-full">
          <LocateFixed className="size-8" aria-hidden="true" />
        </span>
        <p className="text-muted mt-4 max-w-xs text-sm">
          Autorisez l&apos;accès à votre position pour afficher les lieux les plus proches. Elle n&apos;est
          pas conservée.
        </p>
        <button
          type="button"
          onClick={locate}
          disabled={state === "locating"}
          className="bg-brand mt-5 inline-flex min-h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold text-white disabled:opacity-60"
        >
          {state === "locating" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} Utiliser ma
          position
        </button>
      </div>
    );
  }
  if (state === "denied") {
    return (
      <div className="mt-6">
        <EmptyState icon={<MapPinOff className="size-10" />} title="Position refusée">
          Activez la localisation pour ce site dans les réglages du navigateur, ou utilisez la recherche par
          commune.
        </EmptyState>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="mt-6">
        <EmptyState
          title="Impossible d'obtenir les résultats"
          action={
            <button
              type="button"
              onClick={locate}
              className="bg-brand rounded-full px-5 py-2.5 text-sm font-semibold text-white"
            >
              Réessayer
            </button>
          }
        >
          Vérifiez votre connexion et le GPS de votre appareil.
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-2" role="group" aria-label="Rayon">
        {RADII.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={radius === r}
            onClick={() => {
              setRadius(r);
              if (pos) void load(pos, r);
            }}
            className={`min-h-10 rounded-full border px-3.5 text-sm font-medium ${radius === r ? "border-brand bg-brand text-white" : "border-line bg-surface"}`}
          >
            {r < 1000 ? `${r} m` : `${r / 1000} km`}
          </button>
        ))}
      </div>
      {state === "loading" ? (
        Array.from({ length: 4 }, (_, i) => <PlaceCardSkeleton key={i} />)
      ) : rows.length === 0 ? (
        <EmptyState title="Aucun lieu publié dans ce rayon">
          Élargissez le rayon ou explorez la carte.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((p, i) => (
            <li key={p.id}>
              <PlaceCard place={p} index={i} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from "maplibre-gl";
import { AlertTriangle, LocateFixed, Loader2, Search, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import { currentTheme, THEME_EVENT, type Theme } from "@/lib/theme";
import { rememberPosition } from "@/lib/use-user-position";

const styleFor = (theme: Theme) =>
  theme === "dark" ? env.NEXT_PUBLIC_MAP_STYLE_DARK_URL : env.NEXT_PUBLIC_MAP_STYLE_URL;

interface BboxRow {
  id: string;
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  category_slug: string | null;
  category_color: string | null;
}

/** Vue de repli si la zone n'a pas pu être chargée (centre indicatif de Kisangani, voir DATABASE.md). */
const FALLBACK_VIEW = { lng: 25.191, lat: 0.5153, zoom: 12.5 };

export interface MapViewport {
  lat: number;
  lng: number;
  zoom: number;
}

/** Carte MapLibre : ne charge que les lieux de la zone visible, avec regroupement des marqueurs. */
export function PlacesMap({ view, focusSlug }: { view?: MapViewport; focusSlug?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  // Vue au moment de la création de la carte ; les changements suivants la déplacent (flyTo).
  const viewRef = useRef(view);
  const abortRef = useRef<AbortController | null>(null);
  // Derniers lieux chargés : réinjectés si le style change (thème).
  const dataRef = useRef<GeoJSON.FeatureCollection>({ type: "FeatureCollection", features: [] });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [fetching, setFetching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<BboxRow | null>(null);
  const [dirty, setDirty] = useState(false);

  const loadVisible = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    abortRef.current?.abort(); // annule la requête obsolète
    const controller = new AbortController();
    abortRef.current = controller;
    setFetching(true);
    setDirty(false);
    const { data, error } = await getSupabaseBrowserClient()
      .rpc("places_in_bbox", {
        p_min_lng: Math.max(-180, b.getWest()),
        p_min_lat: Math.max(-90, b.getSouth()),
        p_max_lng: Math.min(180, b.getEast()),
        p_max_lat: Math.min(90, b.getNorth()),
        p_limit: 800,
      })
      .abortSignal(controller.signal);
    if (controller.signal.aborted) return;
    setFetching(false);
    if (error) {
      setNotice(
        error.message.includes("étendue")
          ? "Zoomez pour afficher les lieux."
          : "Impossible de charger les lieux de cette zone.",
      );
      return;
    }
    const rows = (data as BboxRow[] | null) ?? [];
    setNotice(
      rows.length === 0
        ? "Aucun lieu publié dans cette zone pour l'instant."
        : rows.length >= 800
          ? "Zone dense : zoomez pour voir tous les lieux."
          : null,
    );
    dataRef.current = {
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [r.longitude, r.latitude] },
        properties: { ...r, color: r.category_color ?? "#2563EB" },
      })),
    };
    (map.getSource("places") as GeoJSONSource | undefined)?.setData(dataRef.current);
    if (focusSlug) {
      const f = rows.find((r) => r.slug === focusSlug);
      if (f) setSelected(f);
    }
  }, [focusSlug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const maplibre = (await import("maplibre-gl")).default;
        if (cancelled || !container.current) return;
        const start = viewRef.current ?? FALLBACK_VIEW;
        const map = new maplibre.Map({
          container: container.current,
          style: styleFor(currentTheme()),
          center: [start.lng, start.lat],
          zoom: start.zoom,
          attributionControl: { compact: true },
          maxZoom: 19,
        });
        mapRef.current = map;
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        map.on("error", (e) => {
          if (!map.isStyleLoaded()) setStatus("error");
          console.warn("[carte]", e.error?.message);
        });
        // Couches des lieux, (ré)ajoutées à chaque chargement de style (changement de thème compris).
        map.on("style.load", () => {
          if (map.getSource("places")) return;
          map.addSource("places", {
            type: "geojson",
            data: dataRef.current,
            cluster: true,
            clusterRadius: 48,
            clusterMaxZoom: 15,
          });
          map.addLayer({
            id: "clusters",
            type: "circle",
            source: "places",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#2563EB",
              "circle-opacity": 0.9,
              "circle-stroke-width": 3,
              "circle-stroke-color": "#ffffff",
              "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
            },
          });
          map.addLayer({
            id: "cluster-count",
            type: "symbol",
            source: "places",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-size": 12,
              "text-font": ["Noto Sans Bold"],
            },
            paint: { "text-color": "#ffffff" },
          });
          map.addLayer({
            id: "points",
            type: "circle",
            source: "places",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": ["get", "color"],
              "circle-radius": 8,
              "circle-stroke-width": 2.5,
              "circle-stroke-color": "#ffffff",
            },
          });
        });
        map.on("load", () => {
          map.on("click", "clusters", async (e: MapLayerMouseEvent) => {
            const f = e.features?.[0];
            if (!f) return;
            const src = map.getSource("places") as GeoJSONSource;
            const zoom = await src.getClusterExpansionZoom(f.properties?.cluster_id as number);
            map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
          });
          map.on("click", "points", (e: MapLayerMouseEvent) => {
            const p = e.features?.[0]?.properties as BboxRow | undefined;
            if (p) setSelected(p);
          });
          for (const layer of ["clusters", "points"]) {
            map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
            map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
          }
          setStatus("ready");
          void loadVisible();
        });
        map.on("moveend", () => setDirty(true));
      } catch {
        setStatus("error");
      }
    })();
    // Le fond de carte suit le thème clair/sombre de l'application.
    let shownTheme = currentTheme();
    const onTheme = (e: Event) => {
      const theme = (e as CustomEvent<{ theme: Theme }>).detail?.theme ?? currentTheme();
      if (theme === shownTheme || !mapRef.current) return;
      shownTheme = theme;
      mapRef.current.setStyle(styleFor(theme));
    };
    window.addEventListener(THEME_EVENT, onTheme);
    return () => {
      window.removeEventListener(THEME_EVENT, onTheme);
      cancelled = true;
      abortRef.current?.abort();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [loadVisible]);

  // Changement de zone : déplacement de la carte puis chargement des lieux de la nouvelle vue.
  useEffect(() => {
    if (!view) return;
    const prev = viewRef.current;
    viewRef.current = view;
    const map = mapRef.current;
    if (!map || (prev && prev.lat === view.lat && prev.lng === view.lng && prev.zoom === view.zoom)) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.once("moveend", () => void loadVisible());
    if (reduce) map.jumpTo({ center: [view.lng, view.lat], zoom: view.zoom });
    else map.flyTo({ center: [view.lng, view.lat], zoom: view.zoom });
  }, [view, loadVisible]);

  function locate() {
    if (!navigator.geolocation) return setNotice("La géolocalisation n'est pas disponible sur cet appareil.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        rememberPosition(pos.coords.latitude, pos.coords.longitude);
        mapRef.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15 });
      },
      () => setNotice("Position refusée ou indisponible."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="bg-surface-2 relative h-full w-full overflow-hidden">
      {/* Positionnement inline : la feuille MapLibre (hors @layer) impose position: relative
          à .maplibregl-map et l'emporterait sur les utilitaires Tailwind (hauteur nulle). */}
      <div
        ref={container}
        style={{ position: "absolute", inset: 0 }}
        aria-label="Carte interactive des lieux"
        role="region"
      />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="text-brand size-8 animate-spin" aria-label="Chargement de la carte" />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
          <AlertTriangle className="text-warning size-8" aria-hidden="true" />
          <p className="font-semibold">La carte n&apos;a pas pu être chargée.</p>
          <p className="text-muted text-sm">
            Fournisseur de tuiles indisponible ou connexion instable. La recherche reste disponible.
          </p>
          <Link
            href="/recherche"
            className="bg-brand mt-2 rounded-full px-4 py-2 text-sm font-semibold text-white"
          >
            Passer en liste
          </Link>
        </div>
      )}
      {status === "ready" && (
        <>
          <div className="absolute inset-x-0 top-3 flex justify-center gap-2 px-14">
            {dirty && (
              <button
                type="button"
                onClick={loadVisible}
                className="bg-surface inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold shadow-[var(--shadow-float)]"
              >
                {fetching ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="size-4" aria-hidden="true" />
                )}
                Rechercher dans cette zone
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={locate}
            aria-label="Me localiser"
            className="bg-surface absolute right-3 bottom-6 flex size-12 items-center justify-center rounded-full shadow-[var(--shadow-float)]"
          >
            <LocateFixed className="text-brand size-5" />
          </button>
          {notice && !selected && (
            <p
              role="status"
              className="bg-surface/95 absolute inset-x-3 bottom-6 mr-16 rounded-2xl px-4 py-3 text-sm shadow-[var(--shadow-card)]"
            >
              {notice}
            </p>
          )}
          {selected && (
            <div className="animate-fade-up bg-surface absolute inset-x-3 bottom-4 rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-float)] md:left-auto md:w-96">
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Fermer"
                className="hover:bg-surface-2 absolute top-3 right-3 rounded-full p-1.5"
              >
                <X className="size-4" />
              </button>
              <p className="pr-8 font-semibold">{selected.name}</p>
              <Link
                href={`/lieux/${selected.slug}`}
                className="bg-brand mt-3 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-white"
              >
                Voir la fiche
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

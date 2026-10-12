"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { formatDistance, haversineMeters } from "@/lib/format";
import { useUserPosition } from "@/lib/use-user-position";
import { navigateToPlace } from "@/lib/view-transition";

/** Lien de carte de lieu : transition de la vignette vers la couverture de la fiche. */
export function PlaceLink({
  href,
  className,
  style,
  children,
}: {
  href: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className={className}
      style={style}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const thumb = e.currentTarget.querySelector<HTMLElement>("[data-vt-thumb]");
        if (!thumb || !("startViewTransition" in document)) return; // navigation normale du lien
        e.preventDefault();
        navigateToPlace(router, href, thumb);
      }}
    >
      {children}
    </Link>
  );
}

/**
 * Distance À VOL D'OISEAU : celle du serveur (recherche avec position), sinon calculée depuis la position
 * déjà autorisée par l'utilisateur. Rien si la position est inconnue.
 */
export function DistanceBadge({
  latitude,
  longitude,
  serverMeters,
  className = "",
}: {
  latitude?: number | null;
  longitude?: number | null;
  serverMeters?: number | null;
  className?: string;
}) {
  const position = useUserPosition();
  const meters =
    serverMeters ??
    (position && latitude != null && longitude != null
      ? haversineMeters(position, { lat: latitude, lng: longitude })
      : null);
  const label = formatDistance(meters);
  if (!label) return null;
  return (
    <span className={className} title="Distance à vol d'oiseau (pas la distance par la route)">
      {label}
    </span>
  );
}

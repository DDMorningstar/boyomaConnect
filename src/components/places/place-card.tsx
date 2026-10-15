import { MapPin, Star } from "lucide-react";
import { PlaceThumb } from "@/components/places/place-visual";
import { VerificationBadge, VerifiedMark, isBoyomaVerified } from "@/components/places/verification-badge";
import { DistanceBadge, PlaceLink } from "@/components/places/place-card-client";
import { placeMediaUrl } from "@/lib/supabase/storage";
import type { VerificationStatus } from "@/types/places";

export interface PlaceCardData {
  slug: string;
  name: string;
  short_description?: string | null;
  category_name?: string | null;
  category_icon?: string | null;
  category_color?: string | null;
  unit_name?: string | null;
  landmark_description?: string | null;
  cover_path?: string | null;
  logo_path?: string | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  distance_m?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Ouvert maintenant (horaires connus seulement). */
  is_open?: boolean | null;
  verification_status?: VerificationStatus;
}

/** « Ouvert » / « Fermé » d'après les horaires déclarés ; rien si inconnus (jamais supposé). */
function OpenBadge({ open }: { open: boolean | null | undefined }) {
  if (open == null) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        open ? "bg-success/12 text-success" : "bg-surface-2 text-muted"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${open ? "bg-success motion-safe:animate-pulse" : "bg-muted"}`}
        aria-hidden="true"
      />
      {open ? "Ouvert" : "Fermé"}
    </span>
  );
}

export function PlaceCard({
  place,
  variant = "row",
  index = 0,
}: {
  place: PlaceCardData;
  variant?: "row" | "tile";
  index?: number;
}) {
  const cover = placeMediaUrl(place.cover_path);
  const logo = placeMediaUrl(place.logo_path);
  const visual = {
    logo,
    cover,
    name: place.name,
    icon: place.category_icon,
    color: place.category_color,
  };
  const delay = { animationDelay: `${Math.min(index, 8) * 40}ms` };

  if (variant === "tile") {
    return (
      <PlaceLink
        href={`/lieux/${place.slug}`}
        style={delay}
        className="group animate-fade-up border-line bg-surface hover:border-brand/30 flex w-64 shrink-0 snap-start flex-col overflow-hidden rounded-[var(--radius-card)] border shadow-[var(--shadow-card)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-float)] active:scale-[0.98] md:w-auto"
      >
        <div data-vt-thumb className="bg-surface-2 relative aspect-[16/10] overflow-hidden">
          <PlaceThumb {...visual} variant="tile" />
          <DistanceBadge
            latitude={place.latitude}
            longitude={place.longitude}
            serverMeters={place.distance_m}
            className="bg-surface/90 text-ink absolute top-2 right-2 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm backdrop-blur"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3.5">
          <h3 className="line-clamp-1 font-semibold">
            {place.name}
            {isBoyomaVerified(place.verification_status) && <VerifiedMark size={16} className="ml-1" />}
          </h3>
          <p className="text-muted line-clamp-1 text-sm">
            {[place.category_name, place.unit_name].filter(Boolean).join(" · ") || "Tshopo"}
          </p>
          {place.is_open != null && (
            <div className="mt-auto pt-1">
              <OpenBadge open={place.is_open} />
            </div>
          )}
        </div>
      </PlaceLink>
    );
  }

  return (
    <PlaceLink
      href={`/lieux/${place.slug}`}
      style={delay}
      className="group animate-fade-up border-line bg-surface hover:border-brand/30 flex gap-3.5 rounded-[var(--radius-card)] border p-3.5 shadow-[var(--shadow-card)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)] active:scale-[0.99]"
    >
      <div data-vt-thumb className="shrink-0 self-start overflow-hidden rounded-2xl">
        <PlaceThumb {...visual} variant="row" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 leading-snug font-semibold">
            {place.name}
            {isBoyomaVerified(place.verification_status) && <VerifiedMark size={17} className="ml-1" />}
          </h3>
          <DistanceBadge
            latitude={place.latitude}
            longitude={place.longitude}
            serverMeters={place.distance_m}
            className="bg-surface-2 text-muted shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
          />
        </div>
        <p className="text-muted mt-0.5 line-clamp-1 text-sm">
          {[place.category_name, place.unit_name].filter(Boolean).join(" · ")}
        </p>
        {place.landmark_description && (
          <p className="text-muted mt-1 flex items-center gap-1 text-xs">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="line-clamp-1">{place.landmark_description}</span>
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <OpenBadge open={place.is_open} />
          {place.verification_status && <VerificationBadge status={place.verification_status} />}
          {place.rating_count && place.rating_avg ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium">
              <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              {Number(place.rating_avg).toFixed(1).replace(".", ",")}
              <span className="text-muted">({place.rating_count})</span>
            </span>
          ) : null}
        </div>
      </div>
    </PlaceLink>
  );
}

export function PlaceCardSkeleton() {
  return (
    <div
      className="border-line bg-surface flex gap-3.5 rounded-[var(--radius-card)] border p-3.5"
      aria-hidden="true"
    >
      <div className="skeleton size-14 rounded-2xl" />
      <div className="flex-1 space-y-2 py-1">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="skeleton h-3 w-1/3 rounded" />
      </div>
    </div>
  );
}

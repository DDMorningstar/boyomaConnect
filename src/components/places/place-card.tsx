import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import { PlaceThumb } from "@/components/places/place-visual";
import { VerificationBadge } from "@/components/places/verification-badge";
import { formatDistance } from "@/lib/format";
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
  verification_status?: VerificationStatus;
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
  const distance = formatDistance(place.distance_m);
  const delay = { animationDelay: `${Math.min(index, 8) * 40}ms` };

  if (variant === "tile") {
    return (
      <Link
        href={`/lieux/${place.slug}`}
        style={delay}
        className="group animate-fade-up border-line bg-surface flex w-64 shrink-0 snap-start flex-col overflow-hidden rounded-[var(--radius-card)] border shadow-[var(--shadow-card)] transition-transform active:scale-[0.98]"
      >
        <div className="bg-surface-2 relative aspect-[16/10] overflow-hidden">
          <PlaceThumb {...visual} variant="tile" />
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3.5">
          <h3 className="line-clamp-1 font-semibold">{place.name}</h3>
          <p className="text-muted line-clamp-1 text-sm">
            {[place.category_name, place.unit_name].filter(Boolean).join(" · ") || "Kisangani"}
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/lieux/${place.slug}`}
      style={delay}
      className="animate-fade-up border-line bg-surface hover:border-brand/30 flex gap-3.5 rounded-[var(--radius-card)] border p-3.5 shadow-[var(--shadow-card)] transition-colors active:scale-[0.99]"
    >
      <PlaceThumb {...visual} variant="row" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 leading-snug font-semibold">{place.name}</h3>
          {distance && (
            <span
              className="bg-surface-2 text-muted shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
              title="Distance à vol d'oiseau"
            >
              {distance}
            </span>
          )}
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
    </Link>
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

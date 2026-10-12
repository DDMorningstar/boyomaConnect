import Link from "next/link";
import { MapPin } from "lucide-react";
import { zoneLabel, type Zone } from "@/features/zones/zones";

/**
 * Choix de la zone (Toute la Tshopo / Kisangani / territoires) sous forme de liens : fonctionne sans
 * JavaScript, partageable ; le middleware mémorise le choix pour les pages suivantes.
 */
export function ZoneSelector({
  zones,
  active,
  hrefFor,
  tone = "default",
  className = "",
}: {
  zones: Zone[];
  active: string | undefined;
  hrefFor: (slug: string) => string;
  tone?: "default" | "night";
  className?: string;
}) {
  if (zones.length === 0) return null;
  const chip = (on: boolean) =>
    tone === "night"
      ? `inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors ${
          on ? "bg-white text-ink" : "bg-white/10 text-white hover:bg-white/20"
        }`
      : `inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${
          on ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-brand/40"
        }`;
  const count = (on: boolean) =>
    tone === "night"
      ? `rounded-full px-1.5 text-xs ${on ? "bg-ink/10" : "bg-white/10 text-white/70"}`
      : `rounded-full px-1.5 text-xs ${on ? "bg-white/20" : "bg-surface-2 text-muted"}`;

  return (
    <nav
      aria-label="Zone"
      className={`-mx-4 flex scrollbar-none gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0 ${className}`}
    >
      {zones.map((z) => {
        const on = z.slug === active;
        return (
          <Link
            key={z.id}
            href={hrefFor(z.slug)}
            aria-current={on ? "true" : undefined}
            className={chip(on)}
            scroll={false}
          >
            {z.type_key === "province" && <MapPin className="size-4" aria-hidden="true" />}
            {zoneLabel(z)}
            <span className={count(on)}>{z.place_count}</span>
          </Link>
        );
      })}
    </nav>
  );
}

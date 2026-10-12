import Link from "next/link";
import type { ParsedSearch } from "@/lib/search-params";
import { ZoneSelector } from "@/components/zones/zone-selector";
import type { Zone } from "@/features/zones/zones";

type Commune = { unit_id: string; name: string };

function hrefWith(
  base: ParsedSearch,
  patch: Partial<Record<string, string | undefined>>,
  path = "/recherche",
) {
  const params = new URLSearchParams();
  const merged: Record<string, string | undefined> = {
    q: base.q,
    categorie: base.categorie,
    zone: base.zone,
    commune: base.commune,
    tri: base.tri !== "relevance" ? base.tri : undefined,
    ouvert: base.ouvert ? "1" : undefined,
    verifie: base.verifie ? "1" : undefined,
    lat: base.lat?.toString(),
    lng: base.lng?.toString(),
    ...patch,
  };
  Object.entries(merged).forEach(([k, v]) => v && params.set(k, v));
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export { hrefWith };

/** Filtres cumulables sous forme de liens (fonctionnent sans JavaScript, partageables). */
export function SearchFilters({
  params,
  communes,
  zones = [],
  activeZone,
  path = "/recherche",
}: {
  params: ParsedSearch;
  /** Communes de la zone active (seule la ville en a). */
  communes: Commune[];
  zones?: Zone[];
  activeZone?: Zone | null;
  path?: string;
}) {
  const chip = (active: boolean) =>
    `inline-flex min-h-10 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition-colors ${
      active ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-brand/40"
    }`;
  return (
    <div className="space-y-2">
      <ZoneSelector
        zones={zones}
        active={activeZone?.slug}
        hrefFor={(slug) => hrefWith(params, { zone: slug, commune: undefined, page: undefined }, path)}
      />
      {communes.length > 0 && (
        <div
          className="-mx-4 flex scrollbar-none gap-2 overflow-x-auto px-4"
          role="group"
          aria-label="Commune"
        >
          <Link
            href={hrefWith(params, { commune: undefined, page: undefined }, path)}
            className={chip(!params.commune)}
          >
            Toutes les communes
          </Link>
          {communes.map((c) => (
            <Link
              key={c.unit_id}
              href={hrefWith(params, { commune: c.unit_id }, path)}
              className={chip(params.commune === c.unit_id)}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}
      <div
        className="-mx-4 flex scrollbar-none gap-2 overflow-x-auto px-4"
        role="group"
        aria-label="Filtres et tri"
      >
        <Link
          href={hrefWith(params, { ouvert: params.ouvert ? undefined : "1" }, path)}
          className={chip(params.ouvert)}
        >
          Ouvert maintenant
        </Link>
        <Link
          href={hrefWith(params, { verifie: params.verifie ? undefined : "1" }, path)}
          className={chip(params.verifie)}
        >
          Vérifiés
        </Link>
        <Link href={hrefWith(params, { tri: undefined }, path)} className={chip(params.tri === "relevance")}>
          Pertinence
        </Link>
        <Link href={hrefWith(params, { tri: "recent" }, path)} className={chip(params.tri === "recent")}>
          Récents
        </Link>
        <Link href={hrefWith(params, { tri: "rating" }, path)} className={chip(params.tri === "rating")}>
          Mieux notés
        </Link>
        <Link href={hrefWith(params, { tri: "name" }, path)} className={chip(params.tri === "name")}>
          A → Z
        </Link>
        {params.lat != null && params.lng != null && (
          <Link
            href={hrefWith(params, { tri: "distance" }, path)}
            className={chip(params.tri === "distance")}
          >
            Plus proches
          </Link>
        )}
      </div>
    </div>
  );
}

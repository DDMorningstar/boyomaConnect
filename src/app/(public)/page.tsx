import Link from "next/link";
import {
  ChevronRight,
  Info,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Megaphone,
  Plus,
  Sparkles,
  Tag,
} from "lucide-react";
import { SearchBar } from "@/components/search/search-bar";
import { CategoryBadge } from "@/components/places/category-icon";
import { PlaceCard } from "@/components/places/place-card";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { ZoneSelector } from "@/components/zones/zone-selector";
import {
  getCategoriesWithCounts,
  getCityWithCommunes,
  getPopularPlaces,
  getRecentPlaces,
  getSponsoredPlaces,
  searchPlaces,
} from "@/features/places/queries";
import { resolveZone } from "@/features/zones/queries";
import { getActivePromotions } from "@/features/places/engagement";
import { zoneIn, zoneLabel, zoneTitle } from "@/features/zones/zones";
import { searchParamsSchema } from "@/lib/search-params";
import { formatDate, pluralize } from "@/lib/format";

function settled<T>(r: PromiseSettledResult<T>, fallback: T): T {
  return r.status === "fulfilled" ? r.value : fallback;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  // Zone : ?zone=…, sinon zone mémorisée, sinon Kisangani. Si le référentiel est indisponible, la page
  // reste utilisable sans filtre de zone.
  const zoneR = await Promise.allSettled([resolveZone(typeof sp.zone === "string" ? sp.zone : undefined)]);
  const { zone, zones } = settled(zoneR[0]!, { zone: null, zones: [] });
  const unitId = zone?.id;
  const defaults = searchParamsSchema.parse({});

  const [catsR, cityR, recentR, popularR, sponsoredR, tourismR, allR, offersR] = await Promise.allSettled([
    getCategoriesWithCounts(unitId),
    zone?.type_key === "ville" ? getCityWithCommunes(zone.slug) : Promise.resolve(null),
    getRecentPlaces(8, unitId),
    getPopularPlaces(8, unitId),
    getSponsoredPlaces(),
    searchPlaces({ ...defaults, categorySlug: "tourisme", unitId }),
    searchPlaces({ ...defaults, unitId }),
    getActivePromotions(6, unitId),
  ]);
  const offers = settled(offersR, []);
  const categories = settled(catsR, []);
  const city = settled(cityR, null);
  const recent = settled(recentR, []);
  const popular = settled(popularR, []);
  const sponsored = settled(sponsoredR, []);
  const tourism = settled(tourismR, { rows: [], total: 0 }).rows.slice(0, 6);
  const dataUnavailable = catsR.status === "rejected" && recentR.status === "rejected";

  const where = zone ? zoneIn(zone) : "dans la Tshopo";
  const topCategories = categories.filter((c) => !c.parent_id);
  // Total réel des lieux publiés dans la zone (descendants compris).
  const totalPlaces = settled(allR, { rows: [], total: 0 }).total;
  const territories = zones.filter((z) => z.type_key !== "province");
  const stats = [
    { value: totalPlaces, label: `lieux publiés ${where}`, Icon: MapPin, tone: "text-cyan" },
    {
      value: topCategories.filter((c) => c.place_count > 0).length,
      label: "catégories actives",
      Icon: Sparkles,
      tone: "text-amber-300",
    },
    ...(city
      ? [{ value: city.communes.length, label: "communes", Icon: MapIcon, tone: "text-emerald-300" }]
      : zone?.type_key === "province"
        ? [
            {
              value: territories.length,
              label: "ville et territoires",
              Icon: MapIcon,
              tone: "text-emerald-300",
            },
          ]
        : []),
  ];

  return (
    <div className="pt-5">
      {/* En-tête : emplacement + recherche */}
      <section className="bg-night relative overflow-hidden rounded-[1.75rem] px-5 pt-5 pb-6 text-white shadow-[var(--shadow-float)] md:px-8 md:pt-7 md:pb-8">
        <div
          aria-hidden="true"
          className="bg-brand/40 motion-safe:animate-drift pointer-events-none absolute -top-20 -right-16 size-64 rounded-full blur-3xl md:size-96"
        />
        <div
          aria-hidden="true"
          className="bg-cyan/25 motion-safe:animate-drift pointer-events-none absolute -bottom-24 left-10 size-56 rounded-full blur-3xl [animation-delay:-7s]"
        />
        <div className="relative grid grid-cols-[minmax(0,1fr)] items-center gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <Link
              href={zone ? `/zones/${zone.slug}` : "/explorer"}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium backdrop-blur"
            >
              <MapPin className="text-cyan size-4" aria-hidden="true" />
              {zone ? (zone.type_key === "province" ? zoneTitle(zone) : `${zone.name} · Tshopo`) : "Tshopo"}
              <ChevronRight className="size-4 opacity-70" aria-hidden="true" />
            </Link>
            <h1 className="mt-4 max-w-xl text-[1.7rem] leading-tight font-extrabold tracking-tight md:text-4xl">
              Trouvez le bon lieu {where}, <span className="text-cyan">simplement.</span>
            </h1>
            <p className="mt-2 max-w-lg text-sm text-white/70 md:text-base">
              Pharmacies, hôtels, restaurants, garages, écoles, services publics… avec leurs contacts et leur
              position.
            </p>
            <div className="text-ink mt-5">
              <SearchBar />
            </div>
            <ZoneSelector
              zones={zones}
              active={zone?.slug}
              hrefFor={(slug) => `/?zone=${slug}`}
              tone="night"
              className="mt-4"
            />
            <p className="mt-3 text-xs text-white/60 lg:hidden">
              {totalPlaces > 0
                ? `${pluralize(totalPlaces, "lieu publié", "lieux publiés")} ${where}`
                : `Aucun lieu publié ${where} pour l'instant : les premiers lieux vérifiés arrivent.`}
            </p>
          </div>

          {/* Écrans larges : chiffres réels de l'annuaire. */}
          <ul className="hidden gap-3 lg:grid" aria-label="L'annuaire en chiffres">
            {stats.map(({ value, label, Icon, tone }, i) => (
              <li
                key={label}
                style={{ animationDelay: `${150 + i * 120}ms` }}
                className="motion-safe:animate-fade-up flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur"
              >
                <span
                  className={`motion-safe:animate-float flex size-12 items-center justify-center rounded-2xl bg-white/10 ${tone}`}
                  style={{ animationDelay: `${i * 0.6}s` }}
                >
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-2xl leading-none font-extrabold">
                    {value.toLocaleString("fr-FR")}
                  </span>
                  <span className="text-sm text-white/70">{label}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {dataUnavailable && (
        <div
          role="alert"
          className="border-warning/30 bg-warning/10 mt-4 flex gap-3 rounded-2xl border p-4 text-sm"
        >
          <Info className="text-warning size-5 shrink-0" aria-hidden="true" />
          Les données sont momentanément indisponibles. Vérifiez votre connexion puis rechargez la page.
        </div>
      )}

      {/* Accès rapides */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link
          href={zone ? `/carte?zone=${zone.slug}` : "/carte"}
          className="group border-line bg-surface hover:border-brand/30 flex items-center gap-3 rounded-[var(--radius-card)] border p-4 shadow-[var(--shadow-card)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)] active:scale-[0.98]"
        >
          <span className="bg-brand/10 text-brand flex size-11 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
            <MapIcon className="size-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-semibold">Carte</span>
            <span className="text-muted text-xs">
              {zone?.type_key === "province"
                ? "Explorer la province"
                : zone?.type_key === "territoire"
                  ? "Explorer le territoire"
                  : "Explorer la ville"}
            </span>
          </span>
        </Link>
        <Link
          href="/proximite"
          className="group border-line bg-surface hover:border-cyan/30 flex items-center gap-3 rounded-[var(--radius-card)] border p-4 shadow-[var(--shadow-card)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)] active:scale-[0.98]"
        >
          <span className="bg-cyan/10 text-cyan flex size-11 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
            <LocateFixed className="size-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-semibold">À proximité</span>
            <span className="text-muted text-xs">Autour de moi</span>
          </span>
        </Link>
      </div>

      {/* Catégories */}
      {topCategories.length > 0 && (
        <Section title="Catégories" href="/categories">
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
            {topCategories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/categories/${c.slug}`}
                  className={`group hover:bg-surface-2 flex flex-col items-center gap-1.5 rounded-2xl p-2 text-center transition-[transform,background-color] duration-300 hover:-translate-y-1 active:scale-95 ${c.place_count === 0 ? "opacity-60" : ""}`}
                >
                  <CategoryBadge icon={c.icon} color={c.color} size="lg" />
                  <span className="line-clamp-2 text-[11px] leading-tight font-medium">{c.name}</span>
                  <span className="text-muted text-[10px]">
                    {c.place_count > 0 ? c.place_count : "bientôt"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Offres sponsorisées : toujours identifiées */}
      {sponsored.length > 0 && (
        <Section
          title="Offres sponsorisées"
          subtitle="Contenus payés par les établissements, distincts des résultats naturels."
        >
          <ul className="grid gap-3 md:grid-cols-3">
            {sponsored.map((s) => (
              <li key={s.campaign_id}>
                <Link
                  href={`/lieux/${s.slug}`}
                  className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-amber-400/40 bg-amber-50 p-4 dark:bg-amber-400/10"
                >
                  <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-300">
                    <Megaphone className="size-3" aria-hidden="true" /> Sponsorisé
                  </span>
                  <span className="font-semibold">{s.name}</span>
                  {s.short_description && (
                    <span className="text-muted line-clamp-2 text-sm">{s.short_description}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Offres datées des établissements : section distincte, jamais mêlée aux résultats */}
      {offers.length > 0 && (
        <Section
          title="Offres du moment"
          subtitle="Publiées par les établissements et vérifiées par l’équipe ; triées par date de fin, sans effet sur les résultats de recherche."
        >
          <ul className="-mx-4 flex snap-x scrollbar-none gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
            {offers.map((o) => (
              <li key={o.id} className="w-72 shrink-0 snap-start md:w-auto">
                <Link
                  href={`/lieux/${o.place_slug}`}
                  className="border-line bg-surface hover:border-brand/40 flex h-full flex-col gap-1.5 rounded-[var(--radius-card)] border p-4 shadow-[var(--shadow-card)] transition-colors"
                >
                  <span className="bg-brand/10 text-brand inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
                    <Tag className="size-3" aria-hidden="true" /> Offre
                  </span>
                  <span className="font-semibold">{o.title}</span>
                  {o.description && <span className="text-muted line-clamp-2 text-sm">{o.description}</span>}
                  <span className="text-muted mt-auto pt-1 text-xs">
                    {o.place_name}
                    {o.unit_name && ` · ${o.unit_name}`} · jusqu’au {formatDate(o.ends_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {recent.length > 0 && (
        <Section title="Récemment ajoutés" href="/recherche?tri=recent">
          <div className="-mx-4 flex snap-x scrollbar-none gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 lg:grid-cols-4">
            {recent.map((p, i) => (
              <PlaceCard key={p.id} place={p} variant="tile" index={i} />
            ))}
          </div>
        </Section>
      )}

      {popular.length > 0 && (
        <Section
          title="Populaires ce mois-ci"
          subtitle="Classement : consultations + contacts + demandes d'itinéraire réels des 30 derniers jours."
        >
          <ul className="grid gap-3 md:grid-cols-2">
            {popular.map((p, i) => (
              <li key={p.id}>
                <PlaceCard place={p} index={i} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {tourism.length > 0 && (
        <Section title="Boyoma Explore" subtitle={`Sites, culture et patrimoine ${where}`} href="/tourisme">
          <div className="-mx-4 flex snap-x scrollbar-none gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 lg:grid-cols-4">
            {tourism.map((p, i) => (
              <PlaceCard key={p.id} place={p} variant="tile" index={i} />
            ))}
          </div>
        </Section>
      )}

      {city && city.communes.length > 0 && (
        <Section title={`Les communes de ${city.city.name}`}>
          <ul className="flex flex-wrap gap-2">
            {city.communes.map((c) => (
              <li key={c.unit_id}>
                <Link
                  href={`/communes/${c.slug}`}
                  className="border-line bg-surface hover:border-brand/40 inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium"
                >
                  {c.name}
                  <span className="bg-surface-2 text-muted rounded-full px-1.5 text-xs">{c.place_count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {recent.length === 0 && !dataUnavailable && (
        <Section title="À découvrir bientôt">
          <div className="border-line bg-surface text-muted flex gap-3 rounded-[var(--radius-card)] border border-dashed p-5 text-sm">
            <Sparkles className="text-brand size-5 shrink-0" aria-hidden="true" />
            Aucun lieu n&apos;est encore publié {where}. Nos agents cartographes collectent et vérifient les
            établissements sur le terrain. Vous connaissez un lieu ? Proposez-le.
          </div>
        </Section>
      )}

      {territories.length > 0 && (
        <Section title="Ville et territoires de la Tshopo" href="/zones/tshopo" hrefLabel="La province">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {territories.map((z) => (
              <li key={z.id}>
                <Link
                  href={`/zones/${z.slug}`}
                  className={`border-line bg-surface hover:border-brand/40 flex flex-col rounded-2xl border p-4 transition-colors ${
                    z.slug === zone?.slug ? "border-brand/50" : ""
                  }`}
                >
                  <span className="text-muted text-xs">
                    {z.type_key === "ville" ? "Ville" : "Territoire"}
                  </span>
                  <span className="font-semibold">{zoneLabel(z)}</span>
                  <span className="text-muted text-xs">{pluralize(z.place_count, "lieu", "lieux")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Ajouter un lieu */}
      <section className="from-brand to-cyan mt-10 flex flex-col items-start gap-4 rounded-[var(--radius-card)] bg-gradient-to-br p-6 text-white md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-bold">Un lieu manque sur Boyoma Connect ?</h2>
          <p className="text-sm text-white/85">Proposez-le : il sera vérifié avant publication.</p>
        </div>
        <ButtonLink href="/ajouter-un-lieu" variant="secondary" className="border-transparent">
          <Plus className="size-4" aria-hidden="true" /> Ajouter un lieu
        </ButtonLink>
      </section>
    </div>
  );
}

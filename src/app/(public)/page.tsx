import Link from "next/link";
import { ChevronRight, Info, LocateFixed, Map as MapIcon, MapPin, Megaphone, Plus, Sparkles } from "lucide-react";
import { SearchBar } from "@/components/search/search-bar";
import { CategoryBadge } from "@/components/places/category-icon";
import { PlaceCard } from "@/components/places/place-card";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import {
  getCategoriesWithCounts,
  getCityWithCommunes,
  getPopularPlaces,
  getRecentPlaces,
  getSponsoredPlaces,
  searchPlaces,
} from "@/features/places/queries";
import { searchParamsSchema } from "@/lib/search-params";
import { pluralize } from "@/lib/format";

export const revalidate = 300;

function settled<T>(r: PromiseSettledResult<T>, fallback: T): T {
  return r.status === "fulfilled" ? r.value : fallback;
}

export default async function HomePage() {
  const [catsR, cityR, recentR, popularR, sponsoredR, tourismR] = await Promise.allSettled([
    getCategoriesWithCounts(),
    getCityWithCommunes("kisangani"),
    getRecentPlaces(8),
    getPopularPlaces(8),
    getSponsoredPlaces(),
    searchPlaces({ ...searchParamsSchema.parse({}), categorySlug: "tourisme" }),
  ]);
  const categories = settled(catsR, []);
  const city = settled(cityR, null);
  const recent = settled(recentR, []);
  const popular = settled(popularR, []);
  const sponsored = settled(sponsoredR, []);
  const tourism = settled(tourismR, { rows: [], total: 0 }).rows.slice(0, 6);
  const dataUnavailable = catsR.status === "rejected" && recentR.status === "rejected";

  const topCategories = categories.filter((c) => !c.parent_id);
  const totalPlaces = city?.communes.reduce((s, c) => s + c.place_count, 0) ?? 0;

  return (
    <div className="pt-5">
      {/* En-tête : emplacement + recherche */}
      <section className="relative overflow-hidden rounded-[1.75rem] bg-night px-5 pb-6 pt-5 text-white shadow-[var(--shadow-float)] md:px-8 md:pb-8 md:pt-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-brand/40 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-10 size-56 rounded-full bg-cyan/25 blur-3xl" />
        <div className="relative">
          <Link href="/explorer" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium backdrop-blur">
            <MapPin className="size-4 text-cyan" aria-hidden="true" />
            {city?.city.name ?? "Kisangani"} · Tshopo
            <ChevronRight className="size-4 opacity-70" aria-hidden="true" />
          </Link>
          <h1 className="mt-4 max-w-xl text-[1.7rem] font-extrabold leading-tight tracking-tight md:text-4xl">
            Trouvez le bon lieu à Kisangani, <span className="text-cyan">simplement.</span>
          </h1>
          <p className="mt-2 max-w-lg text-sm text-white/70 md:text-base">
            Pharmacies, hôtels, restaurants, garages, écoles, services publics… avec leurs contacts et leur position.
          </p>
          <div className="mt-5 text-ink">
            <SearchBar />
          </div>
          <p className="mt-3 text-xs text-white/60">
            {totalPlaces > 0
              ? `${pluralize(totalPlaces, "lieu publié", "lieux publiés")} dans les 6 communes de Kisangani`
              : "L'annuaire est en cours de constitution : les premiers lieux vérifiés arrivent."}
          </p>
        </div>
      </section>

      {dataUnavailable && (
        <div role="alert" className="mt-4 flex gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <Info className="size-5 shrink-0 text-warning" aria-hidden="true" />
          Les données sont momentanément indisponibles. Vérifiez votre connexion puis rechargez la page.
        </div>
      )}

      {/* Accès rapides */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link href="/carte" className="group flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] active:scale-[0.98]">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-brand/10 text-brand"><MapIcon className="size-5" aria-hidden="true" /></span>
          <span><span className="block font-semibold">Carte</span><span className="text-xs text-muted">Explorer la ville</span></span>
        </Link>
        <Link href="/proximite" className="group flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] active:scale-[0.98]">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-cyan/10 text-cyan"><LocateFixed className="size-5" aria-hidden="true" /></span>
          <span><span className="block font-semibold">À proximité</span><span className="text-xs text-muted">Autour de moi</span></span>
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
                  className={`flex flex-col items-center gap-1.5 rounded-2xl p-2 text-center transition-transform active:scale-95 ${c.place_count === 0 ? "opacity-60" : ""}`}
                >
                  <CategoryBadge icon={c.icon} color={c.color} size="lg" />
                  <span className="line-clamp-2 text-[11px] font-medium leading-tight">{c.name}</span>
                  <span className="text-[10px] text-muted">{c.place_count > 0 ? c.place_count : "bientôt"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Offres sponsorisées : toujours identifiées */}
      {sponsored.length > 0 && (
        <Section title="Offres sponsorisées" subtitle="Contenus payés par les établissements, distincts des résultats naturels.">
          <ul className="grid gap-3 md:grid-cols-3">
            {sponsored.map((s) => (
              <li key={s.campaign_id}>
                <Link href={`/lieux/${s.slug}`} className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-amber-400/40 bg-amber-50 p-4 dark:bg-amber-400/10">
                  <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    <Megaphone className="size-3" aria-hidden="true" /> Sponsorisé
                  </span>
                  <span className="font-semibold">{s.name}</span>
                  {s.short_description && <span className="line-clamp-2 text-sm text-muted">{s.short_description}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {recent.length > 0 && (
        <Section title="Récemment ajoutés" href="/recherche?tri=recent">
          <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
            {recent.map((p, i) => (
              <PlaceCard key={p.id} place={p} variant="tile" index={i} />
            ))}
          </div>
        </Section>
      )}

      {popular.length > 0 && (
        <Section title="Populaires ce mois-ci" subtitle="Classement : consultations + contacts + demandes d'itinéraire réels des 30 derniers jours.">
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
        <Section title="Boyoma Explore" subtitle="Sites, culture et patrimoine de Kisangani" href="/tourisme">
          <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
            {tourism.map((p, i) => (
              <PlaceCard key={p.id} place={p} variant="tile" index={i} />
            ))}
          </div>
        </Section>
      )}

      {city && city.communes.length > 0 && (
        <Section title="Les communes de Kisangani">
          <ul className="flex flex-wrap gap-2">
            {city.communes.map((c) => (
              <li key={c.unit_id}>
                <Link href={`/communes/${c.slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium hover:border-brand/40">
                  {c.name}
                  <span className="rounded-full bg-surface-2 px-1.5 text-xs text-muted">{c.place_count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {recent.length === 0 && !dataUnavailable && (
        <Section title="À découvrir bientôt">
          <div className="flex gap-3 rounded-[var(--radius-card)] border border-dashed border-line bg-surface p-5 text-sm text-muted">
            <Sparkles className="size-5 shrink-0 text-brand" aria-hidden="true" />
            Aucun lieu n&apos;est encore publié. Nos agents cartographes collectent et vérifient les établissements sur le terrain.
            Vous connaissez un lieu ? Proposez-le.
          </div>
        </Section>
      )}

      {/* Ajouter un lieu */}
      <section className="mt-10 flex flex-col items-start gap-4 rounded-[var(--radius-card)] bg-gradient-to-br from-brand to-cyan p-6 text-white md:flex-row md:items-center md:justify-between">
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

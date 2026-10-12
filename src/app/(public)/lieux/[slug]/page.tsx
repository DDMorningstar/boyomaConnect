import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  Accessibility,
  BadgeCheck,
  Building2,
  Globe,
  Mail,
  Map as MapIcon,
  MapPin,
  Route,
  ShoppingBag,
  Star,
} from "lucide-react";
import { CategoryBadge, CategoryIcon } from "@/components/places/category-icon";
import { IconCover, LogoCover } from "@/components/places/place-visual";
import { CoverPhotoButton, PhotoStrip, type ViewerPhoto } from "@/components/places/photo-viewer";
import { VerificationBadge } from "@/components/places/verification-badge";
import { PlaceActions } from "@/components/places/place-actions";
import { OpeningHours } from "@/components/places/opening-hours";
import { ReportForm } from "@/components/places/report-form";
import { ViewTracker } from "@/components/places/view-tracker";
import { getPlaceBySlug, getPublicReviews } from "@/features/places/queries";
import { localityName, placeLocation } from "@/features/zones/zones";
import { env } from "@/lib/env";
import { formatCoordinates, formatDate, formatPrice } from "@/lib/format";
import { placeMediaUrl } from "@/lib/supabase/storage";
import type { PlaceDetail } from "@/types/places";

type Props = { params: Promise<{ slug: string }> };

const PRECISION_LABEL: Record<PlaceDetail["geographic_precision"], string> = {
  exact: "Position GPS précise",
  approximate: "Position approximative",
  street: "Position à l'échelle de la rue",
  neighborhood: "Position à l'échelle du quartier",
  commune: "Seule la commune est connue",
  unknown: "Position non renseignée",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const res = await getPlaceBySlug(slug);
  if (res.kind !== "found") return { title: "Lieu introuvable", robots: { index: false } };
  const p = res.place;
  const where = [p.unit?.type_key === "commune" ? p.unit.name : null, localityName(p.unit)]
    .filter(Boolean)
    .join(", ");
  const phone = p.place_contacts.find((c) => c.kind === "phone")?.value;
  const priced = p.catalog_items.filter((i) => i.price != null && i.currency).length;
  const description = [
    p.short_description ?? `${p.primary_category?.name ?? "Lieu"} à ${where}`,
    phone ? `Tél. ${phone}` : null,
    p.catalog_items.length
      ? `Catalogue : ${p.catalog_items.length} article${p.catalog_items.length > 1 ? "s" : ""}${priced ? " avec prix" : ""}`
      : null,
    "Itinéraire et contacts sur Boyoma Connect.",
  ]
    .filter(Boolean)
    .join(" · ");
  // L'image de partage est générée par opengraph-image.tsx (logo, nom, téléphone, prix).
  return {
    title: `${p.name} — ${where}`,
    description,
    alternates: { canonical: `/lieux/${p.slug}` },
    openGraph: {
      title: `${p.name} — ${p.primary_category?.name ?? localityName(p.unit)}`,
      description,
      url: `/lieux/${p.slug}`,
      siteName: "Boyoma Connect",
      locale: "fr_CD",
    },
    twitter: { card: "summary_large_image", title: p.name, description },
    // Copie en <meta name> dans <head> (Next n'émet pas de property pour ces clés), voir businessOgTags.
    other: Object.fromEntries(businessOgTags(p)),
  };
}

/**
 * Open Graph « business.business » (coordonnées lues par Facebook, WhatsApp…). L'API metadata de Next
 * refuse ce type et n'émet que des <meta name> : copie en <meta name> dans <head> (via `other`) et en
 * <meta property> dans la page (React les hoiste ; en streaming elles restent dans le corps).
 */
function businessOgTags(p: PlaceDetail): [string, string][] {
  const phone = p.place_contacts.find((c) => c.kind === "phone")?.value;
  const tags: [string, string | null | undefined][] = [
    ["og:type", "business.business"],
    ["business:contact_data:street_address", p.address_text],
    ["business:contact_data:locality", localityName(p.unit)],
    ["business:contact_data:region", "Tshopo"],
    ["business:contact_data:country_name", "République démocratique du Congo"],
    ["business:contact_data:phone_number", phone],
  ];
  if (p.latitude != null && p.longitude != null && p.geographic_precision !== "unknown") {
    tags.push(
      ["place:location:latitude", String(p.latitude)],
      ["place:location:longitude", String(p.longitude)],
    );
  }
  return tags.filter((t): t is [string, string] => Boolean(t[1]));
}

function jsonLd(p: PlaceDetail) {
  const phone = p.place_contacts.find((c) => c.kind === "phone")?.value;
  const site = p.place_contacts.find((c) => c.kind === "website")?.value;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: p.name,
    description: p.short_description ?? undefined,
    url: `${env.NEXT_PUBLIC_SITE_URL}/lieux/${p.slug}`,
    telephone: phone,
    sameAs: site ? [site] : undefined,
    image: placeMediaUrl(p.cover_path) ?? undefined,
    logo: placeMediaUrl(p.logo_path) ?? undefined,
    makesOffer: p.catalog_items.length
      ? p.catalog_items.map((i) => ({
          "@type": "Offer",
          itemOffered: { "@type": i.kind === "service" ? "Service" : "Product", name: i.name },
          ...(i.price != null && i.currency ? { price: Number(i.price), priceCurrency: i.currency } : {}),
        }))
      : undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: p.address_text ?? undefined,
      addressLocality: localityName(p.unit),
      addressRegion: "Tshopo",
      addressCountry: "CD",
    },
    geo:
      p.latitude != null && p.longitude != null && p.geographic_precision !== "unknown"
        ? { "@type": "GeoCoordinates", latitude: p.latitude, longitude: p.longitude }
        : undefined,
    aggregateRating:
      p.rating_count > 0 && p.rating_avg
        ? { "@type": "AggregateRating", ratingValue: p.rating_avg, reviewCount: p.rating_count }
        : undefined,
  };
}

export default async function PlacePage({ params }: Props) {
  const { slug } = await params;
  const res = await getPlaceBySlug(slug);
  if (res.kind === "redirect") permanentRedirect(`/lieux/${res.slug}`);
  if (res.kind === "not_found") notFound();
  const p = res.place;
  const reviews = await getPublicReviews(p.id, 5);

  // Photos : couverture dédiée d'abord, puis la galerie. Le logo, s'il existe, sert de couverture
  // (toutes les photos restent visibles dans la rangée et la visionneuse).
  const photos: ViewerPhoto[] = [
    ...(p.cover_path ? [p.cover_path] : []),
    ...[...p.place_media]
      .filter((m) => m.kind === "cover" || m.kind === "gallery")
      .sort((a, b) => Number(b.kind === "cover") - Number(a.kind === "cover"))
      .map((m) => m.storage_path),
  ]
    .filter((path, i, all) => all.indexOf(path) === i)
    .map((path, i) => ({ src: placeMediaUrl(path)!, alt: `Photo ${i + 1} de ${p.name}` }));
  const logo = placeMediaUrl(p.logo_path);
  const heroPhoto = logo ? null : (photos[0] ?? null);
  const phone = p.place_contacts.find((c) => c.kind === "phone")?.value ?? null;
  const whatsapp = p.place_contacts.find((c) => c.kind === "whatsapp")?.value ?? null;
  const otherContacts = p.place_contacts.filter((c) => !["phone", "whatsapp"].includes(c.kind));
  const extraCategories = p.place_categories
    .map((pc) => pc.category)
    .filter((c) => c && c.id !== p.primary_category?.id);
  const hasCoords = p.latitude != null && p.longitude != null;

  return (
    <article className="pt-4">
      {businessOgTags(p).map(([property, content]) => (
        <meta key={property} property={property} content={content} />
      ))}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(p)).replace(/</g, "\\u003c") }}
      />
      <ViewTracker placeId={p.id} />

      <div className="bg-surface-2 relative -mx-4 aspect-[16/9] max-h-96 overflow-hidden md:mx-0 md:aspect-auto md:h-80 md:max-h-none md:rounded-[var(--radius-card)] lg:h-96">
        {logo ? (
          <LogoCover logo={logo} name={p.name} size="lg" priority />
        ) : heroPhoto ? (
          <CoverPhotoButton photos={photos}>
            <Image
              src={heroPhoto.src}
              alt={heroPhoto.alt}
              fill
              priority
              sizes="(min-width: 768px) 1152px, 100vw"
              className="object-cover"
            />
          </CoverPhotoButton>
        ) : (
          <IconCover icon={p.primary_category?.icon} />
        )}
      </div>

      {/* Écrans larges : titre à gauche, actions à droite. */}
      <div className="mt-4 grid gap-4 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-end">
        <header className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {p.primary_category && (
              <Link
                href={`/categories/${p.primary_category.slug}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium"
                style={{ color: p.primary_category.color }}
              >
                <CategoryIcon name={p.primary_category.icon} className="size-4" /> {p.primary_category.name}
              </Link>
            )}
            <VerificationBadge status={p.verification_status} />
            {p.activity_status === "temporarily_closed" && (
              <span className="bg-warning/15 text-warning rounded-full px-2 py-0.5 text-xs font-medium">
                Fermé temporairement
              </span>
            )}
            {p.activity_status === "permanently_closed" && (
              <span className="bg-danger/15 text-danger rounded-full px-2 py-0.5 text-xs font-medium">
                Fermé définitivement
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="min-w-0">
              <h1 className="text-[1.65rem] leading-tight font-extrabold tracking-tight md:text-3xl">
                {p.name}
              </h1>
              {p.ownership_status === "claimed" && (
                <p className="text-success mt-0.5 flex items-center gap-1 text-sm font-medium">
                  <BadgeCheck className="size-4" aria-hidden="true" /> Fiche gérée par l&apos;établissement
                </p>
              )}
            </div>
          </div>
          {p.official_name && p.official_name !== p.name && (
            <p className="text-muted text-sm">Nom officiel : {p.official_name}</p>
          )}
          <p className="text-muted mt-1 flex items-center gap-1.5 text-sm">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            {[p.address_text, placeLocation(p.unit)].filter(Boolean).join(", ")}
          </p>
          {p.rating_count > 0 && p.rating_avg && (
            <p className="mt-1 flex items-center gap-1 text-sm font-medium">
              <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden="true" />
              {Number(p.rating_avg).toFixed(1).replace(".", ",")}{" "}
              <span className="text-muted">· {p.rating_count} avis</span>
            </p>
          )}
        </header>

        <div>
          <PlaceActions
            place={{
              id: p.id,
              slug: p.slug,
              name: p.name,
              category_name: p.primary_category?.name ?? null,
              category_icon: p.primary_category?.icon ?? null,
              category_color: p.primary_category?.color ?? null,
              unit_name: p.unit?.name ?? null,
              landmark_description: p.landmark_description,
            }}
            phone={phone}
            whatsapp={whatsapp}
            latitude={p.latitude}
            longitude={p.longitude}
          />
        </div>
      </div>

      {/* min-w-0 : une colonne de grille ne rétrécit pas sous la largeur de son contenu
          (rangée de photos) sans cela, ce qui faisait défiler la page horizontalement. */}
      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {(p.short_description || p.full_description) && (
            <section>
              <h2 className="mb-2 text-lg font-bold">Présentation</h2>
              {p.short_description && <p className="font-medium">{p.short_description}</p>}
              {p.full_description && (
                <p className="text-muted mt-2 text-[15px] leading-relaxed whitespace-pre-line">
                  {p.full_description}
                </p>
              )}
            </section>
          )}

          <section className="border-line bg-surface rounded-[var(--radius-card)] border p-4">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
              <Route className="text-brand size-5" aria-hidden="true" /> Comment s&apos;y rendre
            </h2>
            {p.landmark_description && (
              <p className="text-[15px]">
                <span className="font-semibold">Repère : </span>
                {p.landmark_description}
              </p>
            )}
            {p.directions && (
              <p className="text-muted mt-2 text-[15px] whitespace-pre-line">{p.directions}</p>
            )}
            {!p.landmark_description && !p.directions && (
              <p className="text-muted text-sm">Aucune indication de chemin renseignée.</p>
            )}
            <div className="border-line mt-3 flex flex-wrap items-center gap-3 border-t pt-3 text-sm">
              <span className="text-muted">{PRECISION_LABEL[p.geographic_precision]}</span>
              {hasCoords && (
                <>
                  <span className="font-mono text-xs">{formatCoordinates(p.latitude!, p.longitude!)}</span>
                  <Link
                    href={`/carte?lieu=${p.slug}&lat=${p.latitude}&lng=${p.longitude}`}
                    className="text-brand inline-flex items-center gap-1 font-semibold"
                  >
                    <MapIcon className="size-4" aria-hidden="true" /> Voir sur la carte
                  </Link>
                </>
              )}
            </div>
          </section>

          {p.catalog_items.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
                <ShoppingBag className="text-brand size-5" aria-hidden="true" /> Catalogue
              </h2>
              <ul className="border-line bg-surface divide-line divide-y rounded-[var(--radius-card)] border">
                {p.catalog_items.map((it) => (
                  <li key={it.id} className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{it.name}</p>
                      {it.description && (
                        <p className="text-muted text-sm whitespace-pre-line">{it.description}</p>
                      )}
                      {it.availability === "unavailable" && (
                        <p className="text-warning text-xs font-medium">Actuellement indisponible</p>
                      )}
                      {it.availability === "on_request" && (
                        <p className="text-muted text-xs font-medium">Sur demande</p>
                      )}
                    </div>
                    <p className="shrink-0 text-right font-bold whitespace-nowrap">
                      {formatPrice(it.price, it.currency)}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="text-muted mt-1 text-xs">
                Prix indiqués par l&apos;établissement, susceptibles d&apos;évoluer.
              </p>
            </section>
          )}

          {p.place_services.length > 0 && (
            <section>
              <h2 className="mb-2 text-lg font-bold">Services proposés</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {p.place_services.map((s) => (
                  <li key={s.id} className="bg-surface-2 rounded-2xl p-3">
                    <span className="font-medium">{s.name}</span>
                    {s.description && <p className="text-muted text-sm">{s.description}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <PhotoStrip
            photos={photos}
            skip={heroPhoto ? 1 : 0}
            title={<h2 className="mb-2 text-lg font-bold">Photos ({photos.length})</h2>}
          />

          <section>
            <h2 className="mb-2 text-lg font-bold">Avis</h2>
            {reviews.length === 0 ? (
              <p className="text-muted text-sm">Aucun avis publié pour l&apos;instant.</p>
            ) : (
              <ul className="space-y-3">
                {reviews.map((r) => (
                  <li key={r.id} className="border-line bg-surface rounded-2xl border p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{r.author_name}</span>
                      <span className="inline-flex items-center gap-1">
                        <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                        {r.rating}/5
                      </span>
                    </div>
                    {r.title && <p className="mt-1 font-medium">{r.title}</p>}
                    {r.body && <p className="text-muted mt-1 text-sm">{r.body}</p>}
                    {r.owner_response && (
                      <p className="bg-surface-2 mt-2 rounded-xl p-3 text-sm">
                        <span className="font-semibold">Réponse de l&apos;établissement : </span>
                        {r.owner_response}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="border-line bg-surface rounded-[var(--radius-card)] border p-4">
            <h2 className="mb-2 font-bold">Horaires</h2>
            <OpeningHours hours={p.place_hours} verifiedAt={p.hours_verified_at} />
          </section>

          {otherContacts.length > 0 && (
            <section className="border-line bg-surface rounded-[var(--radius-card)] border p-4">
              <h2 className="mb-2 font-bold">Contacts</h2>
              <ul className="space-y-2 text-sm">
                {otherContacts.map((c) => (
                  <li key={c.id}>
                    {c.kind === "email" ? (
                      <a href={`mailto:${c.value}`} className="text-brand inline-flex items-center gap-2">
                        <Mail className="size-4" aria-hidden="true" />
                        {c.value}
                      </a>
                    ) : /^https?:\/\//.test(c.value) ? (
                      <a
                        href={c.value}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-brand inline-flex items-center gap-2 break-all"
                      >
                        <Globe className="size-4 shrink-0" aria-hidden="true" />
                        {c.label ?? c.value.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      <span>{c.value}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(p.place_amenity_links.length > 0 ||
            p.wheelchair_accessible != null ||
            p.payment_methods.length > 0 ||
            p.price_range) && (
            <section className="border-line bg-surface rounded-[var(--radius-card)] border p-4 text-sm">
              <h2 className="mb-2 font-bold">Informations pratiques</h2>
              <ul className="space-y-1.5">
                {p.place_amenity_links.map(
                  (a) => a.amenity && <li key={a.amenity.key}>• {a.amenity.name}</li>,
                )}
                {p.wheelchair_accessible != null && (
                  <li className="flex items-center gap-1.5">
                    <Accessibility className="size-4" aria-hidden="true" />
                    {p.wheelchair_accessible
                      ? "Accessible en fauteuil roulant"
                      : "Non accessible en fauteuil roulant"}
                  </li>
                )}
                {p.payment_methods.length > 0 && <li>Paiements déclarés : {p.payment_methods.join(", ")}</li>}
                {p.price_range && <li>Gamme de prix : {"$".repeat(p.price_range)}</li>}
              </ul>
              <p className="text-muted mt-2 text-xs">Informations déclarées, susceptibles d&apos;évoluer.</p>
            </section>
          )}

          {extraCategories.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {extraCategories.map(
                (c) =>
                  c && (
                    <li key={c.id}>
                      <Link
                        href={`/categories/${c.slug}`}
                        className="bg-surface-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
                      >
                        <CategoryBadge icon={c.icon} color={c.color} size="sm" /> {c.name}
                      </Link>
                    </li>
                  ),
              )}
            </ul>
          )}

          <section className="border-line bg-surface space-y-3 rounded-[var(--radius-card)] border p-4 text-sm">
            <p className="text-muted">
              {p.last_verified_at
                ? `Dernière vérification : ${formatDate(p.last_verified_at)}`
                : "Fiche pas encore vérifiée sur le terrain."}
              <br />
              Mise à jour : {formatDate(p.updated_at)}
            </p>
            {p.place_external_refs.map((ref) => (
              <p key={`${ref.source}-${ref.source_url}`} className="text-muted">
                Source :{" "}
                {ref.source_url ? (
                  <a
                    href={ref.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand underline"
                  >
                    {ref.attribution}
                  </a>
                ) : (
                  ref.attribution
                )}{" "}
                (
                {ref.source === "osm" ? (
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {ref.license}
                  </a>
                ) : (
                  <Link href="/sources" className="underline">
                    {ref.license}
                  </Link>
                )}
                ). Informations importées, à confirmer sur place.
              </p>
            ))}
            {p.ownership_status !== "claimed" && (
              <p className="flex items-start gap-2">
                <Building2 className="text-brand size-4 shrink-0" aria-hidden="true" />
                <span>
                  Vous gérez cet établissement ?{" "}
                  <Link
                    href={`/espace-pro/reclamer/${p.slug}`}
                    className="text-brand font-semibold underline"
                  >
                    Réclamez cette fiche
                  </Link>{" "}
                  pour ajouter votre téléphone, vos photos, votre logo et votre catalogue.
                </span>
              </p>
            )}
            <ReportForm placeId={p.id} />
          </section>
        </aside>
      </div>
    </article>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ImageUpload } from "@/components/forms/image-upload";
import { requireUser } from "@/features/auth/session";
import { getManagedPlace } from "@/features/owner/queries";
import { addPhoto, uploadLogo } from "@/features/owner/actions";
import { env } from "@/lib/env";
import { placeMediaUrl } from "@/lib/supabase/storage";
import { CatalogManager, ContactsForm, InfoForm, PhotoGrid, ShareBox } from "./manage-forms";

export const metadata: Metadata = { title: "Gérer ma fiche", robots: { index: false } };

const MAX_PHOTOS = 3;
type Props = { params: Promise<{ id: string }> };

export default async function ManagePlacePage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser(`/espace-pro/lieux/${id}`);
  const place = await getManagedPlace(id, user.id);
  if (!place) notFound();

  const photos = place.place_media
    .filter((m) => m.kind === "cover" || m.kind === "gallery")
    .map((m) => ({
      id: m.id,
      url: placeMediaUrl(m.storage_path)!,
      pending: m.moderation_status !== "approved",
    }));
  const publicUrl = `${env.NEXT_PUBLIC_SITE_URL}/lieux/${place.slug}`;
  const card = "border-line bg-surface space-y-4 rounded-[var(--radius-card)] border p-4";

  return (
    <div className="mx-auto max-w-2xl space-y-5 pt-6 pb-4">
      <Link href="/espace-pro" className="text-muted inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="size-4" aria-hidden="true" /> Espace professionnel
      </Link>
      <header className="flex items-center gap-3">
        <Avatar src={placeMediaUrl(place.logo_path)} name={place.name} size={56} rounded="xl" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{place.name}</h1>
          <Link
            href={`/lieux/${place.slug}`}
            className="text-brand inline-flex items-center gap-1 text-sm font-semibold"
          >
            Voir ma fiche publique <ExternalLink className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      {place.publication_status === "published" && <ShareBox url={publicUrl} name={place.name} />}

      <section className={card}>
        <h2 className="font-bold">Logo</h2>
        <ImageUpload
          action={uploadLogo}
          field="logo"
          maxSide={512}
          hidden={{ place_id: place.id }}
          label={place.logo_path ? "Changer le logo" : "Ajouter un logo"}
        >
          <Avatar src={placeMediaUrl(place.logo_path)} name={place.name} size={64} rounded="xl" />
        </ImageUpload>
      </section>

      <section className={card}>
        <h2 className="font-bold">
          Photos ({photos.length}/{MAX_PHOTOS})
        </h2>
        {photos.length > 0 && <PhotoGrid placeId={place.id} photos={photos} />}
        <ImageUpload
          action={addPhoto}
          field="photo"
          maxSide={1600}
          hidden={{ place_id: place.id }}
          label="Ajouter une photo"
          disabled={photos.length >= MAX_PHOTOS}
          disabledReason={`Limite de ${MAX_PHOTOS} photos atteinte : supprimez-en une pour en ajouter une autre.`}
        />
        <p className="text-muted text-xs">
          Photos réduites et optimisées automatiquement (WebP, sans données GPS).
        </p>
      </section>

      <ContactsForm place={place} />
      <CatalogManager placeId={place.id} items={place.catalog_items} />
      <InfoForm place={place} />
    </div>
  );
}

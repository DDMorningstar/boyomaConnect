import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { ImageUpload } from "@/components/forms/image-upload";
import { getConsolePlace } from "@/features/owner/business";
import { addPhoto, uploadLogo } from "@/features/owner/actions";
import { env } from "@/lib/env";
import { placeMediaUrl } from "@/lib/supabase/storage";
import { ContactsForm, InfoForm, PhotoGrid, ShareBox } from "./manage-forms";
import { Panel } from "../ui";

const MAX_PHOTOS = 3;
type Props = { params: Promise<{ id: string }> };

/** Fiche : logo, photos, contacts et informations (l'accès est vérifié par le layout). */
export default async function ManagePlacePage({ params }: Props) {
  const { id } = await params;
  const place = await getConsolePlace(id);
  if (!place) notFound();

  const photos = place.place_media
    .filter((m) => m.kind === "cover" || m.kind === "gallery")
    .map((m) => ({
      id: m.id,
      url: placeMediaUrl(m.storage_path)!,
      pending: m.moderation_status !== "approved",
    }));
  const publicUrl = `${env.NEXT_PUBLIC_SITE_URL}/lieux/${place.slug}`;

  return (
    <div className="max-w-2xl space-y-5">
      {place.publication_status === "published" && <ShareBox url={publicUrl} name={place.name} />}

      <Panel id="logo" title="Logo">
        <ImageUpload
          action={uploadLogo}
          field="logo"
          maxSide={512}
          hidden={{ place_id: place.id }}
          label={place.logo_path ? "Changer le logo" : "Ajouter un logo"}
        >
          <Avatar src={placeMediaUrl(place.logo_path)} name={place.name} size={64} rounded="xl" />
        </ImageUpload>
      </Panel>

      <Panel id="photos" title={`Photos (${photos.length}/${MAX_PHOTOS})`}>
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
      </Panel>

      <ContactsForm place={place} />
      <InfoForm place={place} />
    </div>
  );
}

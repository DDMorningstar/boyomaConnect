import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { InfoPage } from "@/components/ui/info-page";
import { requireUser } from "@/features/auth/session";
import { getPlaceBySlug } from "@/features/places/queries";
import { ClaimForm } from "./claim-form";

export const metadata: Metadata = { title: "Réclamer une fiche", robots: { index: false } };

type Props = { params: Promise<{ slug: string }> };

export default async function ClaimPage({ params }: Props) {
  const { slug } = await params;
  await requireUser(`/espace-pro/reclamer/${slug}`);
  const res = await getPlaceBySlug(slug);
  if (res.kind !== "found") notFound();
  const p = res.place;

  if (p.ownership_status === "claimed") {
    return (
      <InfoPage title={p.name} intro="Cette fiche est déjà gérée par son établissement.">
        <p>Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, signalez-le depuis la fiche.</p>
        <ButtonLink href={`/lieux/${p.slug}`} variant="secondary">
          Retour à la fiche
        </ButtonLink>
      </InfoPage>
    );
  }
  return (
    <InfoPage
      title={`Réclamer « ${p.name} »`}
      intro="Notre équipe vérifie que vous gérez bien cet établissement (appel ou visite), puis vous donne accès à la fiche : téléphone, photos, logo, catalogue et prix."
    >
      <ClaimForm placeId={p.id} />
    </InfoPage>
  );
}

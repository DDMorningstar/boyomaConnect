import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Clock, PlusCircle, Search, Store } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/features/auth/session";
import { getOwnerDashboard } from "@/features/owner/queries";
import { getMyInvitations } from "@/features/owner/business";
import { respondInvitation } from "@/features/owner/business-actions";
import { ActionButton } from "@/components/forms/action-forms";
import { placeMediaUrl } from "@/lib/supabase/storage";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Espace professionnel", robots: { index: false } };

const SUBMISSION_STATUS: Record<string, string> = {
  pending: "En cours de validation",
  needs_changes: "Corrections demandées",
  rejected: "Refusée",
  duplicate: "Doublon d'une fiche existante",
};
const CLAIM_STATUS: Record<string, string> = {
  pending: "En cours de validation",
  rejected: "Refusée",
  cancelled: "Annulée",
};

type Props = { searchParams: Promise<{ envoye?: string }> };

export default async function OwnerHome({ searchParams }: Props) {
  const user = await requireUser("/espace-pro");
  const { envoye } = await searchParams;
  const [{ places, submissions, claims }, invitations] = await Promise.all([
    getOwnerDashboard(user.id),
    getMyInvitations(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Espace professionnel</h1>
        <p className="text-muted mt-1">
          Gérez votre établissement en ligne : statistiques, fiche, catalogue, horaires, demandes des clients,
          offres et avis.
        </p>
      </header>

      {envoye && (
        <p role="status" className="bg-success/10 text-success rounded-2xl p-3 text-sm font-medium">
          {envoye === "reclamation"
            ? "Demande envoyée. Notre équipe vérifie que vous gérez bien cet établissement, puis vous donne accès à la fiche."
            : "Fiche envoyée. Elle sera publiée après vérification par notre équipe."}
        </p>
      )}

      {invitations.length > 0 && (
        <section className="space-y-2" aria-labelledby="invitations-titre">
          <h2 id="invitations-titre" className="text-lg font-bold">
            Invitations à gérer une fiche
          </h2>
          <ul className="space-y-2">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="border-brand/40 bg-brand/5 flex flex-wrap items-center gap-3 rounded-2xl border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{inv.place_name}</p>
                  <p className="text-muted text-xs">
                    Invitation valable jusqu&apos;au {formatDate(inv.expires_at)}
                  </p>
                </div>
                <ActionButton
                  action={respondInvitation}
                  hidden={{ id: inv.id, decision: "accept" }}
                  variant="primary"
                >
                  Accepter
                </ActionButton>
                <ActionButton action={respondInvitation} hidden={{ id: inv.id, decision: "decline" }}>
                  Refuser
                </ActionButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Mes établissements</h2>
        {places.length === 0 ? (
          <p className="text-muted text-sm">Aucune fiche validée pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-2">
            {places.map(({ place, role }) =>
              place ? (
                <li key={place.id}>
                  <Link
                    href={`/espace-pro/lieux/${place.id}`}
                    className="border-line bg-surface hover:bg-surface-2 flex items-center gap-3 rounded-2xl border p-3"
                  >
                    <Avatar src={placeMediaUrl(place.logo_path)} name={place.name} size={48} rounded="xl" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{place.name}</span>
                      <span className="text-muted text-sm">
                        {place.primary_category?.name ?? "Établissement"} ·{" "}
                        {role === "owner" ? "Propriétaire" : "Gestionnaire"}
                        {place.publication_status !== "published" && " · non publiée"}
                      </span>
                    </span>
                    <ChevronRight className="text-muted size-5" aria-hidden="true" />
                  </Link>
                </li>
              ) : null,
            )}
          </ul>
        )}
      </section>

      {(submissions.length > 0 || claims.length > 0) && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">Demandes en cours</h2>
          <ul className="space-y-2 text-sm">
            {submissions.map((s) => (
              <li key={s.id} className="border-line bg-surface rounded-2xl border p-3">
                <p className="font-semibold">Nouvelle fiche : {s.name}</p>
                <p className="text-muted flex items-center gap-1.5">
                  <Clock className="size-4" aria-hidden="true" /> {SUBMISSION_STATUS[s.status] ?? s.status} ·
                  envoyée le {formatDate(s.created_at)}
                </p>
                {s.review_notes && <p className="mt-1">Motif : {s.review_notes}</p>}
              </li>
            ))}
            {claims.map((c) => (
              <li key={c.id} className="border-line bg-surface rounded-2xl border p-3">
                <p className="font-semibold">Réclamation : {c.place?.name ?? "fiche"}</p>
                <p className="text-muted flex items-center gap-1.5">
                  <Clock className="size-4" aria-hidden="true" /> {CLAIM_STATUS[c.status] ?? c.status} ·
                  envoyée le {formatDate(c.created_at)}
                </p>
                {c.review_notes && <p className="mt-1">Motif : {c.review_notes}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-line bg-surface space-y-3 rounded-[var(--radius-card)] border p-4">
        <h2 className="flex items-center gap-2 font-bold">
          <Store className="text-brand size-5" aria-hidden="true" /> Ajouter mon établissement
        </h2>
        <p className="text-muted text-sm">
          Votre établissement est peut-être déjà sur Boyoma Connect : cherchez-le et réclamez sa fiche. Sinon,
          créez-la ; elle sera publiée après vérification.
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/recherche" variant="secondary">
            <Search className="size-4" aria-hidden="true" /> Chercher ma fiche
          </ButtonLink>
          <ButtonLink href="/espace-pro/nouvelle-fiche">
            <PlusCircle className="size-4" aria-hidden="true" /> Créer ma fiche
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}

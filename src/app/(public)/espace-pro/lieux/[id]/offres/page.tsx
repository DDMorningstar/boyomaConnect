import { notFound } from "next/navigation";
import { Tag } from "lucide-react";
import { inputClass, labelClass } from "@/components/forms/form-message";
import { getConsolePlace, getPromotions, type Promotion } from "@/features/owner/business";
import { endPromotion, submitPromotion } from "@/features/owner/business-actions";
import { ActionButton, BizForm } from "@/components/forms/action-forms";
import { Empty, Panel, PlanGate, shortDate } from "../ui";

type Props = { params: Promise<{ id: string }> };

const STATUS: Record<Promotion["status"], { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "bg-surface-2 text-muted" },
  pending_review: { label: "En vérification", cls: "bg-warning/15 text-warning" },
  active: { label: "Publiée", cls: "bg-success/15 text-success" },
  ended: { label: "Terminée", cls: "bg-surface-2 text-muted" },
  rejected: { label: "Refusée", cls: "bg-danger/10 text-danger" },
};

/**
 * Offres datées : affichées sur la fiche et dans « Offres du moment » après vérification par l'équipe.
 * Ce n'est pas de la publicité : elles ne modifient jamais le classement des résultats.
 */
export default async function OffersPage({ params }: Props) {
  const { id } = await params;
  const place = await getConsolePlace(id);
  if (!place) notFound();
  const { promotions, allowed } = await getPromotions(place.id);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lubumbashi" }).format(new Date());
  const now = Date.now();

  return (
    <div className="max-w-3xl space-y-5">
      <Panel
        title="Nouvelle offre"
        description="Promotion, nouveauté, menu du jour… Durée de 60 jours au plus, 3 offres en cours au maximum. Chaque offre est relue par l'équipe avant publication."
      >
        {!allowed ? (
          <PlanGate placeId={place.id} feature="La publication d'offres" plans="Premium et Sponsor" />
        ) : (
          <BizForm
            action={submitPromotion}
            hidden={{ place_id: place.id }}
            submit="Envoyer pour vérification"
            resetOnSuccess
          >
            <div>
              <label htmlFor="of-title" className={labelClass}>
                Titre *
              </label>
              <input
                id="of-title"
                name="title"
                required
                minLength={3}
                maxLength={120}
                placeholder="Ex. : -10 % sur les pagnes jusqu'à samedi"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="of-desc" className={labelClass}>
                Détails
              </label>
              <textarea id="of-desc" name="description" rows={3} maxLength={1000} className={inputClass} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="of-start" className={labelClass}>
                  Début *
                </label>
                <input
                  id="of-start"
                  name="starts_at"
                  type="date"
                  min={today}
                  defaultValue={today}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="of-end" className={labelClass}>
                  Fin *
                </label>
                <input id="of-end" name="ends_at" type="date" min={today} required className={inputClass} />
              </div>
            </div>
          </BizForm>
        )}
      </Panel>

      <Panel title="Mes offres">
        {promotions.length === 0 ? (
          <Empty icon={<Tag className="size-6" aria-hidden="true" />}>
            Aucune offre pour l&apos;instant.
          </Empty>
        ) : (
          <ul className="divide-line divide-y">
            {promotions.map((p) => {
              const expired = new Date(p.ends_at).getTime() < now;
              const st = p.status === "active" && expired ? STATUS.ended : STATUS[p.status];
              return (
                <li key={p.id} className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.title}</p>
                    {p.description && <p className="text-muted line-clamp-2 text-sm">{p.description}</p>}
                    <p className="text-muted mt-1 text-xs">
                      Du {shortDate(p.starts_at)} au {shortDate(p.ends_at)}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>
                    {st.label}
                  </span>
                  {(p.status === "active" || p.status === "pending_review") && !expired && (
                    <ActionButton
                      action={endPromotion}
                      hidden={{ place_id: place.id, id: p.id }}
                      variant="danger"
                      confirm="Arrêter cette offre maintenant ?"
                    >
                      Arrêter
                    </ActionButton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

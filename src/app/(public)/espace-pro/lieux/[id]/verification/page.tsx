import { notFound } from "next/navigation";
import { BadgeCheck, CalendarClock, Clock } from "lucide-react";
import { inputClass, labelClass } from "@/components/forms/form-message";
import {
  getConsolePlace,
  getVerificationRequests,
  type VerificationRequest,
} from "@/features/owner/business";
import { cancelVerification, requestVerification } from "@/features/owner/business-actions";
import { ActionButton, BizForm } from "@/components/forms/action-forms";
import { Panel, dateTime, shortDate } from "../ui";

type Props = { params: Promise<{ id: string }> };

const STATUS: Record<VerificationRequest["status"], string> = {
  pending: "En attente de prise en charge",
  scheduled: "Visite programmée",
  completed: "Vérification effectuée",
  rejected: "Refusée",
  cancelled: "Annulée",
};

/** Vérification sur place par un agent : badge « Vérifiée » visible sur la fiche. */
export default async function VerificationPage({ params }: Props) {
  const { id } = await params;
  const place = await getConsolePlace(id);
  if (!place) notFound();
  const requests = await getVerificationRequests(place.id);
  const open = requests.find((r) => r.status === "pending" || r.status === "scheduled");
  const agentVerified = place.verification_status === "agent_verified";
  const sixMonths = 180 * 24 * 3600 * 1000;
  const recent =
    place.last_verified_at && Date.now() - new Date(place.last_verified_at).getTime() < sixMonths;

  return (
    <div className="max-w-3xl space-y-5">
      <Panel
        title="Badge « Vérifiée »"
        description="Un agent Boyoma Connect passe à votre adresse, confirme l'existence de l'établissement, sa position et ses contacts. La vérification est gratuite."
      >
        <div className="bg-surface-2 flex items-center gap-3 rounded-2xl p-4">
          <BadgeCheck
            className={`size-8 shrink-0 ${agentVerified ? "text-success" : "text-muted"}`}
            aria-hidden="true"
          />
          <div>
            <p className="font-bold">
              {agentVerified ? "Fiche vérifiée sur place" : "Fiche non vérifiée sur place"}
            </p>
            {place.last_verified_at && (
              <p className="text-muted text-sm">
                Dernière vérification : {shortDate(place.last_verified_at)}
              </p>
            )}
          </div>
        </div>
      </Panel>

      {open ? (
        <Panel title="Demande en cours">
          <div className="flex items-start gap-3">
            {open.status === "scheduled" ? (
              <CalendarClock className="text-brand size-6 shrink-0" aria-hidden="true" />
            ) : (
              <Clock className="text-warning size-6 shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{STATUS[open.status]}</p>
              {open.scheduled_for && <p>Passage prévu : {dateTime(open.scheduled_for)}</p>}
              {open.admin_notes && <p className="text-muted">Note de l&apos;équipe : {open.admin_notes}</p>}
              <p className="text-muted">Demandée le {shortDate(open.created_at)}</p>
            </div>
          </div>
          <ActionButton
            action={cancelVerification}
            hidden={{ place_id: place.id, id: open.id }}
            variant="danger"
            confirm="Annuler la demande de vérification ?"
          >
            Annuler la demande
          </ActionButton>
        </Panel>
      ) : recent ? (
        <Panel title="Demander une visite">
          <p className="text-muted text-sm">
            Votre fiche a été vérifiée il y a moins de 6 mois : une nouvelle demande sera possible après le{" "}
            {shortDate(new Date(new Date(place.last_verified_at!).getTime() + sixMonths).toISOString())}.
          </p>
        </Panel>
      ) : (
        <Panel title="Demander une visite" description="L'équipe vous appelle pour convenir d'un passage.">
          <BizForm
            action={requestVerification}
            hidden={{ place_id: place.id }}
            submit="Demander la vérification"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="vr-phone" className={labelClass}>
                  Téléphone pour vous joindre
                </label>
                <input
                  id="vr-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="+243…"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="vr-pref" className={labelClass}>
                  Moment préféré
                </label>
                <input
                  id="vr-pref"
                  name="preferred"
                  maxLength={120}
                  placeholder="Ex. : en semaine, le matin"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label htmlFor="vr-notes" className={labelClass}>
                Indications pour l&apos;agent
              </label>
              <textarea id="vr-notes" name="notes" rows={2} maxLength={500} className={inputClass} />
            </div>
          </BizForm>
        </Panel>
      )}

      {requests.filter((r) => r !== open).length > 0 && (
        <Panel title="Historique">
          <ul className="divide-line divide-y text-sm">
            {requests
              .filter((r) => r !== open)
              .map((r) => (
                <li key={r.id} className="flex flex-wrap gap-2 py-2">
                  <span className="w-32">{shortDate(r.created_at)}</span>
                  <span className="font-semibold">{STATUS[r.status]}</span>
                  {r.admin_notes && <span className="text-muted">· {r.admin_notes}</span>}
                </li>
              ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

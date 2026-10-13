import { notFound } from "next/navigation";
import { Mail, UserMinus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { inputClass, labelClass } from "@/components/forms/form-message";
import { getConsolePlace, getTeam } from "@/features/owner/business";
import { manageMember, inviteMember } from "@/features/owner/business-actions";
import { ActionButton, BizForm } from "@/components/forms/action-forms";
import { Panel, shortDate } from "../ui";

type Props = { params: Promise<{ id: string }> };

/** Équipe : le propriétaire invite jusqu'à 5 gestionnaires (fiche, catalogue, demandes). */
export default async function TeamPage({ params }: Props) {
  const { id } = await params;
  const place = await getConsolePlace(id);
  if (!place) notFound();
  const { members, invitations } = await getTeam(place.id);
  const isOwner = place.my_role === "owner";
  const hidden = { place_id: place.id };

  return (
    <div className="max-w-3xl space-y-5">
      <Panel
        title="Membres"
        description="Les gestionnaires modifient la fiche, le catalogue, les horaires et traitent les demandes. Seul le propriétaire gère l'équipe et l'abonnement."
      >
        <ul className="divide-line divide-y">
          {members.map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar src={m.avatar_url} name={m.display_name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {m.display_name}
                  {m.is_me && <span className="text-muted font-normal"> (vous)</span>}
                </p>
                <p className="text-muted text-xs">
                  {m.role === "owner" ? "Propriétaire" : "Gestionnaire"} · depuis le {shortDate(m.since)}
                </p>
              </div>
              {m.role === "manager" && (isOwner || m.is_me) && (
                <ActionButton
                  action={manageMember}
                  hidden={{ ...hidden, id: m.user_id, decision: "remove" }}
                  variant="danger"
                  confirm={
                    m.is_me ? "Quitter la gestion de cette fiche ?" : `Retirer l'accès de ${m.display_name} ?`
                  }
                >
                  <UserMinus className="size-3.5" aria-hidden="true" /> {m.is_me ? "Quitter" : "Retirer"}
                </ActionButton>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      {isOwner ? (
        <Panel
          title="Inviter un gestionnaire"
          description="La personne crée un compte (ou se connecte) avec cette adresse e-mail puis accepte l'invitation depuis son Espace pro. Valable 14 jours."
        >
          {invitations.length > 0 && (
            <ul className="divide-line divide-y">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <Mail className="text-muted size-4" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{inv.email}</span>
                  <span className="text-muted text-xs">expire le {shortDate(inv.expires_at)}</span>
                  <ActionButton
                    action={manageMember}
                    hidden={{ ...hidden, id: inv.id, decision: "revoke_invitation" }}
                    variant="danger"
                  >
                    Annuler
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
          <BizForm action={inviteMember} hidden={hidden} submit="Envoyer l'invitation" resetOnSuccess>
            <div>
              <label htmlFor="inv-email" className={labelClass}>
                Adresse e-mail
              </label>
              <input
                id="inv-email"
                name="email"
                type="email"
                required
                autoComplete="off"
                className={inputClass}
              />
            </div>
          </BizForm>
        </Panel>
      ) : (
        <p className="text-muted text-sm">
          Seul le propriétaire de la fiche peut inviter de nouveaux gestionnaires.
        </p>
      )}
    </div>
  );
}

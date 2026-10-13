import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { inputClass } from "@/components/forms/form-message";
import { getConsolePlace, getOwnerReviews } from "@/features/owner/business";
import { respondToReview } from "@/features/owner/business-actions";
import { BizForm } from "@/components/forms/action-forms";
import { Empty, Panel, shortDate } from "../ui";

type Props = { params: Promise<{ id: string }> };

/** Avis publiés et réponse publique de l'établissement (affichée sous l'avis). */
export default async function ReviewsPage({ params }: Props) {
  const { id } = await params;
  const place = await getConsolePlace(id);
  if (!place) notFound();
  const reviews = await getOwnerReviews(place.id);
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
  const answered = reviews.filter((r) => r.owner_response).length;

  return (
    <div className="max-w-3xl space-y-5">
      <Panel
        title="Avis des visiteurs"
        description="Les avis sont relus par l'équipe avant publication. Une réponse courtoise et précise rassure les futurs clients."
      >
        {reviews.length > 0 && (
          <div className="flex flex-wrap gap-6 text-sm">
            <p>
              <span className="text-2xl font-extrabold tabular-nums">{avg!.toFixed(1)}</span>
              <span className="text-muted"> / 5 · {reviews.length} avis</span>
            </p>
            <p>
              <span className="text-2xl font-extrabold tabular-nums">{answered}</span>
              <span className="text-muted">
                {" "}
                réponse{answered > 1 ? "s" : ""} publiée{answered > 1 ? "s" : ""}
              </span>
            </p>
          </div>
        )}
      </Panel>

      {reviews.length === 0 ? (
        <Empty icon={<Star className="size-6" aria-hidden="true" />}>
          Aucun avis publié pour l&apos;instant.
        </Empty>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="border-line bg-surface space-y-3 rounded-[var(--radius-card)] border p-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-2">
                <span className="text-warning flex" aria-label={`${r.rating} sur 5`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className={`size-4 ${i < r.rating ? "fill-current" : "opacity-30"}`}
                      aria-hidden="true"
                    />
                  ))}
                </span>
                <span className="text-muted text-xs">{shortDate(r.created_at)}</span>
              </div>
              {r.title && <p className="font-semibold">{r.title}</p>}
              {r.body && <p className="text-[15px] whitespace-pre-line">{r.body}</p>}
              <BizForm
                action={respondToReview}
                hidden={{ place_id: place.id, id: r.id }}
                submit={r.owner_response ? "Mettre à jour la réponse" : "Publier la réponse"}
                className="bg-surface-2 space-y-2 rounded-2xl p-3"
              >
                <label htmlFor={`rep-${r.id}`} className="text-sm font-semibold">
                  Votre réponse publique
                  {r.owner_response_at && (
                    <span className="text-muted font-normal"> · {shortDate(r.owner_response_at)}</span>
                  )}
                </label>
                <textarea
                  id={`rep-${r.id}`}
                  name="response"
                  rows={3}
                  maxLength={2000}
                  defaultValue={r.owner_response ?? ""}
                  placeholder="Merci pour votre visite…  (laisser vide puis enregistrer pour retirer la réponse)"
                  className={inputClass}
                />
              </BizForm>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

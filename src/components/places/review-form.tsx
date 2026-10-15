"use client";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import { FormMessage, inputClass, labelClass } from "@/components/forms/form-message";
import { saveReview, type ReviewState } from "@/features/places/review-actions";
import type { MyReview } from "@/features/places/engagement";
import { celebrate } from "@/lib/celebrate";
import { haptic } from "@/lib/haptics";

type Props =
  | { placeId: string; slug: string; signedIn: false }
  | { placeId: string; slug: string; signedIn: true; isManager: boolean; review: MyReview | null };

const LABELS = ["", "Très décevant", "Décevant", "Correct", "Bien", "Excellent"];

/** Donner ou modifier son avis (un par établissement), publié après modération. */
export function ReviewForm(props: Props) {
  const [open, setOpen] = useState(false);
  if (!props.signedIn) {
    return (
      <p className="text-muted text-sm">
        <Link
          href={`/connexion?next=${encodeURIComponent(`/lieux/${props.slug}#avis`)}`}
          className="text-brand font-semibold"
        >
          Connectez-vous
        </Link>{" "}
        pour donner votre avis.
      </p>
    );
  }
  if (props.isManager) return null;
  const { review } = props;
  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-line hover:bg-surface-2 inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
        >
          <Star className="size-4" aria-hidden="true" /> {review ? "Modifier mon avis" : "Donner mon avis"}
        </button>
        {review?.status === "pending" && (
          <span className="text-muted text-xs">Votre avis est en cours de vérification.</span>
        )}
        {review?.status === "rejected" && (
          <span className="text-muted text-xs">Votre avis n&apos;a pas été publié.</span>
        )}
      </div>
    );
  }
  return <Form placeId={props.placeId} review={review} />;
}

function Form({ placeId, review }: { placeId: string; review: MyReview | null }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(saveReview, null);
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const thisMonth = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    if (!state?.ok) return;
    haptic("success");
    celebrate();
  }, [state]);

  if (state?.ok) {
    return (
      <p
        role="status"
        className="bg-success/10 text-success flex items-start gap-2 rounded-2xl p-4 text-sm font-medium"
      >
        <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" /> {state.ok}
      </p>
    );
  }
  const shown = hover || rating;
  return (
    <form action={action} className="border-line bg-surface space-y-3 rounded-2xl border p-4">
      <input type="hidden" name="place_id" value={placeId} />
      <input type="hidden" name="rating" value={rating} />
      <fieldset>
        <legend className={labelClass}>Votre note *</legend>
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              aria-label={`${n} sur 5 : ${LABELS[n]}`}
              aria-pressed={rating === n}
              className="p-1"
            >
              <Star
                className={`size-7 ${n <= shown ? "fill-amber-400 text-amber-400" : "text-line"}`}
                aria-hidden="true"
              />
            </button>
          ))}
          <span className="text-muted ml-2 text-sm">{LABELS[shown]}</span>
        </div>
      </fieldset>
      <div>
        <label htmlFor="rv-title" className={labelClass}>
          Titre
        </label>
        <input
          id="rv-title"
          name="title"
          maxLength={120}
          defaultValue={review?.title ?? ""}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="rv-body" className={labelClass}>
          Votre expérience
        </label>
        <textarea
          id="rv-body"
          name="body"
          rows={4}
          maxLength={3000}
          defaultValue={review?.body ?? ""}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="rv-month" className={labelClass}>
          Mois de la visite
        </label>
        <input
          id="rv-month"
          name="visit_month"
          type="month"
          max={thisMonth}
          defaultValue={review?.visit_month?.slice(0, 7) ?? ""}
          className={inputClass}
        />
      </div>
      <p className="text-muted text-xs">
        Les avis sont relus avant publication : restez factuel et courtois, sans données personnelles.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || rating === 0}
          className="bg-brand hover:bg-brand-strong inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {review ? "Mettre à jour mon avis" : "Publier mon avis"}
        </button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

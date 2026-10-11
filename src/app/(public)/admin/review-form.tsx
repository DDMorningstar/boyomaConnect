"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, inputClass } from "@/components/forms/form-message";
import { reviewClaim, reviewSubmission, type ReviewState } from "@/features/admin/actions";

type Decision = "approve" | "needs_changes" | "reject";

/** Décision de modération : valider, demander des corrections (fiches) ou refuser, avec motif. */
export function ReviewForm({ id, kind }: { id: string; kind: "submission" | "claim" }) {
  const [state, dispatch, pending] = useActionState<ReviewState, FormData>(
    kind === "submission" ? reviewSubmission : reviewClaim,
    null,
  );
  // La décision est ajoutée explicitement : le nom/valeur du bouton cliqué n'est pas transmis
  // de façon fiable par tous les navigateurs.
  const decide = (decision: Decision) => (form: FormData) => {
    form.set("decision", decision);
    dispatch(form);
  };

  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={decide("approve")} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <textarea
        name="notes"
        rows={2}
        maxLength={1000}
        placeholder="Motif (obligatoire pour refuser ou demander des corrections)"
        className={inputClass}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" formAction={decide("approve")} disabled={pending}>
          {kind === "submission" ? "Valider et publier" : "Accorder l'accès"}
        </Button>
        {kind === "submission" && (
          <Button type="submit" formAction={decide("needs_changes")} variant="secondary" disabled={pending}>
            Demander des corrections
          </Button>
        )}
        <Button type="submit" formAction={decide("reject")} variant="ghost" disabled={pending}>
          Refuser
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

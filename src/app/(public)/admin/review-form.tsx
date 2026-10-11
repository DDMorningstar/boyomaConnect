"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, inputClass } from "@/components/forms/form-message";
import { reviewClaim, reviewSubmission, type ReviewState } from "@/features/admin/actions";

/** Décision de modération : valider, demander des corrections (fiches) ou refuser, avec motif. */
export function ReviewForm({ id, kind }: { id: string; kind: "submission" | "claim" }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(
    kind === "submission" ? reviewSubmission : reviewClaim,
    null,
  );
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <textarea
        name="notes"
        rows={2}
        maxLength={1000}
        placeholder="Motif (obligatoire pour refuser ou demander des corrections)"
        className={inputClass}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approve" disabled={pending}>
          {kind === "submission" ? "Valider et publier" : "Accorder l'accès"}
        </Button>
        {kind === "submission" && (
          <Button type="submit" name="decision" value="needs_changes" variant="secondary" disabled={pending}>
            Demander des corrections
          </Button>
        )}
        <Button type="submit" name="decision" value="reject" variant="ghost" disabled={pending}>
          Refuser
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

"use client";
import { startTransition, useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { FormMessage } from "@/components/forms/form-message";

type State = { ok?: string; error?: string } | null;
type Action = (prev: State, form: FormData) => Promise<State>;

export interface Choice {
  value: string;
  label: string;
  tone?: "primary" | "danger" | "neutral";
  /** Motif obligatoire pour ce choix (champ affiché avant confirmation). */
  needsReason?: boolean;
}

const tones = {
  primary: "bg-brand text-white hover:bg-brand-strong",
  danger: "bg-danger/10 text-danger hover:bg-danger/15",
  neutral: "border-line bg-surface hover:bg-surface-2 border",
};

/**
 * Boutons de décision (valider, refuser…) envoyant `field=value` à une action serveur, avec
 * motif facultatif ou obligatoire. Le résultat s'affiche sur place.
 */
export function DecisionButtons({
  action,
  hidden,
  field = "decision",
  choices,
  reasonName = "notes",
  reasonPlaceholder = "Motif (visible dans le journal)",
  compact = false,
}: {
  action: Action;
  hidden: Record<string, string>;
  field?: string;
  choices: Choice[];
  reasonName?: string;
  reasonPlaceholder?: string;
  compact?: boolean;
}) {
  const [state, dispatch, pending] = useActionState<State, FormData>(action, null);
  const [asking, setAsking] = useState<Choice | null>(null);
  const [reason, setReason] = useState("");

  function send(choice: Choice) {
    const form = new FormData();
    Object.entries(hidden).forEach(([k, v]) => form.set(k, v));
    form.set(field, choice.value);
    if (reason) form.set(reasonName, reason);
    startTransition(() => dispatch(form));
    setAsking(null);
  }

  const size = compact ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm";
  return (
    <div className="space-y-2">
      {asking && (
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder={reasonPlaceholder}
          className="border-line bg-surface focus:border-brand w-full rounded-xl border px-3 py-2 text-sm outline-none"
        />
      )}
      <div className="flex flex-wrap gap-2">
        {asking ? (
          <>
            <button
              type="button"
              disabled={pending || !reason.trim()}
              onClick={() => send(asking)}
              className={`${size} ${tones[asking.tone ?? "primary"]} inline-flex items-center gap-1.5 rounded-xl font-semibold disabled:opacity-50`}
            >
              Confirmer : {asking.label}
            </button>
            <button
              type="button"
              onClick={() => setAsking(null)}
              className={`${size} ${tones.neutral} rounded-xl font-semibold`}
            >
              Annuler
            </button>
          </>
        ) : (
          choices.map((c) => (
            <button
              key={c.value}
              type="button"
              disabled={pending}
              onClick={() => (c.needsReason ? setAsking(c) : send(c))}
              className={`${size} ${tones[c.tone ?? "neutral"]} inline-flex items-center gap-1.5 rounded-xl font-semibold transition-transform active:scale-95 disabled:opacity-50`}
            >
              {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {c.label}
            </button>
          ))
        )}
      </div>
      <FormMessage state={state} />
    </div>
  );
}

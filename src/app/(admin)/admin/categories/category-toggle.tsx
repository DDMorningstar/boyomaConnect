"use client";
import { startTransition, useActionState, useOptimistic } from "react";
import { adminToggleCategory, type ReviewState } from "@/features/admin/actions";

/** Interrupteur (actif, mis en avant) appliqué immédiatement, avec retour arrière en cas d'erreur. */
export function CategoryToggle({
  id,
  field,
  value,
  label,
}: {
  id: string;
  field: "is_active" | "is_featured";
  value: boolean;
  label: string;
}) {
  const [state, dispatch, pending] = useActionState<ReviewState, FormData>(adminToggleCategory, null);
  const [optimistic, setOptimistic] = useOptimistic(value);
  return (
    <label className="inline-flex cursor-pointer items-center gap-2" title={state?.error ?? undefined}>
      <span className="sr-only">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={optimistic}
        aria-label={label}
        disabled={pending}
        onClick={() => {
          const f = new FormData();
          f.set("id", id);
          f.set("field", field);
          f.set("value", String(!optimistic));
          startTransition(() => {
            setOptimistic(!optimistic);
            dispatch(f);
          });
        }}
        className={`relative h-6 w-11 rounded-full transition-colors ${optimistic ? "bg-brand" : "bg-line"} disabled:opacity-60`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${optimistic ? "translate-x-5" : ""}`}
        />
      </button>
      {state?.error && <span className="text-danger text-xs">!</span>}
    </label>
  );
}

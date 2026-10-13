"use client";
import { useActionState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { FormMessage } from "@/components/forms/form-message";
import { adminReconcileMalipo, type ReconcileState } from "@/features/admin/payment-actions";

export function ReconcileButton({ disabledReason }: { disabledReason: string | null }) {
  const [state, run, pending] = useActionState<ReconcileState>(adminReconcileMalipo, null);
  return (
    <form action={run} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending || Boolean(disabledReason)}
        title={disabledReason ?? "Relire chez Malipo les paiements restés en attente"}
        className="border-line bg-surface hover:bg-surface-2 inline-flex h-9 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-semibold disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="size-4" aria-hidden="true" />
        )}
        Rapprocher maintenant
      </button>
      <FormMessage state={state} />
    </form>
  );
}

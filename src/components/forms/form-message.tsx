import { CheckCircle2, TriangleAlert } from "lucide-react";

export function FormMessage({ state }: { state: { ok?: string; error?: string } | null | undefined }) {
  if (!state?.ok && !state?.error) return null;
  return state.error ? (
    <p role="alert" className="text-danger flex items-start gap-1.5 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {state.error}
    </p>
  ) : (
    <p role="status" className="text-success flex items-start gap-1.5 text-sm">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {state.ok}
    </p>
  );
}

export const inputClass =
  "border-line bg-surface focus:border-brand focus:ring-brand/20 w-full rounded-2xl border px-4 py-3 text-[15px] outline-none focus:ring-4";
export const labelClass = "mb-1.5 block text-sm font-semibold";

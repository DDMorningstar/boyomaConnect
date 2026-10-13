"use client";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { FormMessage } from "@/components/forms/form-message";
type BizState = { ok?: string; error?: string } | null;

type Action = (state: BizState, form: FormData) => Promise<BizState>;

/** Formulaire de la console : action serveur, champs cachés, message de résultat. */
export function BizForm({
  action,
  hidden,
  children,
  submit,
  className = "space-y-4",
  disabled,
  resetOnSuccess,
  confirm,
  variant = "primary",
}: {
  action: Action;
  hidden: Record<string, string>;
  children?: ReactNode;
  submit: string;
  className?: string;
  disabled?: boolean;
  resetOnSuccess?: boolean;
  confirm?: string;
  variant?: "primary" | "danger";
}) {
  const [state, run, pending] = useActionState<BizState, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={run}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || disabled}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-50 ${
            variant === "danger"
              ? "bg-danger/10 text-danger hover:bg-danger/15"
              : "bg-brand hover:bg-brand-strong text-white"
          }`}
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {submit}
        </button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

/** Bouton d'action unique (statut, annulation…), avec confirmation facultative. */
export function ActionButton({
  action,
  hidden,
  children,
  confirm,
  variant = "secondary",
  title,
}: {
  action: Action;
  hidden: Record<string, string>;
  children: ReactNode;
  confirm?: string;
  variant?: "primary" | "secondary" | "danger";
  title?: string;
}) {
  const [state, run, pending] = useActionState<BizState, FormData>(action, null);
  const cls = {
    primary: "bg-brand text-white hover:bg-brand-strong",
    secondary: "border border-line bg-surface hover:bg-surface-2",
    danger: "border border-line bg-surface text-danger hover:bg-surface-2",
  }[variant];
  return (
    <form
      action={run}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="inline-flex flex-col gap-1"
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        disabled={pending}
        title={title}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold disabled:opacity-50 ${cls}`}
      >
        {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
        {children}
      </button>
      {state?.error && <FormMessage state={state} />}
    </form>
  );
}

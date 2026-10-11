"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, inputClass, labelClass } from "@/components/forms/form-message";
import { requestPasswordReset, type AuthState } from "@/features/auth/email-actions";

export function ResetRequestForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, null);
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="email" className={labelClass}>
          E-mail
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Envoi…" : "Recevoir le lien"}
      </Button>
    </form>
  );
}

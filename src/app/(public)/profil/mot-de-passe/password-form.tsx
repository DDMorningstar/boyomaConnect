"use client";
import { useActionState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormMessage, inputClass, labelClass } from "@/components/forms/form-message";
import { updatePassword, type AuthState } from "@/features/auth/email-actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, null);
  if (state?.ok) {
    return (
      <div className="space-y-3">
        <FormMessage state={state} />
        <ButtonLink href="/profil">Retour à mon compte</ButtonLink>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="password" className={labelClass}>
          Nouveau mot de passe (8 caractères minimum)
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="confirm" className={labelClass}>
          Confirmer le mot de passe
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </Button>
    </form>
  );
}

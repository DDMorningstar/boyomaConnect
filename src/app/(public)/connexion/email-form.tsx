"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage, inputClass, labelClass } from "@/components/forms/form-message";
import {
  resendConfirmation,
  signInWithEmail,
  signUpWithEmail,
  type AuthState,
} from "@/features/auth/email-actions";

function PasswordInput({ autoComplete }: { autoComplete: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id="password"
        name="password"
        type={visible ? "text" : "password"}
        required
        minLength={autoComplete === "new-password" ? 8 : 1}
        maxLength={72}
        autoComplete={autoComplete}
        className={`${inputClass} pr-12`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        className="text-muted absolute top-1/2 right-3 -translate-y-1/2 p-1"
      >
        {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

function ResendLink({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(resendConfirmation, null);
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="email" value={email} />
      <button type="submit" disabled={pending} className="text-brand text-sm font-semibold underline">
        {pending ? "Envoi…" : "Renvoyer l'e-mail de confirmation"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

/** Connexion ou création de compte par e-mail et mot de passe. */
export function EmailForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signIn, signingIn] = useActionState<AuthState, FormData>(signInWithEmail, null);
  const [signUpState, signUp, signingUp] = useActionState<AuthState, FormData>(signUpWithEmail, null);
  const tab = "flex-1 rounded-full py-2 text-sm font-semibold transition-colors";

  return (
    <div className="space-y-4">
      <div role="tablist" className="bg-surface-2 flex gap-1 rounded-full p-1">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signin"}
          onClick={() => setMode("signin")}
          className={`${tab} ${mode === "signin" ? "bg-surface shadow-[var(--shadow-card)]" : "text-muted"}`}
        >
          Se connecter
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          onClick={() => setMode("signup")}
          className={`${tab} ${mode === "signup" ? "bg-surface shadow-[var(--shadow-card)]" : "text-muted"}`}
        >
          Créer un compte
        </button>
      </div>

      {mode === "signin" ? (
        <form action={signIn} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <div>
            <label htmlFor="email" className={labelClass}>
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className={inputClass}
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="password" className={labelClass}>
                Mot de passe
              </label>
              <Link href="/connexion/mot-de-passe-oublie" className="text-brand text-sm">
                Mot de passe oublié ?
              </Link>
            </div>
            <PasswordInput autoComplete="current-password" />
          </div>
          <FormMessage state={signInState} />
          {signInState?.unconfirmedEmail && <ResendLink email={signInState.unconfirmedEmail} />}
          <Button type="submit" disabled={signingIn} className="w-full">
            {signingIn ? "Connexion…" : "Se connecter"}
          </Button>
        </form>
      ) : signUpState?.ok ? (
        <div className="space-y-3">
          <FormMessage state={signUpState} />
          <p className="text-muted text-sm">Aucun e-mail reçu après quelques minutes ?</p>
          {signUpState.unconfirmedEmail && <ResendLink email={signUpState.unconfirmedEmail} />}
        </div>
      ) : (
        <form action={signUp} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <div>
            <label htmlFor="display_name" className={labelClass}>
              Nom
            </label>
            <input
              id="display_name"
              name="display_name"
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="password" className={labelClass}>
              Mot de passe (8 caractères minimum)
            </label>
            <PasswordInput autoComplete="new-password" />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="terms" required className="mt-1" />
            <span>
              J&apos;accepte les <Link href="/conditions">conditions d&apos;utilisation</Link> et la{" "}
              <Link href="/confidentialite">politique de confidentialité</Link>.
            </span>
          </label>
          <FormMessage state={signUpState} />
          <Button type="submit" disabled={signingUp} className="w-full">
            {signingUp ? "Création…" : "Créer mon compte"}
          </Button>
        </form>
      )}
    </div>
  );
}

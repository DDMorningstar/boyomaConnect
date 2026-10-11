"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Roboto } from "next/font/google";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// Police imposée par la charte du bouton Google (téléchargée au build, servie par le site).
const roboto = Roboto({ weight: "500", subsets: ["latin"], display: "swap" });

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"
      />
      <path
        fill="#FBBC05"
        d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6C6.6 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

/** Connexion / inscription via Google (Supabase Auth, flux PKCE). */
export function GoogleButton({ next, disabled = false }: { next: string; disabled?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const { error } = await getSupabaseBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setPending(false);
      setError("Connexion impossible. Vérifiez votre connexion internet et réessayez.");
    }
  }

  return (
    <div className="space-y-3">
      {/* Charte « Se connecter avec Google » : fond blanc / contour #747775 / texte #1F1F1F (clair),
          fond #131314 / contour #8E918F / texte #E3E3E3 (sombre), Roboto Medium, logo G officiel. */}
      <button
        type="button"
        onClick={signIn}
        disabled={pending || disabled}
        className={`${roboto.className} relative flex h-12 w-full items-center justify-center gap-3 rounded-full border border-[#747775] bg-white px-4 text-[15px] font-medium tracking-[0.25px] text-[#1F1F1F] transition-[background-color,box-shadow] hover:bg-[#F7F8F8] hover:shadow-[0_1px_2px_rgb(60_64_67/0.3),0_1px_3px_1px_rgb(60_64_67/0.15)] focus-visible:ring-4 focus-visible:ring-[#4285F4]/30 focus-visible:outline-none active:bg-[#EEEFEF] disabled:cursor-not-allowed disabled:border-[#1F1F1F]/12 disabled:bg-white/60 disabled:text-[#1F1F1F]/40 dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3] dark:hover:bg-[#1F2020] dark:active:bg-[#2A2B2B] dark:disabled:bg-[#131314]/60 dark:disabled:text-[#E3E3E3]/40`}
      >
        {pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <GoogleLogo />}
        <span>{pending ? "Redirection vers Google…" : "Continuer avec Google"}</span>
      </button>
      {disabled && (
        <p className="text-muted text-sm">
          La connexion Google est en cours d&apos;activation et n&apos;est pas encore disponible. Revenez un
          peu plus tard.
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { shrinkImage } from "@/lib/client-image";
import { FormMessage } from "./form-message";

type State = { ok?: string; error?: string } | null;

/**
 * Bouton d'envoi d'image : réduit l'image dans le navigateur puis appelle l'action serveur,
 * qui revalide, optimise (WebP, sans métadonnées) et enregistre.
 */
export function ImageUpload({
  action,
  field,
  maxSide,
  hidden,
  label,
  disabled,
  disabledReason,
  children,
}: {
  action: (prev: State, form: FormData) => Promise<State>;
  field: string;
  maxSide: number;
  hidden?: Record<string, string>;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setState(null);
    let small: File;
    try {
      small = await shrinkImage(file, maxSide);
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : "Image invalide." });
      return;
    }
    const form = new FormData();
    form.set(field, small);
    for (const [k, v] of Object.entries(hidden ?? {})) form.set(k, v);
    startTransition(async () => {
      try {
        setState(await action(null, form));
      } catch {
        setState({ error: "Envoi impossible (connexion interrompue ?). Réessayez." });
      }
      if (input.current) input.current.value = "";
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {children}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={disabled || pending}
          title={disabled ? disabledReason : undefined}
          className="border-line bg-surface hover:bg-surface-2 inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="size-4" aria-hidden="true" />
          )}
          {pending ? "Optimisation et envoi…" : label}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>
      {disabled && disabledReason && <p className="text-muted text-xs">{disabledReason}</p>}
      <FormMessage state={state} />
    </div>
  );
}

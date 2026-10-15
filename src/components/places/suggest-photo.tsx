"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Loader2, X } from "lucide-react";
import { FormMessage, inputClass } from "@/components/forms/form-message";
import { suggestPhoto, type SuggestState } from "@/features/community/actions";
import { shrinkImage } from "@/lib/client-image";
import { celebrate } from "@/lib/celebrate";
import { haptic } from "@/lib/haptics";

/**
 * « Proposer une photo » : tout visiteur connecté peut enrichir une fiche. La photo est relue
 * par l'équipe avant publication ; l'auteur est notifié (décision D34).
 */
export function SuggestPhoto({
  placeId,
  slug,
  signedIn,
  isManager,
}: {
  placeId: string;
  slug: string;
  signedIn: boolean;
  isManager: boolean;
}) {
  const [state, send, pending] = useActionState<SuggestState, FormData>(suggestPhoto, null);
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(false);
  const [shrinking, setShrinking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state?.ok) return;
    setPhoto(null);
    setPreview(null);
    setCaption("");
    setConsent(false);
    setOpen(false);
    haptic("success");
    celebrate();
  }, [state]);

  // Le gestionnaire ajoute ses photos depuis l'espace pro, directement publiées.
  if (isManager) return null;

  if (!signedIn) {
    return (
      <p className="text-muted text-sm">
        <Camera className="mr-1 inline size-4 align-[-3px]" aria-hidden="true" />
        Vous êtes passé par ici ?{" "}
        <Link
          href={`/connexion?next=${encodeURIComponent(`/lieux/${slug}#photos`)}`}
          className="text-brand font-semibold underline"
        >
          Connectez-vous
        </Link>{" "}
        pour proposer une photo.
      </p>
    );
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    setPickError(null);
    setShrinking(true);
    try {
      const small = await shrinkImage(f, 1600);
      setPhoto(small);
      setPreview(URL.createObjectURL(small));
    } catch {
      setPickError("Photo illisible. Essayez une autre image.");
    } finally {
      setShrinking(false);
    }
  }

  if (!open) {
    return (
      <div className="space-y-2">
        {state?.ok && <FormMessage state={state} />}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-line hover:bg-surface-2 inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold"
        >
          <Camera className="size-4" aria-hidden="true" /> Proposer une photo
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!photo) return;
        const fd = new FormData();
        fd.set("place_id", placeId);
        fd.set("caption", caption);
        fd.set("photo", photo);
        if (consent) fd.set("consent", "on");
        startTransition(() => send(fd));
      }}
      className="border-line bg-surface space-y-3 rounded-2xl border p-4"
    >
      <p className="text-sm font-semibold">Proposer une photo</p>
      <div className="flex flex-wrap items-center gap-3">
        {preview ? (
          <span className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Aperçu de votre photo" className="h-24 w-32 rounded-xl object-cover" />
            <button
              type="button"
              onClick={() => {
                setPhoto(null);
                setPreview(null);
              }}
              className="bg-night absolute -top-2 -right-2 rounded-full p-1 text-white"
              aria-label="Retirer la photo"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="border-line hover:bg-surface-2 inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold"
          >
            {shrinking ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Camera className="size-4" aria-hidden="true" />
            )}
            Choisir une photo
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
      {pickError && (
        <p role="alert" className="text-danger text-sm">
          {pickError}
        </p>
      )}
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value.slice(0, 200))}
        placeholder="Légende (facultatif) : ex. l'entrée, la salle, la vitrine…"
        className={inputClass}
        aria-label="Légende de la photo"
      />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 size-4"
        />
        <span>
          J&apos;ai pris cette photo moi-même, elle ne montre pas de visage reconnaissable sans accord, et
          j&apos;accepte qu&apos;elle soit publiée sur la fiche.
        </span>
      </label>
      <FormMessage state={state?.error ? state : null} />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || shrinking || !photo || !consent}
          className="bg-brand hover:bg-brand-strong inline-flex min-h-10 items-center gap-1.5 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} Envoyer
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-10 rounded-full px-4 text-sm">
          Annuler
        </button>
      </div>
      <p className="text-muted text-xs">
        Relue par l&apos;équipe avant publication. Les données de localisation de la photo sont supprimées.
      </p>
    </form>
  );
}

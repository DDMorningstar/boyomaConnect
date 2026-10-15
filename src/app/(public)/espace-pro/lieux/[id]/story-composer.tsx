"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { FormMessage, inputClass } from "@/components/forms/form-message";
import { deleteStory, publishStory, type BizState } from "@/features/owner/business-actions";
import { shrinkImage } from "@/lib/client-image";
import { placeMediaUrl } from "@/lib/supabase/storage";

export interface OwnerStory {
  id: string;
  body: string;
  photo_path: string | null;
  created_at: string;
  expires_at: string;
}

const left = (iso: string) => {
  const h = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 3_600_000));
  return h <= 1 ? "moins d'1 h restante" : `${h} h restantes`;
};

/** « Nouveauté du jour » : un message (et une photo) visible 24 h sur la fiche et à l'accueil. */
export function StoryComposer({ placeId, stories }: { placeId: string; stories: OwnerStory[] }) {
  const [state, publish, pending] = useActionState<BizState, FormData>(publishStory, null);
  const [delState, remove, deleting] = useActionState<BizState, FormData>(deleteStory, null);
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [shrinking, setShrinking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const full = stories.length >= 3;

  useEffect(() => {
    if (state?.ok) {
      setBody("");
      setPhoto(null);
      setPreview(null);
    }
  }, [state]);

  async function pick(f: File | undefined) {
    if (!f) return;
    setShrinking(true);
    try {
      const small = await shrinkImage(f, 1600);
      setPhoto(small);
      setPreview(URL.createObjectURL(small));
    } finally {
      setShrinking(false);
    }
  }

  return (
    <div className="space-y-4">
      {stories.length > 0 && (
        <ul className="space-y-2">
          {stories.map((s) => (
            <li key={s.id} className="bg-surface-2 flex items-start gap-3 rounded-2xl p-3">
              {s.photo_path && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={placeMediaUrl(s.photo_path)!}
                  alt=""
                  className="size-14 shrink-0 rounded-xl object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm">{s.body}</p>
                <p className="text-muted mt-1 text-xs">{left(s.expires_at)}</p>
              </div>
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("place_id", placeId);
                  fd.set("id", s.id);
                  startTransition(() => remove(fd));
                }}
                className="text-muted hover:text-danger rounded-full p-1.5"
                aria-label="Retirer cette nouveauté"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <FormMessage state={delState} />
      {full ? (
        <p className="text-muted text-sm">
          3 nouveautés par jour au maximum : retirez-en une pour en publier une autre.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData();
            fd.set("place_id", placeId);
            fd.set("body", body);
            if (photo) fd.set("photo", photo);
            startTransition(() => publish(fd));
          }}
          className="space-y-3"
        >
          <div className="relative">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 200))}
              rows={2}
              required
              minLength={3}
              placeholder="Ex. : Plat du jour : poisson braisé · Nouvel arrivage de pagnes · Ouvert ce dimanche"
              className={inputClass}
              aria-label="Nouveauté du jour"
            />
            <span className="text-muted absolute right-3 bottom-2 text-xs tabular-nums">
              {body.length}/200
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {preview ? (
              <span className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Aperçu" className="size-16 rounded-xl object-cover" />
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
                  <ImagePlus className="size-4" aria-hidden="true" />
                )}
                Photo (facultatif)
              </button>
            )}
            <input
              ref={input}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <button
              type="submit"
              disabled={pending || shrinking || body.trim().length < 3}
              className="bg-brand hover:bg-brand-strong inline-flex min-h-10 items-center gap-1.5 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="size-4" aria-hidden="true" />
              )}
              Publier pour 24 h
            </button>
          </div>
          <FormMessage state={state} />
        </form>
      )}
    </div>
  );
}

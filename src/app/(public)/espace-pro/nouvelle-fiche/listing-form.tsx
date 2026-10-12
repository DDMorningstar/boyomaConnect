"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ImagePlus, Loader2, LocateFixed, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage, inputClass, labelClass } from "@/components/forms/form-message";
import { shrinkImage } from "@/lib/client-image";
import { createListing, type ActionState } from "@/features/owner/actions";

interface Options {
  groups: { id: string; name: string; children: { id: string; name: string }[] }[];
  areas: { label: string; options: { id: string; name: string }[] }[];
}

const MAX_PHOTOS = 3;

function usePreviews(files: File[]) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = files.map((f) => URL.createObjectURL(f));
    setUrls(next);
    return () => next.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  return urls;
}

export function ListingForm({ options }: { options: Options }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createListing, null);
  const [pending, startTransition] = useTransition();
  const [logo, setLogo] = useState<File[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [shrinking, setShrinking] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const logoUrls = usePreviews(logo);
  const photoUrls = usePreviews(photos);
  const logoInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  async function pick(list: FileList | null, kind: "logo" | "photo") {
    if (!list?.length) return;
    setShrinking(true);
    try {
      const picked = Array.from(list).slice(0, kind === "logo" ? 1 : MAX_PHOTOS - photos.length);
      const small = await Promise.all(picked.map((f) => shrinkImage(f, kind === "logo" ? 512 : 1600)));
      if (kind === "logo") setLogo(small.slice(0, 1));
      else setPhotos((p) => [...p, ...small].slice(0, MAX_PHOTOS));
    } finally {
      setShrinking(false);
    }
  }

  function locate() {
    if (!navigator.geolocation) return setGpsMsg("La géolocalisation n'est pas disponible sur cet appareil.");
    setGpsMsg("Recherche de votre position…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) });
        setGpsMsg(null);
      },
      () => setGpsMsg("Position refusée ou indisponible. Vous pourrez l'ajouter plus tard."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.delete("logo");
    fd.delete("photos");
    logo.forEach((f) => fd.append("logo", f));
    photos.forEach((f) => fd.append("photos", f));
    if (gps) {
      fd.set("latitude", String(gps.lat));
      fd.set("longitude", String(gps.lng));
      fd.set("gps_accuracy_m", String(gps.acc));
    }
    if (confirmNew) fd.set("confirm_new", "1");
    startTransition(() => formAction(fd));
  }

  const busy = pending || shrinking;
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <fieldset className="space-y-4">
        <legend className="mb-2 text-lg font-bold">Établissement</legend>
        <div>
          <label htmlFor="name" className={labelClass}>
            Nom de l&apos;établissement *
          </label>
          <input id="name" name="name" required minLength={2} maxLength={140} className={inputClass} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="category_id" className={labelClass}>
              Catégorie *
            </label>
            <select id="category_id" name="category_id" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Choisir…
              </option>
              {options.groups.map((g) => (
                <optgroup key={g.id} label={g.name}>
                  {g.children.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="commune_id" className={labelClass}>
              Commune ou territoire *
            </label>
            <select id="commune_id" name="commune_id" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Choisir…
              </option>
              {options.areas.map((a) => (
                <optgroup key={a.label} label={a.label}>
                  {a.options.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="short_description" className={labelClass}>
            Présentation courte
          </label>
          <textarea
            id="short_description"
            name="short_description"
            maxLength={280}
            rows={2}
            placeholder="Ex. Restaurant de cuisine congolaise, livraison possible."
            className={inputClass}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="address_text" className={labelClass}>
              Adresse
            </label>
            <input id="address_text" name="address_text" maxLength={300} className={inputClass} />
          </div>
          <div>
            <label htmlFor="landmark_description" className={labelClass}>
              Repère
            </label>
            <input
              id="landmark_description"
              name="landmark_description"
              maxLength={500}
              placeholder="Ex. en face du marché central"
              className={inputClass}
            />
          </div>
        </div>
        <div className="bg-surface-2 space-y-2 rounded-2xl p-3 text-sm">
          <p>
            Position sur la carte : si vous êtes <strong>dans votre établissement</strong>, utilisez votre
            position actuelle.
          </p>
          <button
            type="button"
            onClick={locate}
            className="border-line bg-surface inline-flex min-h-10 items-center gap-2 rounded-full border px-4 font-semibold"
          >
            <LocateFixed className="text-brand size-4" aria-hidden="true" />
            {gps ? "Position enregistrée — recommencer" : "Utiliser ma position actuelle"}
          </button>
          {gps && (
            <p className="text-success">
              Position enregistrée (précision ± {gps.acc} m).{" "}
              <button type="button" className="underline" onClick={() => setGps(null)}>
                Retirer
              </button>
            </p>
          )}
          {gpsMsg && <p className="text-muted">{gpsMsg}</p>}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-lg font-bold">Contacts publics</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="phone" className={labelClass}>
              Téléphone public *
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              inputMode="tel"
              defaultValue="+243 "
              autoComplete="tel"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="whatsapp" className={labelClass}>
              WhatsApp
            </label>
            <input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" className={inputClass} />
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>
              E-mail
            </label>
            <input id="email" name="email" type="email" className={inputClass} />
          </div>
          <div>
            <label htmlFor="website" className={labelClass}>
              Site ou page Facebook
            </label>
            <input id="website" name="website" inputMode="url" className={inputClass} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-lg font-bold">Logo et photos</legend>
        <p className="text-muted text-sm">
          Les images sont automatiquement réduites et optimisées avant l&apos;envoi. 3 photos maximum.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {logoUrls[0] && (
            // Aperçu local (blob:) : next/image n'est pas adapté.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrls[0]} alt="Aperçu du logo" className="size-16 rounded-2xl object-cover" />
          )}
          <button
            type="button"
            onClick={() => logoInput.current?.click()}
            className="border-line bg-surface inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
          >
            <ImagePlus className="size-4" aria-hidden="true" />{" "}
            {logo.length ? "Changer le logo" : "Ajouter un logo"}
          </button>
          <input
            ref={logoInput}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => pick(e.target.files, "logo")}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {photoUrls.map((u, i) => (
            <div key={u} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt={`Photo ${i + 1}`} className="h-24 w-32 rounded-2xl object-cover" />
              <button
                type="button"
                aria-label={`Retirer la photo ${i + 1}`}
                onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                className="bg-night/80 absolute top-1 right-1 rounded-full p-1 text-white"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => photoInput.current?.click()}
              className="border-line text-muted flex h-24 w-32 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed text-xs"
            >
              <ImagePlus className="size-5" aria-hidden="true" /> Ajouter ({photos.length}/{MAX_PHOTOS})
            </button>
          )}
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              pick(e.target.files, "photo");
              e.target.value = "";
            }}
          />
        </div>
      </fieldset>

      {state?.duplicates && state.duplicates.length > 0 && (
        <div className="border-warning/40 bg-warning/10 space-y-2 rounded-2xl border p-3 text-sm">
          <p className="font-semibold">Fiches existantes au nom proche :</p>
          <ul className="space-y-1">
            {state.duplicates.map((d) => (
              <li key={d.slug} className="flex flex-wrap items-center gap-2">
                <Link href={`/lieux/${d.slug}`} target="_blank" className="underline">
                  {d.name}
                </Link>
                <Link href={`/espace-pro/reclamer/${d.slug}`} className="text-brand font-semibold">
                  C&apos;est mon établissement →
                </Link>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={confirmNew} onChange={(e) => setConfirmNew(e.target.checked)} />
            Aucune de ces fiches n&apos;est la mienne : créer une nouvelle fiche
          </label>
        </div>
      )}

      <FormMessage state={state?.duplicates?.length ? null : state} />
      <Button type="submit" disabled={busy} className="w-full sm:w-auto">
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {shrinking ? "Optimisation des images…" : pending ? "Envoi en cours…" : "Envoyer pour validation"}
      </Button>
      <p className="text-muted text-xs">
        * Champs obligatoires. Le téléphone public sera affiché sur votre fiche. Toute fiche est vérifiée par
        notre équipe avant publication.
      </p>
    </form>
  );
}

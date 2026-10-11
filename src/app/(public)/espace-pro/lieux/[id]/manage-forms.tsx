"use client";
import { useActionState, useState } from "react";
import Image from "next/image";
import { Check, Copy, MessageCircle, Pencil, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage, inputClass, labelClass } from "@/components/forms/form-message";
import {
  deleteCatalogItem,
  deletePhoto,
  saveCatalogItem,
  saveContacts,
  updatePlaceInfo,
  type ActionState,
} from "@/features/owner/actions";
import type { CatalogItem, ManagedPlace } from "@/features/owner/queries";
import { formatPrice } from "@/lib/format";

const card = "border-line bg-surface space-y-4 rounded-[var(--radius-card)] border p-4";

// ------------------------------------------------------------------ partage
export function ShareBox({ url, name }: { url: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const text = `${name} — retrouvez nos contacts, nos photos et notre catalogue sur Boyoma Connect : ${url}`;
  return (
    <section className={card}>
      <h2 className="flex items-center gap-2 font-bold">
        <Share2 className="text-brand size-5" aria-hidden="true" /> Partager ma fiche
      </h2>
      <p className="text-muted text-sm">
        Le lien affiche automatiquement votre nom, votre logo, votre téléphone et vos prix dans WhatsApp,
        Facebook et les autres réseaux.
      </p>
      <p className="bg-surface-2 rounded-xl px-3 py-2 font-mono text-xs break-all">{url}</p>
      <div className="flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#25D366] px-4 text-sm font-semibold text-white"
        >
          <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#1877F2] px-4 text-sm font-semibold text-white"
        >
          Facebook
        </a>
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            try {
              if (navigator.share) await navigator.share({ title: name, text, url });
              else {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            } catch {
              /* partage annulé */
            }
          }}
        >
          {copied ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          {copied ? "Lien copié" : "Copier / partager"}
        </Button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ photos
export function PhotoGrid({
  placeId,
  photos,
}: {
  placeId: string;
  photos: { id: string; url: string; pending: boolean }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deletePhoto, null);
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-2">
        {photos.map((p, i) => (
          <li key={p.id} className="bg-surface-2 relative h-28 w-36 overflow-hidden rounded-2xl">
            <Image src={p.url} alt={`Photo ${i + 1}`} fill sizes="144px" className="object-cover" />
            {p.pending && (
              <span className="bg-night/75 absolute bottom-1 left-1 rounded-full px-2 py-0.5 text-[11px] text-white">
                En modération
              </span>
            )}
            <form action={action} className="absolute top-1 right-1">
              <input type="hidden" name="place_id" value={placeId} />
              <input type="hidden" name="media_id" value={p.id} />
              <button
                type="submit"
                disabled={pending}
                aria-label={`Supprimer la photo ${i + 1}`}
                className="bg-night/80 rounded-full p-1.5 text-white"
              >
                <Trash2 className="size-4" />
              </button>
            </form>
          </li>
        ))}
      </ul>
      <FormMessage state={state} />
    </div>
  );
}

// ---------------------------------------------------------------- contacts
export function ContactsForm({ place }: { place: ManagedPlace }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveContacts, null);
  const get = (kind: string) => place.place_contacts.find((c) => c.kind === kind)?.value ?? "";
  return (
    <form action={action} className={card}>
      <h2 className="font-bold">Contacts publics</h2>
      <input type="hidden" name="place_id" value={place.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className={labelClass}>
            Téléphone public *
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            required
            defaultValue={get("phone") || "+243 "}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="whatsapp" className={labelClass}>
            WhatsApp
          </label>
          <input
            id="whatsapp"
            name="whatsapp"
            type="tel"
            inputMode="tel"
            defaultValue={get("whatsapp")}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>
            E-mail
          </label>
          <input id="email" name="email" type="email" defaultValue={get("email")} className={inputClass} />
        </div>
        <div>
          <label htmlFor="website" className={labelClass}>
            Site ou page Facebook
          </label>
          <input
            id="website"
            name="website"
            inputMode="url"
            defaultValue={get("website")}
            className={inputClass}
          />
        </div>
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer les contacts"}
      </Button>
    </form>
  );
}

// ------------------------------------------------------------ informations
export function InfoForm({ place }: { place: ManagedPlace }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updatePlaceInfo, null);
  return (
    <form action={action} className={card}>
      <h2 className="font-bold">Présentation et informations pratiques</h2>
      <input type="hidden" name="place_id" value={place.id} />
      <div>
        <label htmlFor="short_description" className={labelClass}>
          Présentation courte
        </label>
        <textarea
          id="short_description"
          name="short_description"
          rows={2}
          maxLength={280}
          defaultValue={place.short_description ?? ""}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="full_description" className={labelClass}>
          Description détaillée
        </label>
        <textarea
          id="full_description"
          name="full_description"
          rows={5}
          maxLength={8000}
          defaultValue={place.full_description ?? ""}
          className={inputClass}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="address_text" className={labelClass}>
            Adresse
          </label>
          <input
            id="address_text"
            name="address_text"
            maxLength={300}
            defaultValue={place.address_text ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="landmark_description" className={labelClass}>
            Repère
          </label>
          <input
            id="landmark_description"
            name="landmark_description"
            maxLength={500}
            defaultValue={place.landmark_description ?? ""}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label htmlFor="directions" className={labelClass}>
          Comment venir
        </label>
        <textarea
          id="directions"
          name="directions"
          rows={2}
          maxLength={1000}
          defaultValue={place.directions ?? ""}
          className={inputClass}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="price_range" className={labelClass}>
            Gamme de prix
          </label>
          <select
            id="price_range"
            name="price_range"
            defaultValue={place.price_range ?? ""}
            className={inputClass}
          >
            <option value="">Non précisée</option>
            <option value="1">$ — économique</option>
            <option value="2">$$ — moyen</option>
            <option value="3">$$$ — élevé</option>
            <option value="4">$$$$ — haut de gamme</option>
          </select>
        </div>
        <div>
          <label htmlFor="currency" className={labelClass}>
            Devise principale
          </label>
          <select id="currency" name="currency" defaultValue={place.currency ?? ""} className={inputClass}>
            <option value="">Non précisée</option>
            <option value="USD">USD</option>
            <option value="CDF">CDF</option>
          </select>
        </div>
        <div>
          <label htmlFor="payment_methods" className={labelClass}>
            Paiements acceptés
          </label>
          <input
            id="payment_methods"
            name="payment_methods"
            placeholder="Espèces, M-Pesa, Airtel Money"
            defaultValue={place.payment_methods.join(", ")}
            className={inputClass}
          />
        </div>
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
      <p className="text-muted text-xs">
        Nom, catégorie et position : contactez notre équipe pour les modifier (vérification nécessaire).
      </p>
    </form>
  );
}

// --------------------------------------------------------------- catalogue
const AVAILABILITY: Record<CatalogItem["availability"], string> = {
  available: "Disponible",
  on_request: "Sur demande",
  unavailable: "Indisponible",
  unknown: "Non précisé",
};

function CatalogItemForm({
  placeId,
  item,
  onDone,
}: {
  placeId: string;
  item?: CatalogItem;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, form) => {
    const res = await saveCatalogItem(prev, form);
    if (res?.ok) onDone?.();
    return res;
  }, null);
  const p = item?.id ?? "new";
  return (
    <form action={action} className="bg-surface-2 space-y-3 rounded-2xl p-3">
      <input type="hidden" name="place_id" value={placeId} />
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <div>
          <label htmlFor={`name-${p}`} className={labelClass}>
            Nom *
          </label>
          <input
            id={`name-${p}`}
            name="name"
            required
            minLength={2}
            maxLength={120}
            defaultValue={item?.name}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`kind-${p}`} className={labelClass}>
            Type
          </label>
          <select id={`kind-${p}`} name="kind" defaultValue={item?.kind ?? "product"} className={inputClass}>
            <option value="product">Produit</option>
            <option value="service">Service</option>
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`price-${p}`} className={labelClass}>
            Prix (facultatif)
          </label>
          <input
            id={`price-${p}`}
            name="price"
            inputMode="decimal"
            placeholder="Ex. 15"
            defaultValue={item?.price ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`currency-${p}`} className={labelClass}>
            Devise
          </label>
          <select
            id={`currency-${p}`}
            name="currency"
            defaultValue={item?.currency ?? "USD"}
            className={inputClass}
          >
            <option value="USD">USD ($)</option>
            <option value="CDF">CDF (FC)</option>
          </select>
        </div>
        <div>
          <label htmlFor={`availability-${p}`} className={labelClass}>
            Disponibilité
          </label>
          <select
            id={`availability-${p}`}
            name="availability"
            defaultValue={item?.availability ?? "available"}
            className={inputClass}
          >
            {Object.entries(AVAILABILITY).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={`description-${p}`} className={labelClass}>
          Description
        </label>
        <textarea
          id={`description-${p}`}
          name="description"
          rows={2}
          maxLength={2000}
          defaultValue={item?.description ?? ""}
          className={inputClass}
        />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : item ? "Mettre à jour" : "Ajouter au catalogue"}
      </Button>
    </form>
  );
}

function DeleteItem({ placeId, id }: { placeId: string; id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteCatalogItem, null);
  return (
    <form action={action}>
      <input type="hidden" name="place_id" value={placeId} />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        aria-label="Supprimer l'article"
        className="text-danger hover:bg-danger/10 rounded-full p-2"
      >
        <Trash2 className="size-4" />
      </button>
      {state?.error && <span className="text-danger text-xs">{state.error}</span>}
    </form>
  );
}

export function CatalogManager({ placeId, items }: { placeId: string; items: CatalogItem[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className={card}>
      <h2 className="font-bold">Catalogue et prix</h2>
      <p className="text-muted text-sm">
        Produits et services proposés, avec leur prix si vous le souhaitez (USD ou CDF).
      </p>
      {items.length > 0 && (
        <ul className="divide-line divide-y">
          {items.map((it) =>
            editing === it.id ? (
              <li key={it.id} className="py-2">
                <CatalogItemForm placeId={placeId} item={it} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={it.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{it.name}</span>
                  <span className="text-muted text-sm">
                    {formatPrice(it.price, it.currency)} · {AVAILABILITY[it.availability]}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(it.id)}
                  aria-label={`Modifier ${it.name}`}
                  className="hover:bg-surface-2 rounded-full p-2"
                >
                  <Pencil className="size-4" />
                </button>
                <DeleteItem placeId={placeId} id={it.id} />
              </li>
            ),
          )}
        </ul>
      )}
      <CatalogItemForm key={items.length} placeId={placeId} />
    </section>
  );
}

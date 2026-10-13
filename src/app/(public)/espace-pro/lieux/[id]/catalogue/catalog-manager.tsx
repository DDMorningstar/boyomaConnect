"use client";
import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Package,
  Pencil,
  Plus,
  Star,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage, inputClass, labelClass } from "@/components/forms/form-message";
import {
  deleteCatalogItem,
  moveCatalogItem,
  saveCatalogItem,
  toggleCatalogFlag,
  type ActionState,
} from "@/features/owner/actions";
import {
  AVAILABILITY,
  PRICE_TYPES,
  catalogPrice,
  type CatalogEntry,
  type PriceType,
} from "@/features/catalog/format";
import { shrinkImage } from "@/lib/client-image";
import { placeMediaUrl } from "@/lib/supabase/storage";

const MAX_ITEMS = 100;
const card = "border-line bg-surface space-y-4 rounded-[var(--radius-card)] border p-4";

/**
 * Catalogue de l'établissement (décision D31) : produits et services présentés sur la fiche ; les
 * visiteurs contactent l'établissement (téléphone, WhatsApp, e-mail). Aucune commande ni paiement.
 */
export function CatalogManager({ placeId, items }: { placeId: string; items: CatalogEntry[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const sections = useMemo(
    () => [...new Set(items.map((i) => i.category_label).filter((s): s is string => Boolean(s)))],
    [items],
  );
  const ordered = [...items].sort((a, b) => a.sort_order - b.sort_order);
  const groups = [
    ...sections.map((s) => ({ label: s, rows: ordered.filter((i) => i.category_label === s) })),
    { label: sections.length ? "Sans rubrique" : null, rows: ordered.filter((i) => !i.category_label) },
  ].filter((g) => g.rows.length);
  const visible = items.filter((i) => i.is_published).length;

  return (
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">Catalogue : produits et services</h2>
          <p className="text-muted text-sm">
            {items.length} article{items.length > 1 ? "s" : ""} · {visible} visible{visible > 1 ? "s" : ""}{" "}
            sur votre fiche · {MAX_ITEMS} maximum
          </p>
        </div>
        {editing !== "new" && (
          <Button
            type="button"
            onClick={() => setEditing("new")}
            disabled={items.length >= MAX_ITEMS}
            title={items.length >= MAX_ITEMS ? "Limite atteinte : supprimez un article" : undefined}
          >
            <Plus className="size-4" aria-hidden="true" /> Ajouter un article
          </Button>
        )}
      </div>
      <p className="bg-surface-2 text-muted rounded-2xl p-3 text-xs">
        Les visiteurs consultent votre catalogue et vous contactent directement (appel, WhatsApp, e-mail) avec
        un message qui cite l&apos;article. Boyoma Connect ne prend ni commande ni paiement.
      </p>

      {editing === "new" && (
        <ItemForm placeId={placeId} sections={sections} onDone={() => setEditing(null)} />
      )}

      {items.length === 0 && editing !== "new" ? (
        <div className="border-line text-muted flex flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center text-sm">
          <Package className="size-8" aria-hidden="true" />
          Votre catalogue est vide. Ajoutez vos produits (chambres, plats, articles…) ou vos services (coupe,
          réparation, livraison…), avec une photo et un prix si vous le souhaitez.
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.label ?? "_"} className="space-y-2">
            {g.label && (
              <h3 className="text-muted text-xs font-semibold tracking-wide uppercase">{g.label}</h3>
            )}
            <ul className="space-y-2">
              {g.rows.map((it) =>
                editing === it.id ? (
                  <li key={it.id}>
                    <ItemForm
                      placeId={placeId}
                      item={it}
                      sections={sections}
                      onDone={() => setEditing(null)}
                    />
                  </li>
                ) : (
                  <ItemRow
                    key={it.id}
                    placeId={placeId}
                    item={it}
                    first={ordered[0]?.id === it.id}
                    last={ordered[ordered.length - 1]?.id === it.id}
                    onEdit={() => setEditing(it.id)}
                  />
                ),
              )}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

// ------------------------------------------------------------------ ligne
function useQuickAction(action: (s: ActionState, f: FormData) => Promise<ActionState>) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(action, null);
  const run = (fields: Record<string, string>) => {
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => form.set(k, v));
    startTransition(() => dispatch(form));
  };
  return { state, run, pending };
}

function ItemRow({
  placeId,
  item,
  first,
  last,
  onEdit,
}: {
  placeId: string;
  item: CatalogEntry;
  first: boolean;
  last: boolean;
  onEdit: () => void;
}) {
  const flag = useQuickAction(toggleCatalogFlag);
  const move = useQuickAction(moveCatalogItem);
  const del = useQuickAction(deleteCatalogItem);
  const [confirm, setConfirm] = useState(false);
  const photo = placeMediaUrl(item.photo_paths[0]);
  const price = catalogPrice(item);
  const busy = flag.pending || move.pending || del.pending;
  const icon = "hover:bg-surface-2 rounded-full p-2 disabled:opacity-40";
  const base = { place_id: placeId, id: item.id };
  const error = flag.state?.error ?? move.state?.error ?? del.state?.error;

  return (
    <li
      className={`border-line rounded-2xl border p-2.5 transition-opacity ${item.is_published ? "" : "opacity-60"}`}
    >
      <div className="flex items-center gap-3">
        <div className="bg-surface-2 relative size-14 shrink-0 overflow-hidden rounded-xl">
          {photo ? (
            <Image src={photo} alt="" fill sizes="56px" className="object-cover" />
          ) : (
            <span className="text-muted flex size-full items-center justify-center">
              {item.kind === "service" ? <Wrench className="size-5" /> : <Package className="size-5" />}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-semibold">
            <span className="truncate">{item.name}</span>
            {item.is_featured && (
              <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Mis en avant" />
            )}
          </p>
          <p className="text-muted truncate text-xs">
            {[
              item.kind === "service" ? "Service" : "Produit",
              price ?? "Prix non indiqué",
              AVAILABILITY[item.availability],
            ]
              .filter(Boolean)
              .join(" · ")}
            {!item.is_published && " · Masqué"}
          </p>
        </div>
        {busy && <Loader2 className="text-muted size-4 animate-spin" aria-label="Enregistrement" />}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-end gap-0.5">
        <button
          type="button"
          className={icon}
          disabled={busy || first}
          onClick={() => move.run({ ...base, direction: "up" })}
          aria-label={`Monter ${item.name}`}
        >
          <ArrowUp className="size-4" />
        </button>
        <button
          type="button"
          className={icon}
          disabled={busy || last}
          onClick={() => move.run({ ...base, direction: "down" })}
          aria-label={`Descendre ${item.name}`}
        >
          <ArrowDown className="size-4" />
        </button>
        <button
          type="button"
          className={icon}
          disabled={busy}
          aria-pressed={item.is_featured}
          onClick={() => flag.run({ ...base, field: "is_featured", value: item.is_featured ? "off" : "on" })}
          aria-label={item.is_featured ? "Retirer de la mise en avant" : "Mettre en avant"}
          title={item.is_featured ? "Retirer de la mise en avant" : "Mettre en avant (affiché en premier)"}
        >
          <Star className={`size-4 ${item.is_featured ? "fill-amber-400 text-amber-400" : ""}`} />
        </button>
        <button
          type="button"
          className={icon}
          disabled={busy}
          onClick={() =>
            flag.run({ ...base, field: "is_published", value: item.is_published ? "off" : "on" })
          }
          aria-label={item.is_published ? "Masquer de la fiche" : "Afficher sur la fiche"}
          title={
            item.is_published ? "Masquer (l'article reste dans votre catalogue)" : "Afficher sur la fiche"
          }
        >
          {item.is_published ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </button>
        <button
          type="button"
          className={icon}
          disabled={busy}
          onClick={onEdit}
          aria-label={`Modifier ${item.name}`}
        >
          <Pencil className="size-4" />
        </button>
        {confirm ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => del.run(base)}
              className="bg-danger/10 text-danger rounded-full px-3 py-1.5 text-xs font-semibold"
            >
              Supprimer définitivement
            </button>
            <button type="button" onClick={() => setConfirm(false)} className={icon} aria-label="Annuler">
              <X className="size-4" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            className={`${icon} text-danger hover:bg-danger/10`}
            disabled={busy}
            onClick={() => setConfirm(true)}
            aria-label={`Supprimer ${item.name}`}
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      {error && <FormMessage state={{ error }} />}
    </li>
  );
}

// ------------------------------------------------------------------ formulaire
function ItemForm({
  placeId,
  item,
  sections,
  onDone,
}: {
  placeId: string;
  item?: CatalogEntry;
  sections: string[];
  onDone: () => void;
}) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(async (prev, form) => {
    const res = await saveCatalogItem(prev, form);
    if (res?.ok) onDone();
    return res;
  }, null);
  const [kind, setKind] = useState<CatalogEntry["kind"]>(item?.kind ?? "product");
  const [priceType, setPriceType] = useState<PriceType>(item?.price_type ?? "fixed");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(placeMediaUrl(item?.photo_paths[0]));
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [shrinking, setShrinking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const p = item?.id ?? "new";
  const withAmount = priceType === "fixed" || priceType === "from";

  async function pick(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    setPhotoError(null);
    setShrinking(true);
    try {
      const small = await shrinkImage(f, 1600);
      setPhoto(small);
      setRemovePhoto(false);
      setPreview(URL.createObjectURL(small));
    } catch (e) {
      setPhotoError((e as Error).message);
    } finally {
      setShrinking(false);
    }
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.delete("photo");
    if (photo) fd.set("photo", photo);
    if (removePhoto) fd.set("remove_photo", "on");
    fd.set("kind", kind);
    fd.set("price_type", priceType);
    startTransition(() => dispatch(fd));
  }

  const seg = (on: boolean) =>
    `flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${on ? "bg-surface text-ink shadow-[var(--shadow-card)]" : "text-muted"}`;

  return (
    <form onSubmit={submit} className="bg-surface-2 animate-fade-up space-y-4 rounded-2xl p-3.5">
      <input type="hidden" name="place_id" value={placeId} />
      {item && <input type="hidden" name="id" value={item.id} />}

      <div className="flex items-center justify-between">
        <p className="font-semibold">{item ? `Modifier « ${item.name} »` : "Nouvel article"}</p>
        <button
          type="button"
          onClick={onDone}
          className="hover:bg-surface rounded-full p-1.5"
          aria-label="Fermer"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="bg-line/40 flex gap-1 rounded-2xl p-1" role="radiogroup" aria-label="Type d'article">
        <button
          type="button"
          role="radio"
          aria-checked={kind === "product"}
          onClick={() => setKind("product")}
          className={seg(kind === "product")}
        >
          <Package className="mr-1.5 inline size-4" aria-hidden="true" /> Produit
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={kind === "service"}
          onClick={() => setKind("service")}
          className={seg(kind === "service")}
        >
          <Wrench className="mr-1.5 inline size-4" aria-hidden="true" /> Service
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
        <div>
          <span className={labelClass}>Photo</span>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="border-line bg-surface hover:border-brand/40 relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed"
            aria-label={preview ? "Changer la photo" : "Ajouter une photo"}
          >
            {shrinking ? (
              <Loader2 className="text-muted size-5 animate-spin" />
            ) : preview && !removePhoto ? (
              // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:)
              <img src={preview} alt="" className="size-full object-cover" />
            ) : (
              <ImagePlus className="text-muted size-6" aria-hidden="true" />
            )}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => pick(e.target.files)}
          />
          {preview && !removePhoto && (
            <button
              type="button"
              onClick={() => {
                setRemovePhoto(true);
                setPhoto(null);
              }}
              className="text-danger mt-1 text-xs font-semibold"
            >
              Retirer la photo
            </button>
          )}
          {photoError && <p className="text-danger mt-1 text-xs">{photoError}</p>}
        </div>

        <div className="space-y-3">
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
              placeholder={
                kind === "service"
                  ? "Ex. Coupe homme, Réparation téléphone"
                  : "Ex. Chambre double, Poulet braisé"
              }
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`section-${p}`} className={labelClass}>
              Rubrique (facultatif)
            </label>
            <input
              id={`section-${p}`}
              name="category_label"
              maxLength={60}
              list={`sections-${p}`}
              defaultValue={item?.category_label ?? ""}
              placeholder="Ex. Chambres, Boissons, Réparations"
              className={inputClass}
            />
            <datalist id={`sections-${p}`}>
              {sections.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor={`description-${p}`} className={labelClass}>
          Description
        </label>
        <textarea
          id={`description-${p}`}
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={item?.description ?? ""}
          placeholder="Ce que comprend l'offre, tailles, délais, conditions…"
          className={inputClass}
        />
      </div>

      <fieldset className="space-y-3">
        <legend className={labelClass}>Prix</legend>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4" role="radiogroup" aria-label="Type de prix">
          {(Object.keys(PRICE_TYPES) as PriceType[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={priceType === t}
              onClick={() => setPriceType(t)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                priceType === t ? "border-brand bg-brand text-white" : "border-line bg-surface"
              }`}
            >
              {PRICE_TYPES[t]}
            </button>
          ))}
        </div>
        {withAmount && (
          <div className="grid gap-3 sm:grid-cols-[1fr_130px_1fr]">
            <input
              name="price"
              inputMode="decimal"
              required={priceType === "from"}
              aria-label="Montant"
              placeholder={priceType === "from" ? "Montant de départ *" : "Montant (facultatif)"}
              defaultValue={item?.price ?? ""}
              className={inputClass}
            />
            <select
              name="currency"
              aria-label="Devise"
              defaultValue={item?.currency ?? "CDF"}
              className={inputClass}
            >
              <option value="CDF">CDF (FC)</option>
              <option value="USD">USD ($)</option>
            </select>
            <input
              name="price_unit"
              maxLength={30}
              aria-label="Unité"
              placeholder="Unité : nuit, kg, heure…"
              defaultValue={item?.price_unit ?? ""}
              className={inputClass}
            />
          </div>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
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
        <div className="flex flex-col justify-end gap-2 pb-1 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="is_featured"
              defaultChecked={item?.is_featured ?? false}
              className="accent-brand size-4"
            />
            Mettre en avant (affiché en premier)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="is_published"
              defaultChecked={item?.is_published ?? true}
              className="accent-brand size-4"
            />
            Visible sur ma fiche
          </label>
        </div>
      </div>

      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || shrinking}>
          {pending ? "Enregistrement…" : item ? "Enregistrer" : "Ajouter au catalogue"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

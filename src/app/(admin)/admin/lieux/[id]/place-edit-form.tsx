"use client";
import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";
import { FormMessage } from "@/components/forms/form-message";
import { fieldCls } from "@/components/admin/ui";
import { adminUpdatePlace, type ReviewState } from "@/features/admin/actions";
import type { AdminPlace } from "@/features/admin/queries";

interface Options {
  groups: { id: string; name: string; children: { id: string; name: string }[] }[];
  units: { id: string; name: string; type_key: string }[];
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="text-muted mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

export function PlaceEditForm({
  place,
  options,
  canEdit,
}: {
  place: AdminPlace;
  options: Options;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(adminUpdatePlace, null);
  const input = `${fieldCls} w-full`;
  return (
    <form action={action} className="space-y-5 p-5">
      <input type="hidden" name="id" value={place.id} />
      <fieldset disabled={!canEdit || pending} className="space-y-5 disabled:opacity-70">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nom affiché *">
            <input
              name="name"
              required
              minLength={2}
              maxLength={140}
              defaultValue={place.name}
              className={input}
            />
          </Field>
          <Field label="Nom officiel">
            <input
              name="official_name"
              maxLength={200}
              defaultValue={place.official_name ?? ""}
              className={input}
            />
          </Field>
          <Field label="Catégorie principale">
            <select
              name="primary_category_id"
              defaultValue={place.primary_category_id ?? ""}
              className={input}
            >
              <option value="">— Aucune —</option>
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
          </Field>
          <Field label="Rattachement" hint="Commune si connue, sinon la ville.">
            <select
              name="administrative_unit_id"
              defaultValue={place.administrative_unit_id ?? ""}
              className={input}
            >
              <option value="">— Aucun —</option>
              {options.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.type_key === "ville" ? `Ville de ${u.name}` : `Commune de ${u.name}`}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Présentation courte">
          <textarea
            name="short_description"
            rows={2}
            maxLength={280}
            defaultValue={place.short_description ?? ""}
            className={input}
          />
        </Field>
        <Field label="Description détaillée">
          <textarea
            name="full_description"
            rows={4}
            maxLength={8000}
            defaultValue={place.full_description ?? ""}
            className={input}
          />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Adresse">
            <input
              name="address_text"
              maxLength={300}
              defaultValue={place.address_text ?? ""}
              className={input}
            />
          </Field>
          <Field label="Repère">
            <input
              name="landmark_description"
              maxLength={500}
              defaultValue={place.landmark_description ?? ""}
              className={input}
            />
          </Field>
        </div>
        <Field label="Comment s'y rendre">
          <textarea
            name="directions"
            rows={2}
            maxLength={1000}
            defaultValue={place.directions ?? ""}
            className={input}
          />
        </Field>

        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Latitude">
            <input
              name="latitude"
              inputMode="decimal"
              defaultValue={place.latitude ?? ""}
              placeholder="0.5153"
              className={input}
            />
          </Field>
          <Field label="Longitude">
            <input
              name="longitude"
              inputMode="decimal"
              defaultValue={place.longitude ?? ""}
              placeholder="25.1910"
              className={input}
            />
          </Field>
          <Field label="Précision">
            <select name="geographic_precision" defaultValue={place.geographic_precision} className={input}>
              <option value="exact">Exacte</option>
              <option value="approximate">Approximative</option>
              <option value="street">Rue</option>
              <option value="neighborhood">Quartier</option>
              <option value="commune">Commune</option>
              <option value="unknown">Inconnue</option>
            </select>
          </Field>
          <Field label="Activité">
            <select name="activity_status" defaultValue={place.activity_status} className={input}>
              <option value="operating">En activité</option>
              <option value="temporarily_closed">Fermé temporairement</option>
              <option value="permanently_closed">Fermé définitivement</option>
              <option value="unknown">Inconnue</option>
            </select>
          </Field>
        </div>
      </fieldset>

      <div className="border-line flex flex-wrap items-center gap-3 border-t pt-4">
        <button
          type="submit"
          disabled={!canEdit || pending}
          className="bg-brand hover:bg-brand-strong inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Enregistrer
        </button>
        {!canEdit && <span className="text-muted text-sm">Lecture seule pour votre rôle.</span>}
        <FormMessage state={state} />
      </div>
    </form>
  );
}

"use client";
import { useActionState, useState } from "react";
import { FileUp, Globe2, Loader2, RefreshCw } from "lucide-react";
import { FormMessage } from "@/components/forms/form-message";
import { fieldCls } from "@/components/admin/ui";
import {
  saveSchedule,
  startOverpassImport,
  uploadImportFile,
  type ImportState,
} from "@/features/imports/actions";
import type { CategoryGroup, ImportSource, ZoneOption } from "@/features/imports/queries";

const TYPE_LABEL: Record<string, string> = { province: "Province", ville: "Ville", territoire: "Territoire" };

function ZoneSelect({
  zones,
  name = "zone_unit_id",
  optional = false,
}: {
  zones: ZoneOption[];
  name?: string;
  optional?: boolean;
}) {
  const provinces = zones.filter((z) => z.type_key === "province");
  return (
    <select
      name={name}
      required={!optional}
      defaultValue={optional ? "" : (provinces[0]?.id ?? "")}
      className={`${fieldCls} w-full`}
    >
      {optional && <option value="">Aucune (pas de contrôle de zone)</option>}
      {provinces.map((p) => (
        <optgroup key={p.id} label={`Province : ${p.name}`}>
          <option value={p.id}>Toute la province ({p.name})</option>
          {zones
            .filter((z) => z.type_key !== "province" && z.parent_name === p.name)
            .map((z) => (
              <option key={z.id} value={z.id}>
                {TYPE_LABEL[z.type_key]} : {z.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

function CategoryPicker({ groups }: { groups: CategoryGroup[] }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toggle = (slugs: string[], on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      slugs.forEach((s) => (on ? next.add(s) : next.delete(s)));
      return next;
    });
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">Catégories recherchées</legend>
      <div className="mb-2 flex gap-2 text-xs">
        <button
          type="button"
          className="text-brand font-semibold"
          onClick={() =>
            toggle(
              groups.flatMap((g) => g.children.map((c) => c.slug)),
              true,
            )
          }
        >
          Tout cocher
        </button>
        <span className="text-muted">·</span>
        <button type="button" className="text-muted font-semibold" onClick={() => setChecked(new Set())}>
          Tout décocher
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => {
          const slugs = g.children.map((c) => c.slug);
          const all = slugs.length > 0 && slugs.every((s) => checked.has(s));
          return (
            <div key={g.id} className="border-line rounded-xl border p-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={all}
                  onChange={(e) => toggle(slugs, e.target.checked)}
                  className="accent-brand size-4"
                />
                {g.name}
              </label>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {g.children.map((c) => (
                  <label key={c.id} className="text-muted flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      name="categories"
                      value={c.slug}
                      checked={checked.has(c.slug)}
                      onChange={(e) => toggle([c.slug], e.target.checked)}
                      className="accent-brand size-3.5"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-muted mt-2 text-xs">{checked.size} sous-catégorie(s) sélectionnée(s).</p>
    </fieldset>
  );
}

function ModeFields({ defaultUpdate = true }: { defaultUpdate?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">
        <span className="mb-1 block font-semibold">Publication</span>
        <select name="publication_mode" defaultValue="review" className={`${fieldCls} w-full`}>
          <option value="review">Après validation par l&apos;équipe (recommandé)</option>
          <option value="publish">Publication directe, marquée « non vérifiée »</option>
        </select>
      </label>
      <label className="flex items-start gap-2 pt-7 text-sm">
        <input
          type="checkbox"
          name="update_existing"
          defaultChecked={defaultUpdate}
          className="accent-brand mt-0.5 size-4"
        />
        <span>
          Actualiser les lieux déjà importés de la même source
          <span className="text-muted block text-xs">
            Jamais les fiches gérées par un établissement ou vérifiées.
          </span>
        </span>
      </label>
    </div>
  );
}

function Submit({ pending, label, icon: Icon }: { pending: boolean; label: string; icon: typeof Globe2 }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-brand hover:bg-brand-strong inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="size-4" aria-hidden="true" />
      )}
      {pending ? "Traitement…" : label}
    </button>
  );
}

function Warnings({ state }: { state: ImportState }) {
  if (!state?.warnings?.length) return null;
  return (
    <ul className="text-muted list-disc pl-5 text-xs">
      {state.warnings.map((w) => (
        <li key={w}>{w}</li>
      ))}
    </ul>
  );
}

export function OverpassForm({
  zones,
  groups,
  cooldown,
}: {
  zones: ZoneOption[];
  groups: CategoryGroup[];
  cooldown: number;
}) {
  const [state, action, pending] = useActionState<ImportState, FormData>(startOverpassImport, null);
  return (
    <form action={action} className="space-y-5">
      <label className="block max-w-md text-sm">
        <span className="mb-1 block font-semibold">Zone</span>
        <ZoneSelect zones={zones} />
        <span className="text-muted mt-1 block text-xs">
          Emprise de la limite administrative ; les lieux hors de la zone sont rejetés à l&apos;analyse.
        </span>
      </label>
      <CategoryPicker groups={groups} />
      <ModeFields />
      <p className="text-muted text-xs">
        Requête unique vers l&apos;API publique Overpass (OpenStreetMap, licence ODbL), au plus une toutes les{" "}
        {cooldown} s pour l&apos;ensemble de l&apos;équipe. Les lieux trouvés sont mis en prévisualisation :
        rien n&apos;est importé avant votre confirmation.
      </p>
      <FormMessage state={state} />
      <Submit pending={pending} label="Rechercher et prévisualiser" icon={Globe2} />
    </form>
  );
}

export function FileForm({ zones, sources }: { zones: ZoneOption[]; sources: ImportSource[] }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(uploadImportFile, null);
  const usable = sources.filter((s) => s.is_active && s.kind !== "partner" && s.kind !== "owner");
  const [sourceKey, setSourceKey] = useState(usable[0]?.key ?? "");
  const source = usable.find((s) => s.key === sourceKey);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Fichier (4 Mo max.)</span>
          <input
            type="file"
            name="file"
            required
            accept=".osm,.xml,.json,.geojson,.csv,.tsv,.txt"
            className={`${fieldCls} file:bg-surface-2 w-full file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-1 file:text-sm`}
          />
          <span className="text-muted mt-1 block text-xs">
            OSM XML (.osm), JSON Overpass, GeoJSON, JSON ou CSV (« ; » ou « , »).
          </span>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Source</span>
          <select
            name="source_key"
            value={sourceKey}
            onChange={(e) => setSourceKey(e.target.value)}
            className={`${fieldCls} w-full`}
          >
            {usable.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="text-muted mt-1 block text-xs">
            Partenaires et établissements : prévus, activés après accord écrit ou consentement.
          </span>
        </label>
      </div>

      {source?.license_per_batch ? (
        <fieldset className="border-line space-y-3 rounded-xl border p-4">
          <legend className="px-1 text-sm font-semibold">Licence du fichier (obligatoire)</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              name="license"
              required
              maxLength={60}
              placeholder="Licence (ex. CC BY 4.0)"
              className={fieldCls}
            />
            <input
              name="attribution"
              required
              maxLength={200}
              placeholder="Attribution exigée (ex. © OCHA)"
              className={fieldCls}
            />
            <input
              name="license_url"
              type="url"
              maxLength={300}
              placeholder="Lien vers la licence (facultatif)"
              className={fieldCls}
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="license_confirmed" required className="accent-brand mt-0.5 size-4" />
            J&apos;atteste que cette licence autorise la réutilisation et la rediffusion de ces données dans
            Boyoma Connect (aucune donnée extraite de Google Maps ou d&apos;un service qui l&apos;interdit).
          </label>
        </fieldset>
      ) : (
        <p className="bg-surface-2 rounded-xl p-3 text-xs">
          Licence : <strong>{source?.license}</strong> — attribution « {source?.attribution} ».
          {source?.share_alike && " Base dérivée rediffusée sous la même licence (page Sources et licences)."}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Zone de contrôle</span>
          <ZoneSelect zones={zones} optional />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Date de collecte des données</span>
          <input
            type="date"
            name="collected_at"
            max={today}
            defaultValue={today}
            className={`${fieldCls} w-full`}
          />
        </label>
      </div>
      <ModeFields />
      <FormMessage state={state} />
      <Warnings state={state} />
      <Submit pending={pending} label="Lire et prévisualiser" icon={FileUp} />
    </form>
  );
}

export function ScheduleForm({
  zones,
  groups,
  minHours,
}: {
  zones: ZoneOption[];
  groups: CategoryGroup[];
  minHours: number;
}) {
  const [state, action, pending] = useActionState<ImportState, FormData>(saveSchedule, null);
  const options = [minHours, 336, 720].filter((h, i, a) => h >= minHours && a.indexOf(h) === i);
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Zone</span>
          <ZoneSelect zones={zones} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Fréquence</span>
          <select name="interval_hours" defaultValue={minHours} className={`${fieldCls} w-full`}>
            {options.map((h) => (
              <option key={h} value={h}>
                Tous les {Math.round(h / 24)} jours
              </option>
            ))}
          </select>
        </label>
      </div>
      <CategoryPicker groups={groups} />
      <label className="block max-w-md text-sm">
        <span className="mb-1 block font-semibold">Publication des nouveaux lieux</span>
        <select name="publication_mode" defaultValue="review" className={`${fieldCls} w-full`}>
          <option value="review">Après validation par l&apos;équipe (recommandé)</option>
          <option value="publish">Publication directe, marquée « non vérifiée »</option>
        </select>
      </label>
      <p className="text-muted text-xs">
        À chaque échéance, la synchronisation apparaît « due » dans le tableau des importations : son
        lancement crée un lot (actualisations comprises) à contrôler avant import. Intervalle minimal imposé :{" "}
        {Math.round(minHours / 24)} jours.
      </p>
      <FormMessage state={state} />
      <Submit pending={pending} label="Programmer la synchronisation" icon={RefreshCw} />
    </form>
  );
}

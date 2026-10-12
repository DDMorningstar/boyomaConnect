"use client";
import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { FormMessage } from "@/components/forms/form-message";
import { fieldCls } from "@/components/admin/ui";
import { saveMapping, type ImportState } from "@/features/imports/actions";

export function MappingForm({
  groups,
}: {
  groups: { id: string; name: string; children: { id: string; name: string }[] }[];
}) {
  const [state, action, pending] = useActionState<ImportState, FormData>(saveMapping, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr_110px_auto]">
        <input
          name="tag"
          required
          placeholder="Étiquette OSM : amenity=pharmacy"
          className={fieldCls}
          aria-label="Étiquette OSM"
        />
        <input
          name="condition"
          placeholder="Condition (facultatif) : religion=muslim"
          className={fieldCls}
          aria-label="Condition"
        />
        <select
          name="category_id"
          required
          defaultValue=""
          className={fieldCls}
          aria-label="Catégorie Boyoma"
        >
          <option value="" disabled>
            Catégorie Boyoma…
          </option>
          {groups.map((g) => (
            <optgroup key={g.id} label={g.name}>
              <option value={g.id}>{g.name} (catégorie principale)</option>
              {g.children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <input
          name="priority"
          type="number"
          min={0}
          max={1000}
          defaultValue={100}
          className={fieldCls}
          aria-label="Priorité"
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-brand hover:bg-brand-strong inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="size-4" aria-hidden="true" />
          )}
          Ajouter
        </button>
      </div>
      <p className="text-muted text-xs">
        Priorité : plus le nombre est petit, plus la règle l&apos;emporte quand plusieurs étiquettes sont
        présentes. Une étiquette déjà connue est mise à jour.
      </p>
      <FormMessage state={state} />
    </form>
  );
}

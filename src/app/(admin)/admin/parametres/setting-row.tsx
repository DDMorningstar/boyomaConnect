"use client";
import { useActionState, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { FormMessage } from "@/components/forms/form-message";
import { fieldCls } from "@/components/admin/ui";
import { adminUpdateSetting, type ReviewState } from "@/features/admin/actions";

function typeOf(v: unknown) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "json";
  if (typeof v === "object") return "json";
  return typeof v as "boolean" | "number" | "string";
}

/** Édition d'un paramètre selon son type (booléen, nombre, texte, JSON). */
export function SettingRow({
  setting,
}: {
  setting: { key: string; value: unknown; description: string | null; is_public: boolean };
}) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(adminUpdateSetting, null);
  const type = typeOf(setting.value);
  const initial =
    type === "json"
      ? JSON.stringify(setting.value, null, 2)
      : setting.value == null
        ? ""
        : String(setting.value);
  const [value, setValue] = useState(initial);
  const dirty = value !== initial;
  const danger = /simulated|payment/.test(setting.key);

  return (
    <form
      action={action}
      className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start"
    >
      <input type="hidden" name="key" value={setting.key} />
      <input type="hidden" name="type" value={type} />
      <div className="min-w-0">
        <p className="font-mono text-sm font-semibold break-all">{setting.key}</p>
        {setting.description && <p className="text-muted text-sm">{setting.description}</p>}
        <p className="text-muted mt-1 text-xs">{setting.is_public ? "Visible par le public" : "Interne"}</p>
        {danger && <p className="text-danger mt-1 text-xs font-medium">À ne jamais activer en production.</p>}
      </div>
      <div className="space-y-2">
        {type === "boolean" ? (
          <select
            name="value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`${fieldCls} w-full`}
          >
            <option value="true">Activé</option>
            <option value="false">Désactivé</option>
          </select>
        ) : type === "json" ? (
          <textarea
            name="value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={Math.min(8, value.split("\n").length + 1)}
            className={`${fieldCls} w-full font-mono text-xs`}
          />
        ) : (
          <input
            name="value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode={type === "number" ? "decimal" : undefined}
            placeholder={type === "null" ? "Non renseigné" : undefined}
            className={`${fieldCls} w-full`}
          />
        )}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!dirty || pending}
            className="bg-brand hover:bg-brand-strong inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-white disabled:opacity-40"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}{" "}
            Enregistrer
          </button>
          <FormMessage state={state} />
        </div>
      </div>
    </form>
  );
}

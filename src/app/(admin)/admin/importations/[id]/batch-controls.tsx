"use client";
import { useActionState, useRef, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, RotateCcw } from "lucide-react";
import { FormMessage } from "@/components/forms/form-message";
import { fieldCls } from "@/components/admin/ui";
import { commitChunk, decideItem, type CommitProgress, type ImportState } from "@/features/imports/actions";

/**
 * Import par tranches de 100 : chaque appel est une transaction ; en cas d'erreur (réseau, délai),
 * le lot passe « interrompu » et le bouton reprend exactement là où il s'est arrêté.
 */
export function CommitPanel({
  batchId,
  pending: initialPending,
  status,
  mode,
}: {
  batchId: string;
  pending: number;
  status: string;
  mode: "review" | "publish";
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<CommitProgress | null>(null);
  const stop = useRef(false);
  const total = initialPending;
  const remaining = progress?.remaining ?? initialPending;
  const done = Math.max(0, total - remaining);
  const resumable = status === "failed" || status === "importing";

  async function run() {
    setRunning(true);
    stop.current = false;
    let last: CommitProgress | null = null;
    // Garde-fou : au plus 60 tranches (6 000 éléments) par clic.
    for (let i = 0; i < 60 && !stop.current; i++) {
      last = await commitChunk(batchId);
      setProgress(last);
      if (last.error || !last.remaining) break;
    }
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        <strong>{total}</strong> élément{total > 1 ? "s" : ""} à traiter (nouveaux lieux et actualisations).{" "}
        {mode === "review"
          ? "Les nouveaux lieux seront créés « à valider » : publiez-les depuis le module Lieux après contrôle."
          : "Les nouveaux lieux seront publiés immédiatement, marqués « non vérifiés »."}
      </p>
      {(running || progress) && (
        <div>
          <div
            className="bg-surface-2 h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
          >
            <div
              className="bg-brand h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${total ? (done / total) * 100 : 100}%` }}
            />
          </div>
          <p className="text-muted mt-1 text-xs tabular-nums" aria-live="polite">
            {done} / {total} traités
            {progress && !progress.error
              ? ` · ${progress.created ?? 0} créés · ${progress.updated ?? 0} actualisés · ${progress.skipped ?? 0} ignorés · ${progress.rejected ?? 0} rejetés`
              : ""}
          </p>
        </div>
      )}
      {progress?.error && <FormMessage state={{ error: progress.error }} />}
      {progress && !progress.error && progress.remaining === 0 && (
        <FormMessage state={{ ok: "Import terminé. Le journal est à jour." }} />
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={running || total === 0}
          onClick={run}
          className="bg-brand hover:bg-brand-strong inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {running ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : resumable || progress?.error ? (
            <RotateCcw className="size-4" aria-hidden="true" />
          ) : (
            <Play className="size-4" aria-hidden="true" />
          )}
          {running
            ? "Import en cours…"
            : resumable || progress?.error
              ? "Reprendre l'import"
              : `Importer ${total} élément${total > 1 ? "s" : ""}`}
        </button>
        {running && (
          <button
            type="button"
            onClick={() => (stop.current = true)}
            className="border-line bg-surface hover:bg-surface-2 h-10 rounded-xl border px-4 text-sm font-semibold"
          >
            Suspendre après la tranche en cours
          </button>
        )}
      </div>
    </div>
  );
}

/** Décisions sur un élément : accepter (avec catégorie si besoin), rattacher, ignorer, rejeter. */
export function ItemDecision({
  itemId,
  batchId,
  status,
  needsCategory,
  hasMatch,
  categories,
}: {
  itemId: string;
  batchId: string;
  status: string;
  needsCategory: boolean;
  hasMatch: boolean;
  categories: { id: string; name: string; group: string }[];
}) {
  const [state, dispatch, pending] = useActionState<ImportState, FormData>(decideItem, null);
  const [category, setCategory] = useState("");
  function send(decision: string) {
    const form = new FormData();
    form.set("id", itemId);
    form.set("batch_id", batchId);
    form.set("decision", decision);
    if (category) form.set("category_id", category);
    startTransition(() => dispatch(form));
  }
  const btn = "h-8 rounded-lg px-2.5 text-xs font-semibold disabled:opacity-50";
  return (
    <div className="space-y-1.5">
      {needsCategory && (
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Catégorie à attribuer"
          className={`${fieldCls} h-8 w-full py-0 text-xs`}
        >
          <option value="">Catégorie…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.group} › {c.name}
            </option>
          ))}
        </select>
      )}
      <div className="flex flex-wrap gap-1">
        {status !== "ready" && (
          <button
            type="button"
            disabled={pending || (needsCategory && !category)}
            onClick={() => send("accept")}
            className={`${btn} bg-brand text-white`}
            title={status === "duplicate" ? "Créer quand même un nouveau lieu" : "Importer ce lieu"}
          >
            {status === "duplicate" ? "Créer quand même" : "Accepter"}
          </button>
        )}
        {hasMatch && status !== "existing" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => send("merge")}
            className={`${btn} bg-cyan/12 text-cyan`}
          >
            Rattacher à l&apos;existant
          </button>
        )}
        {status !== "skipped" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => send("skip")}
            className={`${btn} border-line border`}
          >
            Ignorer
          </button>
        )}
        {status !== "rejected" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => send("reject")}
            className={`${btn} bg-danger/10 text-danger`}
          >
            Rejeter
          </button>
        )}
        {pending && (
          <Loader2 className="text-muted size-4 animate-spin self-center" aria-label="Enregistrement" />
        )}
      </div>
      <FormMessage state={state} />
    </div>
  );
}

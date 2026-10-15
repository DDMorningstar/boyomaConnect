"use client";
import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { loadSupabaseBrowserClient } from "@/lib/supabase/lazy";

const REASONS = [
  ["wrong_info", "Informations incorrectes"],
  ["wrong_location", "Mauvaise position"],
  ["closed", "Établissement fermé"],
  ["duplicate", "Doublon"],
  ["inappropriate", "Contenu inapproprié"],
  ["fraud", "Fraude / usurpation"],
  ["other", "Autre"],
] as const;

/** « Signaler une erreur » : enregistré réellement via report_place() (limité à 5/heure). */
export function ReportForm({ placeId }: { placeId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState("sending");
    const { error } = await (await loadSupabaseBrowserClient()).rpc("report_place", {
      p_place_id: placeId,
      p_reason: String(form.get("reason")),
      p_details: String(form.get("details") ?? "").slice(0, 2000) || null,
      p_fingerprint: null,
    });
    if (error) {
      setState("error");
      setMessage(
        error.message.includes("Trop")
          ? "Trop de signalements récents, réessayez plus tard."
          : "Envoi impossible. Vérifiez votre connexion.",
      );
    } else setState("sent");
  }

  if (state === "sent") {
    return (
      <p role="status" className="bg-success/10 text-success rounded-2xl p-4 text-sm">
        Merci ! Votre signalement sera examiné par un modérateur.
      </p>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted hover:text-ink inline-flex items-center gap-2 text-sm font-medium"
      >
        <Flag className="size-4" aria-hidden="true" /> Signaler une erreur
      </button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="border-line bg-surface space-y-3 rounded-2xl border p-4">
      <label className="block text-sm font-medium">
        Motif
        <select
          name="reason"
          required
          className="border-line bg-bg mt-1 block h-11 w-full rounded-xl border px-3"
        >
          {REASONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Précisions (facultatif)
        <textarea
          name="details"
          maxLength={2000}
          rows={3}
          className="border-line bg-bg mt-1 block w-full rounded-xl border p-3"
        />
      </label>
      {state === "error" && (
        <p role="alert" className="text-danger text-sm">
          {message}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={state === "sending"}
          className="bg-brand inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {state === "sending" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} Envoyer
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-full px-4 text-sm">
          Annuler
        </button>
      </div>
    </form>
  );
}

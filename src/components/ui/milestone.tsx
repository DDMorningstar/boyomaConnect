"use client";
import { useEffect, useState } from "react";
import { PartyPopper, X } from "lucide-react";
import { celebrate } from "@/lib/celebrate";
import { haptic } from "@/lib/haptics";

const KEY = "boyoma.milestones";

function seen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Célèbre une étape franchie (fiche complète, fiche validée…) une seule fois par appareil :
 * confettis (sauf mouvement réduit / économiseur de données) et un message refermable.
 */
export function Milestone({ id, reached, title, body }: { id: string; reached: boolean; title: string; body: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!reached) return;
    const list = seen();
    if (list.includes(id)) return;
    try {
      localStorage.setItem(KEY, JSON.stringify([...list, id].slice(-100)));
    } catch {
      // Stockage indisponible : on célèbre quand même, sans mémoriser.
    }
    setShow(true);
    haptic("success");
    celebrate();
  }, [id, reached]);

  if (!show) return null;
  return (
    <div
      role="status"
      className="border-brand/30 bg-brand/5 flex items-start gap-3 rounded-[var(--radius-card)] border p-4"
    >
      <PartyPopper className="text-brand mt-0.5 size-6 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">{title}</p>
        <p className="text-muted text-sm">{body}</p>
      </div>
      <button
        type="button"
        onClick={() => setShow(false)}
        className="text-muted hover:text-ink rounded-full p-1"
        aria-label="Fermer"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

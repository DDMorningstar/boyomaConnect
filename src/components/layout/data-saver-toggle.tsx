"use client";
import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { readSaverPref, setSaverPref, useDataSaver, type SaverPref } from "@/lib/data-saver";

const LABELS: Record<SaverPref, string> = { auto: "Auto", on: "Activée", off: "Désactivée" };

/** Réglage de l'économie de données (mémorisé sur l'appareil). */
export function DataSaverToggle() {
  const active = useDataSaver();
  const [pref, setPref] = useState<SaverPref>("auto");
  useEffect(() => setPref(readSaverPref()), []);
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Gauge className="size-4" aria-hidden="true" /> Économie de données
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ${active ? "bg-success/15 text-success" : "bg-surface-2 text-muted"}`}
        >
          {active ? "active" : "inactive"}
        </span>
      </p>
      <div
        className="bg-surface-2 inline-flex rounded-full p-1"
        role="group"
        aria-label="Économie de données"
      >
        {(Object.keys(LABELS) as SaverPref[]).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={pref === p}
            onClick={() => {
              setPref(p);
              setSaverPref(p);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${pref === p ? "bg-surface shadow-sm" : "text-muted"}`}
          >
            {LABELS[p]}
          </button>
        ))}
      </div>
      <p className="text-muted text-xs">
        Auto : activée si votre téléphone le demande ou en 2G. Photos et carte se chargent alors à la demande.
      </p>
    </div>
  );
}

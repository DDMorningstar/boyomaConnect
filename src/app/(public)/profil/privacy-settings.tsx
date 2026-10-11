"use client";
import { useEffect, useState } from "react";
import { isRecentSearchEnabled, setRecentSearchEnabled } from "@/features/search/recent-searches";

export function PrivacySettings() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => setEnabled(isRecentSearchEnabled()), []);
  return (
    <label className="border-line bg-surface flex items-center justify-between gap-4 rounded-2xl border p-4">
      <span>
        <span className="block font-medium">Historique des recherches</span>
        <span className="text-muted text-sm">
          Conservé uniquement sur cet appareil. Désactiver efface l&apos;historique.
        </span>
      </span>
      <input
        type="checkbox"
        className="size-6 accent-[var(--color-brand)]"
        checked={enabled}
        onChange={(e) => {
          setRecentSearchEnabled(e.target.checked);
          setEnabled(e.target.checked);
        }}
      />
    </label>
  );
}

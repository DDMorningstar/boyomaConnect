"use client";
import { Languages } from "lucide-react";
import { LOCALES } from "@/lib/i18n";
import { setLocale, useLocale } from "@/lib/use-locale";

/** Choix de la langue de l'interface, mémorisé sur cet appareil. */
export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { locale, t } = useLocale();
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label={t("lang.title")} className="flex flex-wrap items-center gap-2">
        {compact && <Languages className="text-muted size-4" aria-hidden="true" />}
        {LOCALES.map((l) => (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={locale === l.code}
            lang={l.code}
            onClick={() => setLocale(l.code)}
            className={`min-h-9 rounded-full border px-3.5 text-sm font-semibold transition-colors ${
              locale === l.code
                ? "border-brand bg-brand/10 text-brand"
                : "border-line bg-surface text-muted hover:text-ink"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
      {!compact && <p className="text-muted text-xs">{t("lang.note")}</p>}
    </div>
  );
}

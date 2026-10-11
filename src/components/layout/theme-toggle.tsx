"use client";
import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { applyTheme, readPref, switchTheme, THEME_EVENT, type Theme, type ThemePref } from "@/lib/theme";

function subscribe(cb: () => void) {
  window.addEventListener(THEME_EVENT, cb);
  return () => window.removeEventListener(THEME_EVENT, cb);
}
const getTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const getPref = (): ThemePref => {
  const p = document.documentElement.dataset.themePref;
  return p === "light" || p === "dark" ? p : "system";
};

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "dark" as Theme);
  const pref = useSyncExternalStore(subscribe, getPref, () => "system" as ThemePref);
  return { theme, pref };
}

/** Suit le réglage de l'appareil tant que l'utilisateur n'a pas choisi de thème. */
export function ThemeWatcher() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => readPref() === "system" && applyTheme("system");
    mq.addEventListener("change", onChange);
    applyTheme(readPref()); // synchronise la barre du navigateur (theme-color)
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return null;
}

/** Bouton d'en-tête : bascule clair ⇄ sombre, avec une révélation circulaire depuis le bouton. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        switchTheme(next, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }}
      aria-label={next === "dark" ? "Passer au thème sombre" : "Passer au thème clair"}
      title={next === "dark" ? "Thème sombre" : "Thème clair"}
      className={`border-line bg-surface hover:bg-surface-2 text-ink relative inline-flex size-10 items-center justify-center overflow-hidden rounded-full border transition-colors ${className}`}
    >
      <Sun
        className={`absolute size-[18px] transition-all duration-500 ${theme === "dark" ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"}`}
        aria-hidden="true"
      />
      <Moon
        className={`absolute size-[18px] transition-all duration-500 ${theme === "dark" ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0"}`}
        aria-hidden="true"
      />
    </button>
  );
}

/** Sélecteur complet (Compte) : clair, sombre ou automatique (réglage de l'appareil). */
export function ThemeSelector() {
  const { pref } = useTheme();
  const options: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: "Clair", Icon: Sun },
    { value: "dark", label: "Sombre", Icon: Moon },
    { value: "system", label: "Automatique", Icon: Monitor },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Thème de l'application"
      className="bg-surface-2 grid grid-cols-3 gap-1 rounded-2xl p-1"
    >
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            switchTheme(value, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
          }}
          className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${pref === value ? "bg-surface text-brand shadow-[var(--shadow-card)]" : "text-muted hover:text-ink"}`}
        >
          <Icon className="size-5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

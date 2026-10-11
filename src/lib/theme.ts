export type ThemePref = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "boyoma-theme";
export const THEME_EVENT = "boyoma:theme";
export const THEME_COLORS: Record<Theme, string> = { light: "#F8FAFC", dark: "#070F24" };

/**
 * Script exécuté dans <head> avant l'affichage : applique le thème mémorisé (ou celui de
 * l'appareil) pour éviter tout flash de mauvais thème. Gardé minimal et sans dépendance.
 */
export const themeInitScript = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");if(p!=="light"&&p!=="dark")p="system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.dataset.theme=d?"dark":"light";r.dataset.themePref=p;r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

export function readPref(): ThemePref {
  try {
    const p = localStorage.getItem(THEME_STORAGE_KEY);
    return p === "light" || p === "dark" ? p : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(pref: ThemePref): Theme {
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Applique un thème au document (variables CSS, barre du navigateur) et prévient les abonnés. */
export function applyTheme(pref: ThemePref) {
  const theme = resolveTheme(pref);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.themePref = pref;
  root.style.colorScheme = theme;
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute("content", THEME_COLORS[theme]));
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { pref, theme } }));
}

export function savePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* stockage indisponible (navigation privée) : le choix vaut pour la page en cours */
  }
}

/**
 * Change de thème avec une révélation circulaire depuis le point cliqué (View Transitions),
 * ou instantanément si le navigateur ne la gère pas ou si l'utilisateur limite les animations.
 */
export function switchTheme(pref: ThemePref, origin?: { x: number; y: number }) {
  savePref(pref);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  if (!doc.startViewTransition || reduce || resolveTheme(pref) === currentTheme()) {
    applyTheme(pref);
    return;
  }
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? 0;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = doc.startViewTransition(() => applyTheme(pref));
  transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: 450,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => {});
}

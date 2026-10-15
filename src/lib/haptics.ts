/**
 * Retour haptique léger (Android) sur les actions importantes. Silencieux si non pris en charge
 * ou si l'utilisateur a demandé de réduire les animations.
 */
export function haptic(kind: "tap" | "success" = "tap") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  try {
    navigator.vibrate(kind === "success" ? [12, 40, 18] : 12);
  } catch {
    /* ignoré */
  }
}

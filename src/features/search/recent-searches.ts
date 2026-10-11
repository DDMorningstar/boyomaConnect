/**
 * Historique local des recherches. Désactivé par défaut : enregistré uniquement si
 * l'utilisateur l'a activé (consentement), et jamais envoyé au serveur.
 */
const KEY = "boyoma.recent-searches";
const CONSENT_KEY = "boyoma.recent-searches.enabled";
const MAX = 8;

function safeGet(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function isRecentSearchEnabled(): boolean {
  return safeGet(CONSENT_KEY) === "1";
}

export function setRecentSearchEnabled(enabled: boolean) {
  try {
    if (enabled) window.localStorage.setItem(CONSENT_KEY, "1");
    else {
      window.localStorage.removeItem(CONSENT_KEY);
      window.localStorage.removeItem(KEY);
    }
  } catch {
    /* stockage indisponible : rien à faire */
  }
}

export function getRecentSearches(): string[] {
  if (!isRecentSearchEnabled()) return [];
  try {
    const parsed: unknown = JSON.parse(safeGet(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(q: string) {
  if (!isRecentSearchEnabled()) return;
  const next = [q, ...getRecentSearches().filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignoré */
  }
}

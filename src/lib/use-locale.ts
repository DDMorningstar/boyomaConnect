"use client";
import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_EVENT,
  LOCALE_KEY,
  isLocale,
  translate,
  type Locale,
  type MessageKey,
} from "@/lib/i18n";

function read(): Locale {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    return isLocale(v) ? v : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(LOCALE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(LOCALE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function setLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // Stockage indisponible : la langue s'applique jusqu'au rechargement.
  }
  document.documentElement.lang = locale;
  window.dispatchEvent(new Event(LOCALE_EVENT));
}

/** Langue choisie sur cet appareil (français au rendu serveur) et fonction de traduction. */
export function useLocale() {
  const locale = useSyncExternalStore(subscribe, read, () => DEFAULT_LOCALE);
  const t = useCallback((key: MessageKey) => translate(locale, key), [locale]);
  return { locale, t };
}

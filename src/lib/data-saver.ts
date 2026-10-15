"use client";
import { useSyncExternalStore } from "react";

/**
 * Économie de données : « auto » (activée si le téléphone le demande ou en 2G), « on » ou « off ».
 * L'état est posé sur <html data-saver="on|off"> avant l'affichage (script ci-dessous) pour éviter de
 * télécharger des images ou la carte inutilement.
 */
import { SAVER_EVENT as EVENT, SAVER_KEY, type SaverPref } from "./data-saver-script";

export type { SaverPref };

export function readSaverPref(): SaverPref {
  try {
    const p = window.localStorage.getItem(SAVER_KEY);
    return p === "on" || p === "off" ? p : "auto";
  } catch {
    return "auto";
  }
}

function connectionIsSlow() {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection;
  return Boolean(c && (c.saveData || c.effectiveType === "slow-2g" || c.effectiveType === "2g"));
}

export function setSaverPref(pref: SaverPref) {
  try {
    window.localStorage.setItem(SAVER_KEY, pref);
  } catch {
    /* stockage indisponible */
  }
  const on = pref === "on" || (pref === "auto" && connectionIsSlow());
  document.documentElement.dataset.saver = on ? "on" : "off";
  document.documentElement.dataset.saverPref = pref;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** true si l'économie de données est active (false côté serveur). */
export function useDataSaver() {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.saver === "on",
    () => false,
  );
}

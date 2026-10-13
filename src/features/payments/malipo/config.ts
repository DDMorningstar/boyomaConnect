import type { AmountUnit } from "./money";

/**
 * Configuration Malipo (variables serveur, jamais NEXT_PUBLIC_). Le mode et le préfixe de clé
 * doivent concorder ; le mode « live » exige en plus MALIPO_LIVE_CONFIRMED=oui (décision explicite).
 */
export type MalipoMode = "sandbox" | "live";

export interface MalipoConfig {
  /** Encaissement possible (clé API valide et cohérente). */
  ready: boolean;
  /** Raison lisible quand l'encaissement est indisponible (affichée aux utilisateurs). */
  reason: string | null;
  mode: MalipoMode;
  baseUrl: string;
  apiKey: string | null;
  webhookSecret: string | null;
  webhookReason: string | null;
  amountUnit: AmountUnit;
}

type Env = Record<string, string | undefined>;

export const DEFAULT_BASE_URL = "https://api.malipo.dev/v1";

export function parseMalipoConfig(e: Env): MalipoConfig {
  const rawMode = (e.MALIPO_MODE ?? "sandbox").trim();
  const mode: MalipoMode = rawMode === "live" ? "live" : "sandbox";
  const baseUrl = (e.MALIPO_API_BASE_URL ?? "").trim() || DEFAULT_BASE_URL;
  const apiKey = (e.MALIPO_API_KEY ?? "").trim() || null;
  const secret = (e.MALIPO_WEBHOOK_SECRET ?? "").trim() || null;
  const unitRaw = (e.MALIPO_AMOUNT_UNIT ?? "minor").trim();
  const amountUnit: AmountUnit = unitRaw === "major" ? "major" : "minor";

  let reason: string | null = null;
  if (rawMode !== "sandbox" && rawMode !== "live")
    reason = "MALIPO_MODE doit valoir « sandbox » ou « live ».";
  else if (unitRaw !== "minor" && unitRaw !== "major")
    reason = "MALIPO_AMOUNT_UNIT doit valoir « minor » ou « major ».";
  else if (!/^https:\/\/[a-z0-9.-]+(\/[A-Za-z0-9._-]+)*\/v1$/.test(baseUrl))
    reason = "MALIPO_API_BASE_URL doit être une URL https se terminant par /v1 (sans barre finale).";
  else if (!apiKey) reason = "Clé API Malipo non configurée.";
  else if (mode === "sandbox" && !apiKey.startsWith("sk_test_"))
    reason = "Configuration incohérente : le mode sandbox exige une clé sk_test_.";
  else if (mode === "live" && !apiKey.startsWith("sk_live_"))
    reason = "Configuration incohérente : le mode live exige une clé sk_live_.";
  else if (mode === "live" && (e.MALIPO_LIVE_CONFIRMED ?? "").trim() !== "oui")
    reason = "Mode live non confirmé (MALIPO_LIVE_CONFIRMED=oui requis).";

  let webhookReason: string | null = null;
  if (!secret) webhookReason = "Secret de webhook non configuré.";
  else if (!/^[0-9a-f]{64}$/.test(secret))
    webhookReason = "MALIPO_WEBHOOK_SECRET doit contenir 64 caractères hexadécimaux minuscules.";

  return {
    ready: reason === null,
    reason,
    mode,
    baseUrl,
    apiKey: reason === null ? apiKey : null,
    webhookSecret: webhookReason === null ? secret : null,
    webhookReason,
    amountUnit,
  };
}

/** Lecture des variables d'environnement du serveur (à appeler côté serveur uniquement). */
export function getMalipoConfig(): MalipoConfig {
  return parseMalipoConfig({
    MALIPO_MODE: process.env.MALIPO_MODE,
    MALIPO_API_BASE_URL: process.env.MALIPO_API_BASE_URL,
    MALIPO_API_KEY: process.env.MALIPO_API_KEY,
    MALIPO_WEBHOOK_SECRET: process.env.MALIPO_WEBHOOK_SECRET,
    MALIPO_AMOUNT_UNIT: process.env.MALIPO_AMOUNT_UNIT,
    MALIPO_LIVE_CONFIRMED: process.env.MALIPO_LIVE_CONFIRMED,
  });
}

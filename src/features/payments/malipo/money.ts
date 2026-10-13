/**
 * Montants : calcul exact sur chaînes décimales (jamais de virgule flottante pour les calculs).
 * Constaté en Sandbox (13/10/2026) : l'API Malipo exprime « amount » en unité principale
 * (3 USD → 3, 300 CDF → 300), décimales acceptées ; frais et net sont décimaux. Unité configurable
 * (MALIPO_AMOUNT_UNIT, « major » par défaut) au cas où Malipo changerait de convention.
 */
export type AmountUnit = "minor" | "major";
export type Currency = "USD" | "CDF";

/** « 3 », « 3.5 », « 3.00 » → centimes (300) ; refuse plus de 2 décimales ou un format invalide. */
export function decimalToMinor(value: string | number): bigint {
  const s = typeof value === "number" ? value.toFixed(2) : value.trim();
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Error(`Montant invalide : ${s}`);
  const units = BigInt(m[1]!);
  const cents = BigInt((m[2] ?? "").padEnd(2, "0") || "0");
  return units * 100n + cents;
}

/** Montant envoyé à l'API selon l'unité configurée (chaîne décimale exacte : « 3.50 » ou « 350 »). */
export function toApiAmount(value: string | number, unit: AmountUnit): string {
  const minor = decimalToMinor(value);
  if (unit === "minor") return minor.toString();
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, "0")}`;
}

/** Montant API (montant, frais, net) → texte lisible (« 0,11 USD »), pour l'administration. */
export function formatApiAmount(
  amount: number | string | null | undefined,
  currency: string,
  unit: AmountUnit,
) {
  if (amount == null || amount === "") return "—";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  const major = unit === "minor" ? n / 100 : n;
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(major)} ${currency}`;
}

/** Nombre reçu de l'API (nombre fini ou chaîne décimale) ; null sinon. */
export function parseApiNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d{1,12}(\.\d{1,6})?$/.test(v.trim())) return Number(v);
  return null;
}

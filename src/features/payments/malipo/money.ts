/**
 * Montants : calcul entier sur chaînes décimales (jamais de virgule flottante).
 * L'API Malipo attend un entier ; par défaut dans la plus petite unité de la devise
 * (« 1000 = 10,00 CDF », documentation Charges). L'unité est configurable (MALIPO_AMOUNT_UNIT).
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

/** Montant envoyé à l'API selon l'unité configurée. */
export function toApiAmount(value: string | number, unit: AmountUnit): bigint {
  const minor = decimalToMinor(value);
  if (unit === "minor") return minor;
  if (minor % 100n !== 0n) throw new Error("Montant non entier incompatible avec l'unité « major ».");
  return minor / 100n;
}

/** Montant API → texte lisible (« 3,00 USD »), pour l'administration (frais, net). */
export function formatApiAmount(
  amount: number | bigint | null | undefined,
  currency: string,
  unit: AmountUnit,
) {
  if (amount == null) return "—";
  const minor = unit === "minor" ? BigInt(amount) : BigInt(amount) * 100n;
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const units = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const cents = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${units},${cents} ${currency}`;
}

/** Entier sûr reçu de l'API (nombre ou chaîne entière) ; null sinon. */
export function parseApiInteger(v: unknown): number | null {
  if (typeof v === "number" && Number.isSafeInteger(v)) return v;
  if (typeof v === "string" && /^-?\d{1,15}$/.test(v)) return Number(v);
  return null;
}

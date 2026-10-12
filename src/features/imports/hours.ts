import type { HoursSlot } from "./types";

/**
 * Interprétation prudente de la clé OSM `opening_hours` (sous-ensemble courant) :
 *   « 24/7 », « Mo-Fr 08:00-17:00 », « Mo,We 08:00-12:00,14:00-18:00; Sa 08:00-12:00; Su off ».
 * Toute forme non reconnue (jours fériés, semaines, mois, « sunrise »…) → null : la valeur brute est
 * conservée et rien n'est inventé.
 */
const DAYS: Record<string, number> = { mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6, su: 7 };
const TIME = /^([01]?\d|2[0-4]):([0-5]\d)$/;

function expandDays(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const range = part.trim().toLowerCase().split("-");
    const from = DAYS[range[0] ?? ""];
    const to = range.length === 2 ? DAYS[range[1] ?? ""] : from;
    if (!from || !to || range.length > 2) return null;
    // Plage pouvant passer par dimanche (ex. Sa-Mo).
    for (let d = from, n = 0; n < 7; d = (d % 7) + 1, n++) {
      out.add(d);
      if (d === to) break;
    }
  }
  return [...out].sort((a, b) => a - b);
}

function normTime(t: string): string | null {
  const m = TIME.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (h === 24 && m[2] !== "00") return null;
  return `${String(h === 24 ? 0 : h).padStart(2, "0")}:${m[2]}`;
}

export function parseOpeningHours(raw: string | null | undefined): HoursSlot[] | null {
  const value = raw?.trim();
  if (!value || value.length > 300) return null;
  if (value === "24/7") {
    return [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, opens: "00:00", closes: "23:59" }));
  }
  const slots: HoursSlot[] = [];
  for (const rule of value
    .split(";")
    .map((r) => r.trim())
    .filter(Boolean)) {
    const m = /^([A-Za-z,\- ]+?)\s+(.+)$/.exec(rule);
    if (!m) return null;
    const days = expandDays(m[1]!.replace(/\s+/g, ""));
    if (!days) return null;
    const times = m[2]!.trim();
    if (/^(off|closed)$/i.test(times)) continue; // jour fermé : simplement absent des créneaux
    for (const span of times.split(",")) {
      const [a, b, extra] = span.trim().split("-");
      const opens = normTime(a ?? "");
      const closes = normTime(b ?? "");
      if (!opens || !closes || extra !== undefined || opens === closes) return null;
      for (const day of days) slots.push({ day, opens, closes });
    }
  }
  return slots.length ? slots : null;
}

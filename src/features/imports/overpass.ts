import type { MappingRule } from "./types";

/**
 * Requête Overpass (OpenStreetMap) pour une emprise et des catégories. Respect de l'usage public :
 * une requête à la fois (créneau réservé en base), emprise ≤ 8°, délai serveur borné, User-Agent
 * identifié, réponse plafonnée. Aucune autre API cartographique n'est interrogée.
 */

export const OVERPASS_USER_AGENT = "BoyomaConnect/0.2 (+https://boyoma-connect.vercel.app/sources)";
export const MAX_BBOX_DEGREES = 8;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

export interface Bbox {
  min_lat: number;
  min_lng: number;
  max_lat: number;
  max_lng: number;
}

const fmt = (n: number) => Number(n.toFixed(5));

/** Construit la requête : un filtre par étiquette des règles retenues (dédoublonné). */
export function buildOverpassQuery(bbox: Bbox, rules: MappingRule[], timeoutSeconds = 120): string {
  if (
    !(bbox.max_lat > bbox.min_lat && bbox.max_lng > bbox.min_lng) ||
    bbox.max_lat - bbox.min_lat > MAX_BBOX_DEGREES ||
    bbox.max_lng - bbox.min_lng > MAX_BBOX_DEGREES
  ) {
    throw new Error(`Emprise invalide ou trop étendue (${MAX_BBOX_DEGREES}° au maximum).`);
  }
  if (!rules.length) throw new Error("Aucune catégorie sélectionnée.");
  const box = `${fmt(bbox.min_lat)},${fmt(bbox.min_lng)},${fmt(bbox.max_lat)},${fmt(bbox.max_lng)}`;
  const filters = [
    ...new Set(
      rules.map((r) => {
        const cond = r.condition_key ? `["${r.condition_key}"="${r.condition_value}"]` : "";
        return `  nwr["name"]["${r.osm_key}"="${r.osm_value}"]${cond}(${box});`;
      }),
    ),
  ];
  return `[out:json][timeout:${Math.min(Math.max(timeoutSeconds, 30), 180)}];\n(\n${filters.join("\n")}\n);\nout center tags;`;
}

export class OverpassError extends Error {}

export async function fetchOverpass(apiUrl: string, query: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: { "User-Agent": OVERPASS_USER_AGENT, Accept: "application/json" },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(150_000),
      cache: "no-store",
    });
  } catch {
    throw new OverpassError("Service OpenStreetMap injoignable ou trop lent. Réessayez plus tard.");
  }
  if (res.status === 429)
    throw new OverpassError("Service OpenStreetMap saturé (429) : réessayez dans quelques minutes.");
  if (res.status === 504 || res.status === 503)
    throw new OverpassError("Service OpenStreetMap surchargé : réessayez plus tard ou réduisez la zone.");
  if (!res.ok) throw new OverpassError(`Service OpenStreetMap : erreur HTTP ${res.status}.`);
  const size = Number(res.headers.get("content-length") ?? 0);
  if (size > MAX_RESPONSE_BYTES)
    throw new OverpassError("Réponse trop volumineuse : réduisez la zone ou les catégories.");
  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES)
    throw new OverpassError("Réponse trop volumineuse : réduisez la zone ou les catégories.");
  try {
    const json = JSON.parse(text) as { remark?: string };
    if (json.remark && /runtime error|timed out/i.test(json.remark)) {
      throw new OverpassError(
        "La requête a dépassé le temps du service : réduisez la zone ou les catégories.",
      );
    }
    return json;
  } catch (e) {
    if (e instanceof OverpassError) throw e;
    throw new OverpassError("Réponse du service OpenStreetMap illisible.");
  }
}

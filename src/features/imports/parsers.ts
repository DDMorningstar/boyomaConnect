import type { FileFormat, ParseResult, RawPoi } from "./types";

/**
 * Lecture des fichiers compatibles, sans dépendance : OSM XML (.osm), JSON Overpass, GeoJSON,
 * JSON générique (tableau d'objets) et CSV. Les valeurs sont gardées telles quelles (étiquettes) ;
 * la normalisation se fait ensuite (normalize.ts).
 */

export const MAX_POIS = 5000;

const num = (v: unknown): number | undefined => {
  const n =
    typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const asTags = (obj: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v == null || typeof v === "object") continue;
    const s = String(v).trim();
    if (s) out[k.trim()] = s;
  }
  return out;
};

/** Centre approximatif (moyenne des sommets) d'une géométrie GeoJSON. */
function centroid(coords: unknown): { lat: number; lon: number } | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  const walk = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
      sx += c[0];
      sy += c[1];
      n++;
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(coords);
  return n ? { lon: sx / n, lat: sy / n } : null;
}

// ------------------------------------------------------------------ détection
export function detectFormat(fileName: string, text: string): FileFormat | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const head = text.trimStart().slice(0, 400);
  if (ext === "csv" || ext === "tsv") return "csv";
  if (head.startsWith("<")) return /<osm[\s>]/.test(text.slice(0, 2000)) ? "osm_xml" : null;
  if (head.startsWith("{") || head.startsWith("[")) {
    if (/"type"\s*:\s*"FeatureCollection"/.test(text.slice(0, 5000)) || ext === "geojson") return "geojson";
    if (/"elements"\s*:/.test(text.slice(0, 5000))) return "osm_json";
    return "json";
  }
  return ext === "txt" ? "csv" : null;
}

export function parseFile(fileName: string, text: string): ParseResult {
  const format = detectFormat(fileName, text);
  if (!format) throw new Error("Format non reconnu : OSM (.osm), GeoJSON, JSON ou CSV attendus.");
  switch (format) {
    case "osm_xml":
      return parseOsmXml(text);
    case "osm_json":
      return parseOverpassJson(JSON.parse(text));
    case "geojson":
      return parseGeoJson(JSON.parse(text));
    case "json":
      return parseGenericJson(JSON.parse(text));
    case "csv":
      return parseCsv(text);
  }
}

function limit(result: ParseResult): ParseResult {
  if (result.pois.length > MAX_POIS) {
    result.warnings.push(
      `Fichier tronqué : ${MAX_POIS} lieux au maximum par lot (${result.pois.length} lus).`,
    );
    result.pois = result.pois.slice(0, MAX_POIS);
  }
  return result;
}

// ------------------------------------------------------------- OSM / Overpass
interface OverpassElement {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, unknown>;
}

/** Réponse JSON d'Overpass (`out center tags;`) ou export JSON OSM. */
export function parseOverpassJson(data: unknown): ParseResult {
  const elements = (data as { elements?: OverpassElement[] })?.elements;
  if (!Array.isArray(elements)) throw new Error("JSON OSM invalide : tableau « elements » absent.");
  const pois: RawPoi[] = [];
  for (const el of elements) {
    if (!el.tags || !["node", "way", "relation"].includes(el.type ?? "")) continue; // nœuds de géométrie
    const lat = num(el.lat ?? el.center?.lat);
    const lon = num(el.lon ?? el.center?.lon);
    pois.push({
      externalId: `${el.type}/${el.id}`,
      tags: asTags(el.tags),
      lat,
      lon,
      geometry: lat == null ? "none" : el.type === "node" ? "point" : "area",
    });
  }
  return limit({ format: "osm_json", pois, warnings: [] });
}

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]!) : undefined;
};
const decodeXml = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

/**
 * Fichier .osm (XML) : nœuds étiquetés ; voies et relations ramenées au centre (balise <center>
 * des exports Overpass, sinon moyenne des nœuds référencés présents dans le fichier).
 */
export function parseOsmXml(xml: string): ParseResult {
  const nodes = new Map<string, { lat: number; lon: number }>();
  const pois: RawPoi[] = [];
  const warnings: string[] = [];
  const blockRe = /<(node|way|relation)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g;
  const blocks: { type: string; head: string; body: string }[] = [];
  for (let m = blockRe.exec(xml); m; m = blockRe.exec(xml)) {
    const type = m[1]!;
    const head = m[2]!;
    const body = m[4] ?? "";
    if (type === "node") {
      const id = attr(head, "id");
      const lat = num(attr(head, "lat"));
      const lon = num(attr(head, "lon"));
      if (id && lat != null && lon != null) nodes.set(id, { lat, lon });
    }
    blocks.push({ type, head, body });
  }
  for (const { type, head, body } of blocks) {
    const tags: Record<string, string> = {};
    for (const t of body.matchAll(/<tag\b([^>]*)\/?>/g)) {
      const k = attr(t[1]!, "k");
      const v = attr(t[1]!, "v");
      if (k && v) tags[k] = v.trim();
    }
    if (!Object.keys(tags).length) continue;
    const id = attr(head, "id");
    let lat: number | undefined;
    let lon: number | undefined;
    if (type === "node") {
      lat = num(attr(head, "lat"));
      lon = num(attr(head, "lon"));
    } else {
      const center = /<center\b([^>]*)\/?>/.exec(body);
      if (center) {
        lat = num(attr(center[1]!, "lat"));
        lon = num(attr(center[1]!, "lon"));
      } else {
        const refs = [...body.matchAll(/<nd\b[^>]*\sref="(\d+)"/g)]
          .map((r) => nodes.get(r[1]!))
          .filter((p): p is { lat: number; lon: number } => Boolean(p));
        if (refs.length) {
          lat = refs.reduce((s, p) => s + p.lat, 0) / refs.length;
          lon = refs.reduce((s, p) => s + p.lon, 0) / refs.length;
        } else if (type === "way") {
          warnings.push(`${type}/${id} : géométrie absente du fichier (position inconnue).`);
        }
      }
    }
    pois.push({
      externalId: id ? `${type}/${id}` : undefined,
      tags,
      lat,
      lon,
      geometry: lat == null ? "none" : type === "node" ? "point" : "area",
    });
  }
  return limit({ format: "osm_xml", pois, warnings });
}

// ------------------------------------------------------------------- GeoJSON
interface Feature {
  id?: string | number;
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
}

export function parseGeoJson(data: unknown): ParseResult {
  const features = (data as { features?: Feature[] })?.features;
  if (!Array.isArray(features)) throw new Error("GeoJSON invalide : « features » absent.");
  const pois: RawPoi[] = [];
  const warnings: string[] = [];
  features.forEach((f, i) => {
    const tags = asTags(f.properties);
    const g = f.geometry;
    let lat: number | undefined;
    let lon: number | undefined;
    let geometry: RawPoi["geometry"] = "none";
    if (g?.type === "Point" && Array.isArray(g.coordinates)) {
      lon = num(g.coordinates[0]);
      lat = num(g.coordinates[1]);
      geometry = "point";
    } else if (g?.coordinates) {
      const c = centroid(g.coordinates);
      if (c) {
        lat = c.lat;
        lon = c.lon;
        geometry = "area";
      }
    }
    if (!Object.keys(tags).length) {
      warnings.push(`Objet ${i + 1} sans propriétés : ignoré.`);
      return;
    }
    // Exports OSM (overpass turbo) : « @id » = « node/123 » ; sinon identifiant de l'objet.
    const externalId = tags["@id"] ?? tags.osm_id ?? (f.id != null ? String(f.id) : undefined) ?? tags.id;
    pois.push({ externalId, tags, lat, lon, geometry: lat == null ? "none" : geometry });
  });
  return limit({ format: "geojson", pois, warnings });
}

// -------------------------------------------------------------- JSON générique
const LAT_KEYS = ["lat", "latitude", "y"];
const LON_KEYS = ["lon", "lng", "long", "longitude", "x"];
const ID_KEYS = ["@id", "osm_id", "id", "identifiant", "external_id"];

function fromRecord(rec: Record<string, string>): RawPoi {
  const lower = Object.fromEntries(Object.entries(rec).map(([k, v]) => [k.toLowerCase(), v]));
  const lat = LAT_KEYS.map((k) => num(lower[k])).find((v) => v != null);
  const lon = LON_KEYS.map((k) => num(lower[k])).find((v) => v != null);
  const idKey = ID_KEYS.find((k) => lower[k]);
  return {
    externalId: idKey ? lower[idKey] : undefined,
    tags: rec,
    lat,
    lon,
    geometry: lat == null ? "none" : "point",
  };
}

export function parseGenericJson(data: unknown): ParseResult {
  const list = Array.isArray(data)
    ? data
    : ((data as { data?: unknown[]; items?: unknown[]; places?: unknown[] })?.data ??
      (data as { items?: unknown[] })?.items ??
      (data as { places?: unknown[] })?.places);
  if (!Array.isArray(list)) throw new Error("JSON invalide : tableau de lieux attendu.");
  const warnings: string[] = [];
  const pois: RawPoi[] = [];
  list.forEach((item, i) => {
    if (!item || typeof item !== "object") {
      warnings.push(`Élément ${i + 1} illisible : ignoré.`);
      return;
    }
    // Étiquettes imbriquées (« tags » ou « properties ») fusionnées avec les champs de premier niveau.
    const o = item as Record<string, unknown>;
    const tags = { ...asTags(o), ...asTags(o.tags), ...asTags(o.properties) };
    pois.push(fromRecord(tags));
  });
  return limit({ format: "json", pois, warnings });
}

// ------------------------------------------------------------------------ CSV
/** Découpe une ligne CSV (guillemets doubles, séparateur détecté). */
function splitCsv(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export function parseCsv(text: string): ParseResult {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", "\t", ","].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]!;
  const rows = splitCsv(clean, sep);
  const header = rows.shift()?.map((h) => h.trim());
  if (!header?.length) throw new Error("CSV vide.");
  const warnings: string[] = [];
  const pois: RawPoi[] = [];
  rows.forEach((r, i) => {
    if (r.length !== header.length) {
      warnings.push(`Ligne ${i + 2} : ${r.length} colonnes au lieu de ${header.length} (ignorée).`);
      return;
    }
    const rec: Record<string, string> = {};
    header.forEach((h, j) => {
      const v = r[j]?.trim();
      if (h && v) rec[h] = v;
    });
    pois.push(fromRecord(rec));
  });
  return limit({ format: "csv", pois, warnings });
}

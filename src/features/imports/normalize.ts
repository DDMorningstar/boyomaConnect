import { parseOpeningHours } from "./hours";
import type { CategoryRef, ImportDraft, IssueCode, MappingRule, RawPoi } from "./types";

/**
 * Normalisation d'un point d'intérêt : seuls les attributs effectivement présents sont repris
 * (aucune valeur inventée). Les anomalies sont signalées ; la décision (rejet, quarantaine) est
 * prise en base à l'analyse du lot.
 */

/** E-mails personnels de contributeurs repérés sur de fausses fiches (série « bureaux administratifs »). */
export const BLOCKED_EMAILS = new Set(["shaloomdianadengamo@gmail.com"]);

/** Noms qui ne désignent pas un établissement précis (ex. « Police », « Marché ») : à vérifier. */
const GENERIC_NAMES = new Set(
  [
    "park",
    "parc",
    "police",
    "marche",
    "market",
    "eglise",
    "church",
    "ecole",
    "school",
    "hopital",
    "hospital",
    "centre de sante",
    "pharmacie",
    "pharmacy",
    "hotel",
    "restaurant",
    "bar",
    "boutique",
    "shop",
    "station",
    "terrain de football",
    "mosquee",
    "mosque",
    "banque",
    "bank",
    "clinique",
    "bureau",
    "office",
    "gare",
    "aeroport",
    "airport",
    "parking",
    "cafe",
    "stade",
    "place",
  ].map((s) => s.replace(/\s+/g, " ")),
);

const NAME_KEYS = ["name", "nom", "name:fr", "official_name", "titre", "title"];
const CATEGORY_KEYS = ["category", "categorie", "catégorie", "type", "boyoma_category", "category_slug"];
const PHONE_KEYS = [
  "phone",
  "contact:phone",
  "mobile",
  "contact:mobile",
  "telephone",
  "téléphone",
  "tel",
  "phone_number",
];
const WEBSITE_KEYS = ["website", "contact:website", "url", "site", "site_web", "site web"];
const EMAIL_KEYS = ["email", "contact:email", "e-mail", "mail", "courriel"];
const ADDRESS_KEYS = ["address", "adresse", "addr:full"];
const HOURS_KEYS = ["opening_hours", "horaires", "hours"];
const IMAGE_KEYS = ["image", "photo", "image_url"];

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const clean = (v: string | undefined, max: number) => {
  const s = v?.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

function pick(tags: Record<string, string>, keys: string[]): string | undefined {
  const lower = new Map(Object.entries(tags).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of keys) {
    const v = lower.get(k);
    if (v?.trim()) return v;
  }
  return undefined;
}

/** Numéro congolais ou international : « 0812345678 » → « +243 812345678 ». Null si illisible. */
export function normalizePhone(raw: string): string | null {
  let s = raw.replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (/^0\d{9}$/.test(s)) s = `+243${s.slice(1)}`;
  if (/^243\d{9}$/.test(s)) s = `+${s}`;
  if (!/^\+?\d{6,15}$/.test(s)) return null;
  return s.startsWith("+243") ? `+243 ${s.slice(4)}` : s;
}

export function normalizeWebsite(raw: string): string | null {
  const s = raw.trim();
  const url = /^https?:\/\//i.test(s) ? s : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s) ? `https://${s}` : null;
  if (!url || url.length > 300) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Image : lien direct https ou fichier Wikimedia Commons (référence seulement, jamais copiée). */
export function imageUrl(tags: Record<string, string>): string | null {
  const direct = pick(tags, IMAGE_KEYS);
  if (direct && /^https:\/\/\S+$/i.test(direct.trim())) return direct.trim().slice(0, 500);
  const commons = tags.wikimedia_commons?.trim();
  if (commons && /^(File|Fichier):/i.test(commons)) {
    return `https://commons.wikimedia.org/wiki/${encodeURIComponent(commons.replace(/ /g, "_")).replace(/%3A/i, ":")}`;
  }
  return null;
}

/** Correspondance OSM : règle la plus prioritaire (condition éventuelle comprise). */
export function resolveOsmCategory(tags: Record<string, string>, rules: MappingRule[]) {
  let best: MappingRule | null = null;
  for (const r of rules) {
    if (tags[r.osm_key] !== r.osm_value) continue;
    if (r.condition_key && tags[r.condition_key] !== r.condition_value) continue;
    if (!best || r.priority < best.priority) best = r;
  }
  return best;
}

/**
 * Fichier générique : colonne catégorie = slug Boyoma, nom de catégorie, ou étiquette OSM
 * « clé=valeur » ; sinon les étiquettes OSM présentes dans le fichier.
 */
export function resolveCategory(
  tags: Record<string, string>,
  rules: MappingRule[],
  categories: CategoryRef[],
): { category_id: string; rule: string } | null {
  const osm = resolveOsmCategory(tags, rules);
  if (osm) {
    const cond = osm.condition_key ? ` + ${osm.condition_key}=${osm.condition_value}` : "";
    return { category_id: osm.category_id, rule: `${osm.osm_key}=${osm.osm_value}${cond}` };
  }
  const raw = pick(tags, CATEGORY_KEYS);
  if (!raw) return null;
  const kv = /^([a-z_:]+)=([a-z0-9_;:.-]+)$/.exec(raw.trim());
  if (kv) {
    const r = resolveOsmCategory({ [kv[1]!]: kv[2]! }, rules);
    if (r) return { category_id: r.category_id, rule: `${r.osm_key}=${r.osm_value}` };
  }
  const n = normalizeText(raw);
  const c =
    categories.find((x) => x.slug === raw.trim().toLowerCase()) ??
    categories.find((x) => normalizeText(x.name) === n) ??
    categories.find((x) => normalizeText(x.slug.replace(/-/g, " ")) === n);
  return c ? { category_id: c.id, rule: `colonne « ${raw.trim().slice(0, 60)} »` } : null;
}

function isInactive(tags: Record<string, string>, name: string | null) {
  return (
    Object.keys(tags).some((k) => /^(disused|abandoned|demolished|was|razed|removed):/.test(k)) ||
    tags.disused === "yes" ||
    tags.abandoned === "yes" ||
    (name != null && /^ex[.\s]/i.test(name))
  );
}

function isSuspicious(name: string) {
  return (
    /https?:\/\/|www\.|@/.test(name) ||
    !/[a-zà-ÿ]/i.test(name) ||
    (name.length > 30 && name === name.toUpperCase() && /[A-Z]/.test(name))
  );
}

export interface NormalizeOptions {
  rules: MappingRule[];
  categories: CategoryRef[];
  /** Source OSM : l'identifiant « node/123 » est exigé (provenance, synchronisation). */
  requireOsmId: boolean;
}

export function normalizePoi(raw: RawPoi, index: number, opts: NormalizeOptions): ImportDraft {
  const issues = new Set<IssueCode>();
  const tags = raw.tags;

  // Nom
  const rawName = clean(pick(tags, NAME_KEYS), 400);
  let name = rawName;
  if (!name || name.length < 2) {
    issues.add("missing_name");
    name = null;
  } else {
    if (name.length > 140) {
      issues.add("name_too_long");
      name = name.slice(0, 140);
    }
    if (GENERIC_NAMES.has(normalizeText(name))) issues.add("generic_name");
    if (isSuspicious(name)) issues.add("suspicious_name");
  }
  if (isInactive(tags, name)) issues.add("inactive");

  // Position
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (raw.lat != null && raw.lon != null) {
    const ok = Math.abs(raw.lat) <= 90 && Math.abs(raw.lon) <= 180 && !(raw.lat === 0 && raw.lon === 0);
    if (ok) {
      latitude = Number(raw.lat.toFixed(7));
      longitude = Number(raw.lon.toFixed(7));
    } else issues.add("invalid_coordinates");
  } else issues.add("missing_coordinates");

  // Identifiant source
  let externalId = raw.externalId?.trim().slice(0, 120) || null;
  if (opts.requireOsmId) {
    if (!externalId || !/^(node|way|relation)\/\d+$/.test(externalId)) {
      issues.add("missing_source_id");
      externalId = null;
    }
  }

  // Catégorie
  const cat = resolveCategory(tags, opts.rules, opts.categories);
  if (!cat) issues.add("unmapped_category");

  // Contacts
  const phones = new Set<string>();
  for (const key of PHONE_KEYS) {
    const v = pick(tags, [key]);
    for (const part of v?.split(/[;,/]|\s{2,}/) ?? []) {
      if (!part.trim()) continue;
      const p = normalizePhone(part);
      if (p) phones.add(p);
      else issues.add("invalid_phone");
    }
  }
  const siteRaw = pick(tags, WEBSITE_KEYS);
  const website = siteRaw ? normalizeWebsite(siteRaw) : null;
  if (siteRaw && !website) issues.add("invalid_website");
  const emailRaw = pick(tags, EMAIL_KEYS)?.trim().toLowerCase();
  let email: string | null = null;
  if (emailRaw) {
    if (BLOCKED_EMAILS.has(emailRaw)) issues.add("blocked_contact");
    else if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw) && emailRaw.length <= 300) email = emailRaw;
    else issues.add("invalid_email");
  }

  // Adresse : champ complet, sinon numéro + rue (+ quartier).
  const street = clean(tags["addr:street"], 200);
  const address =
    clean(pick(tags, ADDRESS_KEYS), 300) ??
    (street
      ? clean(
          [tags["addr:housenumber"], street, tags["addr:suburb"] ?? tags["addr:quarter"]]
            .filter(Boolean)
            .join(" "),
          300,
        )
      : null);

  // Horaires
  const opening = clean(pick(tags, HOURS_KEYS), 300);
  const hours = opening ? parseOpeningHours(opening) : null;
  if (opening && !hours) issues.add("hours_unparsed");

  // Attributs conservés (étiquettes brutes, bornées) pour l'aperçu et la traçabilité.
  const attributes: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags).slice(0, 60)) attributes[k.slice(0, 60)] = v.slice(0, 200);

  return {
    row_index: index,
    external_id: externalId,
    name,
    category_id: cat?.category_id ?? null,
    mapping_rule: cat?.rule.slice(0, 120) ?? null,
    latitude,
    longitude,
    geographic_precision: latitude == null ? "unknown" : raw.geometry === "point" ? "exact" : "approximate",
    address,
    phones: [...phones].slice(0, 5),
    website,
    email,
    image_url: imageUrl(tags),
    opening_hours: opening,
    hours: hours ?? [],
    attributes,
    issues: [...issues],
  };
}

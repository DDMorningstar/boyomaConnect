/**
 * Zones de navigation (décision D29) : la province, sa ville et ses territoires.
 * Partagé client/serveur : aucune requête ici (voir queries.ts).
 */

export const PROVINCE_SLUG = "tshopo";
/** Zone par défaut tant que l'utilisateur n'en a pas choisi une autre. */
export const DEFAULT_ZONE = "kisangani";
/** Cookie mémorisant la zone choisie (posé par le middleware quand l'URL contient ?zone=). */
export const ZONE_COOKIE = "boyoma_zone";
export const ZONE_TYPES = ["province", "ville", "territoire"] as const;

export type ZoneType = (typeof ZONE_TYPES)[number];

export interface Zone {
  id: string;
  slug: string;
  name: string;
  type_key: ZoneType;
  center_latitude: number | null;
  center_longitude: number | null;
  default_zoom: number | null;
  place_count: number;
}

export const isZoneSlug = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9-]{1,60}$/.test(v);

const elides = (name: string) => /^[aeiouyàâéèêîôû]/i.test(name);
/** « de Banalia », « d'Isangi ». */
export const deName = (name: string) => (elides(name) ? `d'${name}` : `de ${name}`);

/** Libellé court d'un sélecteur : « Toute la Tshopo », « Kisangani », « Isangi ». */
export function zoneLabel(z: Pick<Zone, "name" | "type_key">) {
  return z.type_key === "province" ? `Toute la ${z.name}` : z.name;
}

/** Titre complet : « Province de la Tshopo », « Ville de Kisangani », « Territoire d'Isangi ». */
export function zoneTitle(z: Pick<Zone, "name" | "type_key">) {
  if (z.type_key === "province") return `Province de la ${z.name}`;
  if (z.type_key === "ville") return `Ville ${deName(z.name)}`;
  return `Territoire ${deName(z.name)}`;
}

/** Complément de lieu : « dans la Tshopo », « à Kisangani », « dans le territoire d'Isangi ». */
export function zoneIn(z: Pick<Zone, "name" | "type_key">) {
  if (z.type_key === "province") return `dans la ${z.name}`;
  if (z.type_key === "ville") return `à ${z.name}`;
  return `dans le territoire ${deName(z.name)}`;
}

/** Unité administrative d'un lieu, avec son parent (commune → ville). */
export interface UnitRef {
  name: string;
  type_key: string;
  parent?: { name: string; type_key: string } | null;
}

/** Ville ou territoire d'un lieu (« Kisangani », « Isangi ») ; la province à défaut. */
export function localityName(unit: UnitRef | null | undefined): string {
  if (!unit) return "Tshopo";
  if (unit.type_key === "commune") return unit.parent?.name ?? unit.name;
  return unit.name;
}

/** Localisation lisible : « Commune de Makiso, Kisangani », « Territoire d'Isangi », « Kisangani ». */
export function placeLocation(unit: UnitRef | null | undefined): string {
  if (!unit) return "Tshopo";
  if (unit.type_key === "commune") return `Commune ${deName(unit.name)}, ${localityName(unit)}`;
  if (unit.type_key === "territoire") return `Territoire ${deName(unit.name)}`;
  return unit.name;
}

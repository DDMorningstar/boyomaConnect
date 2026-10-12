/**
 * Module d'importation (décision D30) : types partagés client/serveur, sans dépendance.
 * Chaîne : fichier ou API → RawPoi (lecture) → ImportDraft (normalisation) → import_items (analyse SQL).
 */

export type FileFormat = "osm_xml" | "osm_json" | "geojson" | "json" | "csv";

/** Point d'intérêt tel que lu dans la source : étiquettes brutes + position éventuelle. */
export interface RawPoi {
  /** Identifiant d'origine (ex. « node/123 » pour OSM, valeur d'une colonne id sinon). */
  externalId?: string;
  tags: Record<string, string>;
  lat?: number;
  lon?: number;
  /** « point » : position exacte ; « area » : centre d'une emprise (approximatif). */
  geometry: "point" | "area" | "none";
}

export interface ParseResult {
  format: FileFormat;
  pois: RawPoi[];
  /** Lignes ou objets ignorés à la lecture (illisibles), avec motif. */
  warnings: string[];
}

/** Règle de correspondance étiquette OSM → catégorie Boyoma (table osm_category_mappings). */
export interface MappingRule {
  osm_key: string;
  osm_value: string;
  condition_key: string | null;
  condition_value: string | null;
  category_id: string;
  category_slug: string;
  priority: number;
}

/** Catégorie connue (correspondance des fichiers génériques par slug ou nom). */
export interface CategoryRef {
  id: string;
  slug: string;
  name: string;
}

export interface HoursSlot {
  /** ISO : 1 = lundi … 7 = dimanche (convention de place_hours). */
  day: number;
  opens: string;
  closes: string;
}

/** Élément normalisé, prêt à être déposé dans import_items. */
export interface ImportDraft {
  row_index: number;
  external_id: string | null;
  name: string | null;
  category_id: string | null;
  mapping_rule: string | null;
  latitude: number | null;
  longitude: number | null;
  geographic_precision: "exact" | "approximate" | "unknown";
  address: string | null;
  phones: string[];
  website: string | null;
  email: string | null;
  image_url: string | null;
  opening_hours: string | null;
  hours: HoursSlot[];
  attributes: Record<string, string>;
  issues: IssueCode[];
}

/** Anomalies détectées. La gravité (rejet / quarantaine / info) est fixée en base (import_issue_severity). */
export type IssueCode =
  | "missing_name"
  | "name_too_long"
  | "generic_name"
  | "suspicious_name"
  | "inactive"
  | "blocked_contact"
  | "invalid_coordinates"
  | "missing_coordinates"
  | "unmapped_category"
  | "missing_source_id"
  | "invalid_phone"
  | "invalid_website"
  | "invalid_email"
  | "hours_unparsed"
  | "outside_zone"
  | "outside_known_boundaries"
  | "unit_from_zone"
  | "import_error";

export const ISSUE_LABELS: Record<IssueCode, { label: string; severity: "reject" | "quarantine" | "info" }> =
  {
    missing_name: { label: "Nom absent ou trop court", severity: "reject" },
    inactive: { label: "Lieu marqué disparu ou désaffecté", severity: "reject" },
    blocked_contact: { label: "Contact personnel bloqué", severity: "reject" },
    invalid_coordinates: { label: "Coordonnées invalides", severity: "reject" },
    outside_zone: { label: "Hors de la zone demandée", severity: "reject" },
    outside_known_boundaries: { label: "Hors des limites connues", severity: "reject" },
    name_too_long: { label: "Nom trop long", severity: "quarantine" },
    generic_name: { label: "Nom générique (ex. « Police »)", severity: "quarantine" },
    suspicious_name: { label: "Nom suspect", severity: "quarantine" },
    missing_coordinates: { label: "Position absente", severity: "quarantine" },
    unmapped_category: { label: "Catégorie non reconnue", severity: "quarantine" },
    missing_source_id: { label: "Identifiant source absent", severity: "quarantine" },
    invalid_phone: { label: "Téléphone illisible (ignoré)", severity: "info" },
    invalid_website: { label: "Site web invalide (ignoré)", severity: "info" },
    invalid_email: { label: "E-mail invalide (ignoré)", severity: "info" },
    hours_unparsed: { label: "Horaires non interprétés (conservés bruts)", severity: "info" },
    unit_from_zone: { label: "Rattaché à la zone (limite inconnue)", severity: "info" },
    import_error: { label: "Erreur à l'import", severity: "reject" },
  };

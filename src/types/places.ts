export type VerificationStatus =
  "unverified" | "community_reported" | "agent_verified" | "owner_verified" | "admin_verified";

export type GeographicPrecision = "exact" | "approximate" | "street" | "neighborhood" | "commune" | "unknown";
export type ActivityStatus = "operating" | "temporarily_closed" | "permanently_closed" | "unknown";

/** Ligne renvoyée par la fonction RPC search_places. */
export interface PlaceSearchRow {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  primary_category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  category_icon: string | null;
  category_color: string | null;
  administrative_unit_id: string | null;
  unit_name: string | null;
  address_text: string | null;
  landmark_description: string | null;
  latitude: number | null;
  longitude: number | null;
  geographic_precision: GeographicPrecision;
  verification_status: VerificationStatus;
  activity_status: ActivityStatus;
  price_range: number | null;
  rating_avg: number | null;
  rating_count: number;
  cover_path: string | null;
  published_at: string | null;
  last_verified_at: string | null;
  distance_m: number | null;
  relevance: number;
  total_count: number;
}

export interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  color: string;
  sort_order: number;
  is_featured: boolean;
}

export interface CategoryWithCount extends Category {
  place_count: number;
}

export interface GeoUnit {
  id: string;
  name: string;
  slug: string;
  type_key: string;
  parent_id: string | null;
  center_latitude: number | null;
  center_longitude: number | null;
  default_zoom: number | null;
}

export interface PlaceContact {
  id: string;
  kind:
    | "phone"
    | "whatsapp"
    | "email"
    | "website"
    | "facebook"
    | "instagram"
    | "tiktok"
    | "x"
    | "linkedin"
    | "youtube"
    | "other";
  value: string;
  label: string | null;
  is_primary: boolean;
  verified_at: string | null;
}

export interface PlaceHour {
  day_of_week: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
}

export interface PlaceDetail {
  id: string;
  slug: string;
  name: string;
  official_name: string | null;
  short_description: string | null;
  full_description: string | null;
  address_text: string | null;
  landmark_description: string | null;
  directions: string | null;
  latitude: number | null;
  longitude: number | null;
  geographic_precision: GeographicPrecision;
  verification_status: VerificationStatus;
  activity_status: ActivityStatus;
  ownership_status: "unclaimed" | "claim_pending" | "claimed";
  price_range: number | null;
  currency: "USD" | "CDF" | null;
  payment_methods: string[];
  wheelchair_accessible: boolean | null;
  accessibility_notes: string | null;
  hours_verified_at: string | null;
  cover_path: string | null;
  logo_path: string | null;
  rating_avg: number | null;
  rating_count: number;
  published_at: string | null;
  last_verified_at: string | null;
  updated_at: string;
  primary_category: Pick<Category, "id" | "name" | "slug" | "icon" | "color"> | null;
  unit: { id: string; name: string; slug: string; type_key: string } | null;
  place_categories: { category: Pick<Category, "id" | "name" | "slug" | "icon" | "color"> | null }[];
  place_contacts: PlaceContact[];
  place_hours: PlaceHour[];
  place_services: { id: string; name: string; description: string | null }[];
  place_media: {
    id: string;
    storage_path: string;
    kind: string;
    caption: string | null;
    width: number | null;
    height: number | null;
  }[];
  place_amenity_links: { amenity: { key: string; name: string; icon: string } | null }[];
  /** Provenance d'un lieu importé (ex. OpenStreetMap) : attribution obligatoire. */
  place_external_refs: { source: string; license: string; attribution: string; source_url: string | null }[];
  /** Catalogue publié par l'établissement (prix facultatifs, jamais inventés). */
  catalog_items: {
    id: string;
    kind: "product" | "service";
    name: string;
    description: string | null;
    price: number | null;
    currency: "USD" | "CDF" | null;
    availability: "available" | "on_request" | "unavailable" | "unknown";
  }[];
}

export interface PublicReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  visit_month: string | null;
  owner_response: string | null;
  owner_response_at: string | null;
  created_at: string;
  author_name: string;
}

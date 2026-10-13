import { formatPrice } from "@/lib/format";

/**
 * Catalogue (décision D31) : présentation partagée entre l'espace pro et la fiche publique.
 * Boyoma Connect affiche l'offre ; la commande se fait directement avec l'établissement.
 */

export type PriceType = "fixed" | "from" | "on_quote" | "free";
export type Availability = "available" | "on_request" | "unavailable" | "unknown";

export interface CatalogEntry {
  id: string;
  kind: "product" | "service";
  name: string;
  description: string | null;
  category_label: string | null;
  price: number | null;
  currency: "USD" | "CDF" | null;
  price_type: PriceType;
  price_unit: string | null;
  availability: Availability;
  photo_paths: string[];
  is_featured: boolean;
  is_published: boolean;
  sort_order: number;
}

export const PRICE_TYPES: Record<PriceType, string> = {
  fixed: "Prix fixe",
  from: "À partir de",
  on_quote: "Sur devis",
  free: "Gratuit",
};

export const AVAILABILITY: Record<Availability, string> = {
  available: "Disponible",
  on_request: "Sur demande",
  unavailable: "Indisponible",
  unknown: "Disponibilité non précisée",
};

/** « 15 000 FC / nuit », « À partir de 25 $ », « Sur devis », « Gratuit » ; null si aucun prix indiqué. */
export function catalogPrice(
  item: Pick<CatalogEntry, "price" | "currency" | "price_type" | "price_unit">,
): string | null {
  if (item.price_type === "on_quote") return "Sur devis";
  if (item.price_type === "free") return "Gratuit";
  if (item.price == null || !item.currency) return null;
  const amount = formatPrice(item.price, item.currency);
  const unit = item.price_unit ? ` / ${item.price_unit}` : "";
  return item.price_type === "from" ? `À partir de ${amount}${unit}` : `${amount}${unit}`;
}

/** Articles visibles : publiés, mis en avant d'abord puis ordre choisi par l'établissement. */
export function visibleCatalog<T extends Pick<CatalogEntry, "is_published" | "is_featured" | "sort_order">>(
  items: T[],
): T[] {
  return items
    .filter((i) => i.is_published)
    .sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || a.sort_order - b.sort_order);
}

/** Message pré-rempli (WhatsApp, e-mail) : l'établissement sait de quel article il s'agit. */
export function inquiryMessage(
  placeName: string,
  item: Pick<CatalogEntry, "name"> & { priceLabel: string | null },
  url: string,
) {
  const price = item.priceLabel ? ` (${item.priceLabel})` : "";
  return `Bonjour ${placeName}, je suis intéressé(e) par « ${item.name} »${price}, vu sur Boyoma Connect : ${url}`;
}

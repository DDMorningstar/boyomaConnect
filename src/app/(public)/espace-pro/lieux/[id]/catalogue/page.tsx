import { notFound } from "next/navigation";
import { getConsolePlace } from "@/features/owner/business";
import { CatalogManager } from "./catalog-manager";

type Props = { params: Promise<{ id: string }> };

/** Catalogue : produits et services présentés sur la fiche (décision D31). */
export default async function CataloguePage({ params }: Props) {
  const { id } = await params;
  const place = await getConsolePlace(id);
  if (!place) notFound();
  return <CatalogManager placeId={place.id} items={place.catalog_items} />;
}

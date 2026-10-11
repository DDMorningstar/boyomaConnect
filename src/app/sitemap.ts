import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { getPublishedPlaceSlugs } from "@/features/places/queries";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_SITE_URL;
  const staticPages = ["", "/explorer", "/categories", "/carte", "/tourisme", "/aide"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "daily" as const,
    priority: p === "" ? 1 : 0.7,
  }));
  try {
    const places = await getPublishedPlaceSlugs();
    return [
      ...staticPages,
      ...places.map((p) => ({ url: `${base}/lieux/${p.slug}`, lastModified: p.updated_at, changeFrequency: "weekly" as const, priority: 0.8 })),
    ];
  } catch {
    return staticPages;
  }
}

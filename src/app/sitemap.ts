import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { getPublishedPlaceSlugs } from "@/features/places/queries";
import { getZoneSlugs } from "@/features/zones/queries";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_SITE_URL;
  const staticPages = ["", "/explorer", "/categories", "/carte", "/tourisme", "/aide"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "daily" as const,
    priority: p === "" ? 1 : 0.7,
  }));
  try {
    const [places, zones] = await Promise.all([getPublishedPlaceSlugs(), getZoneSlugs()]);
    return [
      ...staticPages,
      ...zones.map((slug) => ({
        url: `${base}/zones/${slug}`,
        changeFrequency: "daily" as const,
        priority: 0.7,
      })),
      ...places.map((p) => ({
        url: `${base}/lieux/${p.slug}`,
        lastModified: p.updated_at,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    return staticPages;
  }
}

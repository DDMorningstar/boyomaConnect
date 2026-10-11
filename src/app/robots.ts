import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/recherche",
          "/favoris",
          "/profil",
          "/connexion",
          "/inscription",
          "/business",
          "/terrain",
          "/admin",
          "/api",
          "/hors-ligne",
        ],
      },
    ],
    sitemap: `${env.NEXT_PUBLIC_SITE_URL}/sitemap.xml`,
  };
}

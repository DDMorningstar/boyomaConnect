import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Boyoma Connect",
    short_name: "Boyoma",
    description: "Votre ville. Vos adresses. Votre chemin. Trouvez et localisez les lieux et services de Kisangani.",
    lang: "fr",
    dir: "ltr",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B1736",
    theme_color: "#0B1736",
    categories: ["travel", "navigation", "business", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "À proximité", url: "/proximite", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Carte", url: "/carte", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Favoris", url: "/favoris", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}

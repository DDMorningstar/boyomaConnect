/** Type de page anonyme pour la mesure de vitesse (jamais l'adresse complète ni les paramètres). */
export function vitalsRoute(pathname: string): string | null {
  if (pathname.startsWith("/admin")) return null;
  if (pathname === "/") return "Accueil";
  const rules: [string, string][] = [
    ["/lieux/", "Fiche"],
    ["/recherche", "Recherche"],
    ["/categories", "Catégories"],
    ["/carte", "Carte"],
    ["/proximite", "À proximité"],
    ["/explorer", "Explorer"],
    ["/communes", "Communes et zones"],
    ["/zones", "Communes et zones"],
    ["/tourisme", "Tourisme"],
    ["/favoris", "Favoris"],
    ["/espace-pro", "Espace pro"],
  ];
  return rules.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "Autres pages";
}

export const VITALS_METRICS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export const VITALS_SAMPLE_RATE = 0.3;

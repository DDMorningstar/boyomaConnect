import { describe, expect, it } from "vitest";
import { vitalsRoute } from "@/features/vitals/routes";

describe("type de page pour la mesure de vitesse", () => {
  it("classe sans jamais garder l'adresse complète", () => {
    expect(vitalsRoute("/")).toBe("Accueil");
    expect(vitalsRoute("/lieux/rex-transit")).toBe("Fiche");
    expect(vitalsRoute("/recherche")).toBe("Recherche");
    expect(vitalsRoute("/zones/kisangani")).toBe("Communes et zones");
    expect(vitalsRoute("/aide")).toBe("Autres pages");
  });
  it("ignore la console d'administration", () => {
    expect(vitalsRoute("/admin/medias")).toBeNull();
  });
});

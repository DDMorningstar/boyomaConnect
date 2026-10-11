import { describe, expect, it } from "vitest";
import { parseSearchParams } from "@/lib/search-params";

describe("parseSearchParams", () => {
  it("applique les valeurs par défaut", () => {
    const p = parseSearchParams({});
    expect(p).toMatchObject({ tri: "relevance", page: 1, ouvert: false, verifie: false });
    expect(p.q).toBeUndefined();
  });
  it("nettoie et borne les entrées", () => {
    const p = parseSearchParams({ q: "  pharmacie  ", page: "999", tri: "inconnu", commune: "pas-un-uuid" });
    expect(p.q).toBe("pharmacie");
    expect(p.page).toBe(1);
    expect(p.tri).toBe("relevance");
    expect(p.commune).toBeUndefined();
  });
  it("refuse un slug de catégorie invalide sans rejeter le reste", () => {
    const p = parseSearchParams({ q: "hotel", categorie: "<script>" });
    expect(p.categorie).toBeUndefined();
    expect(p.q).toBe("hotel");
  });
  it("retombe sur la pertinence si le tri par distance n'a pas de position", () => {
    expect(parseSearchParams({ tri: "distance" }).tri).toBe("relevance");
    expect(parseSearchParams({ tri: "distance", lat: "0.5", lng: "25.2" }).tri).toBe("distance");
  });
  it("prend la première valeur d'un paramètre répété et rejette des coordonnées hors bornes", () => {
    const p = parseSearchParams({ q: ["a1", "b2"], lat: "120", lng: "25" });
    expect(p.q).toBe("a1");
    expect(p.lat).toBeUndefined();
  });
  it("interprète les filtres booléens", () => {
    expect(parseSearchParams({ ouvert: "1", verifie: "1" })).toMatchObject({ ouvert: true, verifie: true });
    expect(parseSearchParams({ ouvert: "oui" }).ouvert).toBe(false);
  });
});

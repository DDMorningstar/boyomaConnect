import { describe, expect, it } from "vitest";
import {
  formatCoordinates,
  formatDistance,
  haversineMeters,
  normalizeText,
  toWhatsAppNumber,
} from "@/lib/format";

describe("formatDistance", () => {
  it("arrondit les petites distances à 10 m (minimum 10 m)", () => {
    expect(formatDistance(3)).toBe("10 m");
    expect(formatDistance(447)).toBe("450 m");
  });
  it("affiche les km avec une décimale à la française", () => {
    expect(formatDistance(1250)).toBe("1,3 km");
    expect(formatDistance(8220)).toBe("8,2 km");
    expect(formatDistance(23_400)).toBe("23 km");
  });
  it("rejette les valeurs invalides", () => {
    expect(formatDistance(null)).toBeNull();
    expect(formatDistance(-5)).toBeNull();
    expect(formatDistance(Number.NaN)).toBeNull();
  });
});

describe("haversineMeters", () => {
  it("est cohérent avec PostGIS (≈ 8,2 km entre deux points de test à Kisangani)", () => {
    const d = haversineMeters({ lat: 0.5153, lng: 25.191 }, { lat: 0.56, lng: 25.25 });
    expect(d).toBeGreaterThan(8150);
    expect(d).toBeLessThan(8300);
  });
  it("vaut 0 pour un même point", () => {
    expect(haversineMeters({ lat: 0.5, lng: 25.2 }, { lat: 0.5, lng: 25.2 })).toBe(0);
  });
});

describe("normalizeText", () => {
  it("supprime accents, majuscules et espaces superflus", () => {
    expect(normalizeText("  Pharmacie   ÉLÉPHANT ")).toBe("pharmacie elephant");
    expect(normalizeText(null)).toBe("");
  });
});

describe("formatCoordinates", () => {
  it("indique les hémisphères (latitude d'abord)", () => {
    expect(formatCoordinates(0.5153, 25.191)).toBe("0.51530° N, 25.19100° E");
    expect(formatCoordinates(-4.3, -15.2)).toBe("4.30000° S, 15.20000° O");
  });
});

describe("toWhatsAppNumber", () => {
  it("ajoute l'indicatif RDC aux numéros locaux", () => {
    expect(toWhatsAppNumber("0812 345 678")).toBe("243812345678");
  });
  it("conserve les formats internationaux", () => {
    expect(toWhatsAppNumber("+243 81 234 5678")).toBe("243812345678");
    expect(toWhatsAppNumber("00243812345678")).toBe("243812345678");
  });
  it("rejette les numéros invalides", () => {
    expect(toWhatsAppNumber("abc")).toBeNull();
    expect(toWhatsAppNumber("123")).toBeNull();
  });
});

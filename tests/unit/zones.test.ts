import { describe, expect, it } from "vitest";
import {
  deName,
  isZoneSlug,
  localityName,
  placeLocation,
  zoneIn,
  zoneLabel,
  zoneTitle,
} from "@/features/zones/zones";

describe("libellés de zone", () => {
  const province = { name: "Tshopo", type_key: "province" as const };
  const ville = { name: "Kisangani", type_key: "ville" as const };
  const isangi = { name: "Isangi", type_key: "territoire" as const };
  const banalia = { name: "Banalia", type_key: "territoire" as const };

  it("élide « de » devant une voyelle", () => {
    expect(deName("Isangi")).toBe("d'Isangi");
    expect(deName("Ubundu")).toBe("d'Ubundu");
    expect(deName("Opala")).toBe("d'Opala");
    expect(deName("Banalia")).toBe("de Banalia");
  });

  it("titres, compléments et libellés courts", () => {
    expect(zoneTitle(province)).toBe("Province de la Tshopo");
    expect(zoneTitle(ville)).toBe("Ville de Kisangani");
    expect(zoneTitle(isangi)).toBe("Territoire d'Isangi");
    expect(zoneIn(province)).toBe("dans la Tshopo");
    expect(zoneIn(ville)).toBe("à Kisangani");
    expect(zoneIn(banalia)).toBe("dans le territoire de Banalia");
    expect(zoneLabel(province)).toBe("Toute la Tshopo");
    expect(zoneLabel(isangi)).toBe("Isangi");
  });

  it("localité d'un lieu selon son rattachement réel", () => {
    const makiso = { name: "Makiso", type_key: "commune", parent: { name: "Kisangani", type_key: "ville" } };
    expect(localityName(makiso)).toBe("Kisangani");
    expect(placeLocation(makiso)).toBe("Commune de Makiso, Kisangani");
    expect(localityName(isangi)).toBe("Isangi");
    expect(placeLocation(isangi)).toBe("Territoire d'Isangi");
    expect(placeLocation(ville)).toBe("Kisangani");
    expect(localityName(null)).toBe("Tshopo");
  });

  it("valide les slugs de zone (entrée non fiable)", () => {
    expect(isZoneSlug("isangi")).toBe(true);
    expect(isZoneSlug("Isangi")).toBe(false);
    expect(isZoneSlug("../x")).toBe(false);
    expect(isZoneSlug(undefined)).toBe(false);
    expect(isZoneSlug("a".repeat(61))).toBe(false);
  });
});

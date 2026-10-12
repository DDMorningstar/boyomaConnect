import { describe, expect, it } from "vitest";
import { parseOpeningHours } from "@/features/imports/hours";
import {
  detectFormat,
  parseCsv,
  parseFile,
  parseGenericJson,
  parseGeoJson,
  parseOsmXml,
  parseOverpassJson,
} from "@/features/imports/parsers";
import {
  imageUrl,
  normalizePhone,
  normalizePoi,
  normalizeWebsite,
  resolveCategory,
} from "@/features/imports/normalize";
import { buildOverpassQuery } from "@/features/imports/overpass";
import type { CategoryRef, MappingRule } from "@/features/imports/types";

const rules: MappingRule[] = [
  {
    osm_key: "amenity",
    osm_value: "pharmacy",
    condition_key: null,
    condition_value: null,
    category_id: "c-pharma",
    category_slug: "pharmacies",
    priority: 10,
  },
  {
    osm_key: "healthcare",
    osm_value: "pharmacy",
    condition_key: null,
    condition_value: null,
    category_id: "c-pharma",
    category_slug: "pharmacies",
    priority: 20,
  },
  {
    osm_key: "amenity",
    osm_value: "place_of_worship",
    condition_key: "religion",
    condition_value: "muslim",
    category_id: "c-mosq",
    category_slug: "mosquees",
    priority: 5,
  },
  {
    osm_key: "amenity",
    osm_value: "place_of_worship",
    condition_key: "religion",
    condition_value: "christian",
    category_id: "c-egl",
    category_slug: "eglises",
    priority: 5,
  },
];
const categories: CategoryRef[] = [
  { id: "c-pharma", slug: "pharmacies", name: "Pharmacies" },
  { id: "c-hotel", slug: "hotels", name: "Hôtels" },
];
const opts = { rules, categories, requireOsmId: false };

describe("lecture des fichiers", () => {
  it("détecte les formats", () => {
    expect(detectFormat("a.csv", "nom;lat")).toBe("csv");
    expect(detectFormat("a.osm", '<?xml version="1.0"?><osm version="0.6">')).toBe("osm_xml");
    expect(detectFormat("a.json", '{"type":"FeatureCollection","features":[]}')).toBe("geojson");
    expect(detectFormat("a.json", '{"version":0.6,"elements":[]}')).toBe("osm_json");
    expect(detectFormat("a.json", '[{"name":"x"}]')).toBe("json");
    expect(detectFormat("a.pdf", "%PDF-1.4")).toBeNull();
    expect(() => parseFile("a.pdf", "%PDF")).toThrow(/Format non reconnu/);
  });

  it("JSON Overpass : nœuds et centres d'emprises, nœuds de géométrie ignorés", () => {
    const r = parseOverpassJson({
      elements: [
        { type: "node", id: 1, lat: 0.5, lon: 25.2, tags: { name: "A", amenity: "pharmacy" } },
        { type: "way", id: 2, center: { lat: 0.6, lon: 25.3 }, tags: { name: "B" } },
        { type: "node", id: 3, lat: 0.1, lon: 0.1 },
      ],
    });
    expect(r.pois).toHaveLength(2);
    expect(r.pois[0]).toMatchObject({ externalId: "node/1", geometry: "point", lat: 0.5 });
    expect(r.pois[1]).toMatchObject({ externalId: "way/2", geometry: "area", lon: 25.3 });
  });

  it("OSM XML : nœud étiqueté, voie ramenée au centre de ses nœuds, entités décodées", () => {
    const xml = `<?xml version="1.0"?><osm version="0.6">
      <node id="10" lat="0.50" lon="25.20"/>
      <node id="11" lat="0.52" lon="25.22"/>
      <node id="12" lat="0.51" lon="25.21"><tag k="name" v="Pharmacie &amp; Co"/><tag k="amenity" v="pharmacy"/></node>
      <way id="20"><nd ref="10"/><nd ref="11"/><tag k="name" v="Marché"/><tag k="amenity" v="marketplace"/></way>
    </osm>`;
    const r = parseOsmXml(xml);
    expect(r.pois).toHaveLength(2);
    expect(r.pois[0]).toMatchObject({
      externalId: "node/12",
      geometry: "point",
      tags: { name: "Pharmacie & Co" },
    });
    expect(r.pois[1]!.externalId).toBe("way/20");
    expect(r.pois[1]!.lat).toBeCloseTo(0.51, 5);
    expect(r.pois[1]!.geometry).toBe("area");
  });

  it("GeoJSON : point, polygone (centre) et identifiant @id", () => {
    const r = parseGeoJson({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [25.19, 0.51] },
          properties: { name: "P", "@id": "node/5" },
        },
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [25, 0],
                [25.2, 0],
                [25.2, 0.2],
                [25, 0.2],
              ],
            ],
          },
          properties: { name: "Zone" },
        },
        { type: "Feature", geometry: null, properties: {} },
      ],
    });
    expect(r.pois).toHaveLength(2);
    expect(r.pois[0]).toMatchObject({ externalId: "node/5", lat: 0.51, lon: 25.19, geometry: "point" });
    expect(r.pois[1]!.lat).toBeCloseTo(0.1, 5);
    expect(r.warnings).toHaveLength(1);
  });

  it("JSON générique : champs latitude/longitude et étiquettes imbriquées", () => {
    const r = parseGenericJson({
      data: [{ nom: "Hôtel X", latitude: "0,51", longitude: 25.2, tags: { tourism: "hotel" } }],
    });
    expect(r.pois[0]).toMatchObject({ lat: 0.51, lon: 25.2, geometry: "point" });
    expect(r.pois[0]!.tags.tourism).toBe("hotel");
  });

  it("CSV : point-virgule, guillemets, BOM, ligne incomplète signalée", () => {
    const csv =
      '﻿nom;categorie;lat;lon;telephone\n"Pharmacie ""La Vie""";pharmacies;0.51;25.19;0812345678\nIncomplète;hotels\n';
    const r = parseCsv(csv);
    expect(r.pois).toHaveLength(1);
    expect(r.pois[0]!.tags.nom).toBe('Pharmacie "La Vie"');
    expect(r.warnings[0]).toMatch(/Ligne 3/);
  });
});

describe("normalisation", () => {
  it("téléphones congolais, sites web, images Wikimedia", () => {
    expect(normalizePhone("0812 345 678")).toBe("+243 812345678");
    expect(normalizePhone("00243 99 123 4567")).toBe("+243 991234567");
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizeWebsite("unikis.ac.cd")).toBe("https://unikis.ac.cd/");
    expect(normalizeWebsite("javascript:alert(1)")).toBeNull();
    expect(imageUrl({ wikimedia_commons: "File:Kisangani cathedral.jpg" })).toBe(
      "https://commons.wikimedia.org/wiki/File:Kisangani_cathedral.jpg",
    );
    expect(imageUrl({ image: "http://insecure.example/x.jpg" })).toBeNull();
  });

  it("correspondance OSM avec condition (lieu de culte) et priorité", () => {
    expect(
      resolveCategory({ amenity: "place_of_worship", religion: "muslim" }, rules, categories)?.category_id,
    ).toBe("c-mosq");
    expect(resolveCategory({ amenity: "place_of_worship" }, rules, categories)).toBeNull();
    expect(resolveCategory({ amenity: "pharmacy", healthcare: "pharmacy" }, rules, categories)?.rule).toBe(
      "amenity=pharmacy",
    );
    // Fichier générique : slug, nom de catégorie ou étiquette « clé=valeur ».
    expect(resolveCategory({ categorie: "Hôtels" }, rules, categories)?.category_id).toBe("c-hotel");
    expect(resolveCategory({ type: "amenity=pharmacy" }, rules, categories)?.category_id).toBe("c-pharma");
  });

  it("fiche complète : attributs présents seulement, précision selon la géométrie", () => {
    const d = normalizePoi(
      {
        externalId: "node/1",
        geometry: "point",
        lat: 0.5123456789,
        lon: 25.19,
        tags: {
          name: "Pharmacie Shekina",
          amenity: "pharmacy",
          phone: "+243 812 345 678; 0998887777",
          website: "shekina.cd",
          "addr:street": "Avenue Mobutu",
          "addr:housenumber": "12",
          opening_hours: "Mo-Sa 08:00-20:00",
        },
      },
      0,
      opts,
    );
    expect(d).toMatchObject({
      name: "Pharmacie Shekina",
      category_id: "c-pharma",
      latitude: 0.5123457,
      geographic_precision: "exact",
      address: "12 Avenue Mobutu",
      website: "https://shekina.cd/",
      email: null,
      image_url: null,
    });
    expect(d.phones).toEqual(["+243 812345678", "+243 998887777"]);
    expect(d.hours).toHaveLength(6);
    expect(d.issues).toEqual([]);
  });

  it("anomalies : nom générique, disparu, contact bloqué, position absente, identifiant OSM exigé", () => {
    const base = { geometry: "point" as const, lat: 0.5, lon: 25.2 };
    expect(
      normalizePoi({ ...base, tags: { name: "Police", amenity: "pharmacy" } }, 0, opts).issues,
    ).toContain("generic_name");
    expect(normalizePoi({ ...base, tags: { name: "Ex. Hôtel Zaïre" } }, 0, opts).issues).toContain(
      "inactive",
    );
    expect(
      normalizePoi({ ...base, tags: { name: "Mangi", email: "shaloomdianadengamo@gmail.com" } }, 0, opts)
        .issues,
    ).toContain("blocked_contact");
    expect(normalizePoi({ geometry: "none", tags: { name: "Sans position" } }, 0, opts).issues).toContain(
      "missing_coordinates",
    );
    expect(
      normalizePoi({ ...base, lat: 0, lon: 0, tags: { name: "Null Island" } }, 0, opts).issues,
    ).toContain("invalid_coordinates");
    expect(normalizePoi({ ...base, tags: { name: "A" } }, 0, opts).issues).toContain("missing_name");
    expect(normalizePoi({ ...base, tags: { name: "www.spam.example" } }, 0, opts).issues).toContain(
      "suspicious_name",
    );
    const osm = normalizePoi({ ...base, externalId: "42", tags: { name: "Hôtel" } }, 0, {
      ...opts,
      requireOsmId: true,
    });
    expect(osm.issues).toContain("missing_source_id");
    expect(osm.external_id).toBeNull();
  });
});

describe("horaires OSM", () => {
  it("plages, listes, fermetures et 24/7", () => {
    expect(parseOpeningHours("24/7")).toHaveLength(7);
    expect(parseOpeningHours("Mo,We 08:00-12:00,14:00-18:00; Su off")).toEqual([
      { day: 1, opens: "08:00", closes: "12:00" },
      { day: 3, opens: "08:00", closes: "12:00" },
      { day: 1, opens: "14:00", closes: "18:00" },
      { day: 3, opens: "14:00", closes: "18:00" },
    ]);
    expect(parseOpeningHours("Sa-Mo 22:00-02:00")?.map((s) => s.day)).toEqual([1, 6, 7]);
  });
  it("formes non gérées : null (valeur brute conservée, rien d'inventé)", () => {
    expect(parseOpeningHours("Mo-Fr sunrise-sunset")).toBeNull();
    expect(parseOpeningHours("PH off; Mo-Fr 08:00-17:00")).toBeNull();
    expect(parseOpeningHours("Jan-Mar Mo 08:00-12:00")).toBeNull();
    expect(parseOpeningHours("")).toBeNull();
  });
});

describe("requête Overpass", () => {
  const bbox = { min_lat: -0.39, min_lng: 23.57, max_lat: 1.11, max_lng: 25.04 };
  it("filtres par étiquette (conditions comprises), emprise et sortie centrée", () => {
    const q = buildOverpassQuery(bbox, rules);
    expect(q).toContain('nwr["name"]["amenity"="pharmacy"](-0.39,23.57,1.11,25.04);');
    expect(q).toContain('["religion"="muslim"]');
    expect(q).toContain("out center tags;");
    expect(q.startsWith("[out:json][timeout:120];")).toBe(true);
  });
  it("refuse une emprise trop grande ou aucune catégorie", () => {
    expect(() => buildOverpassQuery({ ...bbox, max_lng: 40 }, rules)).toThrow(/trop étendue/);
    expect(() => buildOverpassQuery(bbox, [])).toThrow(/Aucune catégorie/);
  });
});

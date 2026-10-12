// Génère le SQL des limites administratives de la Tshopo à partir du Référentiel Géographique
// Commun de RDC (OCHA, 2019), diffusé par geoBoundaries (gbOpen COD ADM2), licence CC BY 3.0 IGO.
//
//   node scripts/boundaries-import.mjs <geoBoundaries-COD-ADM2_simplified.geojson> <dossier-sortie>
//
// Écrit un fichier SQL par unité (requêtes de taille raisonnable). Contours simplifiés
// (Douglas-Peucker, tolérance ~450 m) et arrondis à 4 décimales (~11 m) : suffisant pour rattacher
// un lieu à son territoire (plus de 100 km de large). Aucune limite n'est inventée.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const UNITS = {
  Kisangani: "kisangani",
  Bafwasende: "bafwasende",
  Banalia: "banalia",
  Basoko: "basoko",
  Isangi: "isangi",
  Opala: "opala",
  Ubundu: "ubundu",
  Yahuma: "yahuma",
};
const TOLERANCE = 0.004; // degrés (~450 m à l'équateur)
const SOURCE = "Référentiel Géographique Commun RDC (OCHA, 2019) via geoBoundaries gbOpen COD ADM2";
const LICENSE = "CC BY 3.0 IGO";

function perpendicular([x, y], [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  return Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / Math.hypot(dx, dy);
}

function simplify(points, tol) {
  if (points.length < 4) return points;
  let max = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicular(points[i], points[0], points[points.length - 1]);
    if (d > max) {
      max = d;
      index = i;
    }
  }
  if (max <= tol) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, index + 1), tol);
  const right = simplify(points.slice(index), tol);
  return [...left.slice(0, -1), ...right];
}

const round = ([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))];

function simplifyRing(ring) {
  const s = simplify(ring, TOLERANCE).map(round);
  if (s.length < 4) return null; // anneau dégénéré après simplification : ignoré
  const [first, last] = [s[0], s[s.length - 1]];
  if (first[0] !== last[0] || first[1] !== last[1]) s.push(first);
  return s;
}

function toMultiPolygon(geometry) {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return {
    type: "MultiPolygon",
    coordinates: polys
      .map((rings) => rings.map(simplifyRing).filter(Boolean))
      .filter((rings) => rings.length > 0),
  };
}

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir)
  throw new Error("Usage : node scripts/boundaries-import.mjs <geojson> <dossier-sortie>");
const geo = JSON.parse(await readFile(file, "utf8"));

for (const [name, slug] of Object.entries(UNITS)) {
  const matches = geo.features.filter((f) => f.properties.shapeName === name);
  if (matches.length !== 1) throw new Error(`${name} : ${matches.length} correspondance(s), 1 attendue.`);
  const type = slug === "kisangani" ? "ville" : "territoire";
  const geojson = JSON.stringify(toMultiPolygon(matches[0].geometry));
  const sql = `-- ${name} — ${SOURCE}, licence ${LICENSE}.
insert into public.geographic_boundaries (unit_id, boundary, source, license, verified_at)
select u.id,
  gis.st_multi(gis.st_collectionextract(gis.st_makevalid(gis.st_setsrid(gis.st_geomfromgeojson($geo$${geojson}$geo$), 4326)), 3))::gis.geography,
  '${SOURCE}', '${LICENSE}', now()
from public.geographic_units u
where u.slug = '${slug}' and u.type_key = '${type}'
on conflict (unit_id) do update set boundary = excluded.boundary, source = excluded.source,
  license = excluded.license, verified_at = excluded.verified_at;
`;
  const path = join(outDir, `limite-${slug}.sql`);
  await writeFile(path, sql, "utf8");
  console.log(`${name.padEnd(12)} ${(sql.length / 1024).toFixed(1)} Ko → ${path}`);
}

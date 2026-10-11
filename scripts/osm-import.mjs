// Génère le SQL d'import des lieux nommés d'OpenStreetMap pour Kisangani.
//
//   node scripts/osm-import.mjs > osm-import.sql             (interroge l'API Overpass)
//   node scripts/osm-import.mjs --input osm.json > osm.sql   (réutilise une réponse enregistrée)
// Le SQL produit (une seule requête) s'exécute avec un rôle de service (éditeur SQL Supabase).
//
// Règles (CLAUDE.md) : aucune donnée inventée. Seuls les champs présents dans OSM sont repris ;
// les lieux restent « non vérifiés », rattachés à la ville (pas de limites de communes en base),
// avec leur provenance et la licence ODbL dans place_external_refs. Réimport idempotent.
import { readFile } from "node:fs/promises";

const BBOX = "0.44,25.10,0.62,25.32"; // agglomération de Kisangani (sud, ouest, nord, est)
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "BoyomaConnect/0.1 (+https://boyoma-connect.vercel.app)";
const LICENSE = "ODbL-1.0";
const ATTRIBUTION = "© Contributeurs OpenStreetMap";

const QUERY = `[out:json][timeout:90];
(
${["amenity", "shop", "tourism", "healthcare", "office", "leisure", "historic"]
  .map((k) => `  nwr["name"]["${k}"](${BBOX});`)
  .join("\n")}
  nwr["name"]["aeroway"="aerodrome"](${BBOX});
  nwr["name"]["railway"="station"](${BBOX});
);
out center tags;`;

/** Étiquette OSM → slug de catégorie Boyoma. Absent = lieu ignoré (catégorie incertaine). */
const MAP = {
  amenity: {
    school: "ecoles",
    kindergarten: "ecoles",
    college: "universites",
    university: "universites",
    library: "bibliotheques",
    fuel: "stations-service",
    restaurant: "restaurants",
    fast_food: "fast-foods",
    cafe: "cafes",
    ice_cream: "glaciers",
    bar: "bars",
    pub: "bars",
    nightclub: "divertissement",
    bank: "banques",
    atm: "distributeurs",
    money_transfer: "agences-de-transfert",
    bureau_de_change: "agences-de-transfert",
    hospital: "hopitaux",
    clinic: "cliniques",
    doctors: "cabinets-medicaux",
    dentist: "cabinets-medicaux",
    pharmacy: "pharmacies",
    police: "commissariats",
    townhall: "mairies",
    courthouse: "tribunaux",
    ferry_terminal: "transport-fluvial",
    bus_station: "agences-de-transport",
    taxi: "stations-de-taxis",
    parking: "parkings",
    marketplace: "marches",
    cinema: "spectacles-cinemas",
    theatre: "spectacles-cinemas",
    arts_centre: "espaces-culturels",
    community_centre: "centres-communautaires",
    social_facility: "centres-communautaires",
  },
  healthcare: {
    hospital: "hopitaux",
    clinic: "cliniques",
    centre: "centres-de-sante",
    doctor: "cabinets-medicaux",
    laboratory: "laboratoires",
    pharmacy: "pharmacies",
    birthing_centre: "maternites",
  },
  shop: {
    supermarket: "supermarches",
    convenience: "boutiques",
    general: "boutiques",
    alcohol: "boutiques",
    beverages: "boutiques",
    mobile_phone: "electronique",
    electronics: "electronique",
    computer: "electronique",
    hairdresser: "coiffeurs",
    beauty: "coiffeurs",
    bakery: "boulangeries",
    pastry: "patisseries",
    clothes: "vetements",
    tailor: "couturiers",
    hardware: "quincailleries",
    doityourself: "quincailleries",
    books: "librairies-papeteries",
    stationery: "librairies-papeteries",
    car_repair: "garages",
    motorcycle: "ateliers-motos",
    photo: "photographes",
    copyshop: "imprimeurs",
  },
  tourism: {
    hotel: "hotels",
    motel: "hotels",
    guest_house: "maisons-d-hotes",
    hostel: "auberges",
    apartment: "residences",
    attraction: "attractions",
    zoo: "attractions",
    museum: "espaces-culturels",
    gallery: "espaces-culturels",
    viewpoint: "sites-naturels",
    artwork: "monuments",
  },
  office: {
    government: "bureaux-administratifs",
    tax_advisor: "services-fiscaux",
  },
  leisure: {
    park: "parcs-de-loisirs",
    playground: "parcs-de-loisirs",
    sports_centre: "terrains-de-sport",
    stadium: "terrains-de-sport",
    pitch: "terrains-de-sport",
    fitness_centre: "salles-de-sport",
    swimming_pool: "piscines",
  },
  historic: {
    monument: "monuments",
    memorial: "monuments",
    building: "lieux-historiques",
    ruins: "lieux-historiques",
  },
  aeroway: { aerodrome: "automobile-transport" },
  railway: { station: "automobile-transport" },
};

/**
 * Corrections relues à la main, quand l'étiquette OSM contredit le nom du lieu.
 * null = lieu exclu (étiquettes contradictoires, catégorie impossible à déterminer).
 */
const OVERRIDES = {
  "node/1931964974": null, // « FlyCongo » : amenity=Voyage + historic=monument
  "way/196168018": null, // « La cruche » : amenity=bank sans autre indice
  "way/196170687": "imprimeurs", // « Imprimerie RENAPI » étiqueté bibliothèque
  "way/953384828": "centres-de-formation", // « Ecole de couture » étiquetée université
  "way/953384829": "centres-de-formation", // association gestionnaire de cette école
};

function categoryFor(tags) {
  if (tags.amenity === "place_of_worship") {
    if (tags.religion === "muslim") return "mosquees";
    if (tags.religion === "christian") return "eglises";
    return null;
  }
  for (const key of Object.keys(MAP)) {
    const slug = tags[key] && MAP[key][tags[key]];
    if (slug) return slug;
  }
  return null;
}

const sql = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const clean = (v, max) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s && s.length <= max ? s : null;
};

function contacts(tags) {
  const out = [];
  const seen = new Set();
  const add = (kind, value) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push({ kind, value });
  };
  for (const raw of [tags.phone, tags["contact:phone"]].filter(Boolean).flatMap((p) => p.split(";"))) {
    const phone = raw
      .replace(/[^+0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (/^\+?[0-9 ]{6,20}$/.test(phone)) add("phone", phone);
  }
  for (const raw of [tags.website, tags["contact:website"]].filter(Boolean)) {
    const url = raw.trim();
    if (/^https?:\/\/\S{3,290}$/i.test(url)) add("website", url);
  }
  for (const raw of [tags.email, tags["contact:email"]].filter(Boolean)) {
    const email = raw.trim();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 300) add("email", email);
  }
  return out;
}

function isInactive(tags) {
  return (
    Object.keys(tags).some((k) => /^(disused|abandoned|demolished|was|razed):/.test(k)) ||
    /^ex[.\s]/i.test(tags.name ?? "") // « ex. Maison X » : ancien nom, lieu disparu ou renommé
  );
}

/** Clé de dédoublonnage : sans accents, mots vides ni pluriels (« Place des Martyrs » = « Place de Martyr »). */
function dedupeKey(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !["de", "des", "du", "la", "le", "les", "l", "d"].includes(w))
    .map((w) => (w.length > 3 ? w.replace(/s$/, "") : w))
    .join("");
}

function distanceM(a, b) {
  const r = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

async function loadElements() {
  const i = process.argv.indexOf("--input");
  if (i > 0) return JSON.parse(await readFile(process.argv[i + 1], "utf8")).elements;
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    body: new URLSearchParams({ data: QUERY }),
  });
  if (!res.ok) throw new Error(`Overpass : HTTP ${res.status}`);
  return (await res.json()).elements;
}

// Les points (position exacte) passent avant les emprises (centre approximatif) pour le dédoublonnage.
const elements = (await loadElements()).sort(
  (a, b) => (a.type === "node" ? 0 : 1) - (b.type === "node" ? 0 : 1),
);
const rows = [];
const kept = [];
const skipped = { categorie: 0, nom: 0, coordonnees: 0, inactif: 0, doublon: 0 };

for (const el of elements) {
  const tags = el.tags ?? {};
  const name = clean(tags.name, 140);
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const osmRef = `${el.type}/${el.id}`;
  const category = osmRef in OVERRIDES ? OVERRIDES[osmRef] : categoryFor(tags);
  if (isInactive(tags)) {
    skipped.inactif++;
    continue;
  }
  if (!name || name.length < 3) {
    skipped.nom++;
    continue;
  }
  if (typeof lat !== "number" || typeof lon !== "number") {
    skipped.coordonnees++;
    continue;
  }
  if (!category) {
    skipped.categorie++;
    continue;
  }
  const key = dedupeKey(name);
  if (kept.some((k) => k.key === key && distanceM(k, { lat, lon }) < 500)) {
    skipped.doublon++;
    continue;
  }
  kept.push({ key, lat, lon });
  const ref = osmRef;
  const street = clean(tags["addr:street"], 250);
  const address = street ? clean([tags["addr:housenumber"], street].filter(Boolean).join(" "), 300) : null;
  const precision = el.type === "node" ? "exact" : "approximate"; // way/relation : centre de l'emprise
  const contactRows = contacts(tags);
  rows.push({
    r: ref,
    n: name,
    o: clean(tags.official_name, 200),
    d: clean(tags.description, 280),
    c: category,
    a: address,
    y: Number(lat.toFixed(7)),
    x: Number(lon.toFixed(7)),
    p: precision,
    k: contactRows.length ? contactRows : undefined,
  });
}

const json = JSON.stringify(rows);
if (json.includes("$osm$")) throw new Error("Délimiteur $osm$ présent dans les données");

// Requête unique et ensembliste ; les identifiants sont générés avant l'insertion pour relier
// lieux, provenance et contacts. Les lieux déjà importés (même ref OSM) sont ignorés.
console.log(`-- Import OpenStreetMap (Kisangani, bbox ${BBOX}) — ${new Date().toISOString()}
-- ${rows.length} lieux ; ignorés : ${JSON.stringify(skipped)}
-- Données ${ATTRIBUTION}, licence ${LICENSE} (https://www.openstreetmap.org/copyright)
with raw as (
  select d.*, row_number() over (partition by public.slugify(d.n) order by d.r) as homonym
  from jsonb_to_recordset($osm$${json}$osm$::jsonb)
    as d(r text, n text, o text, d text, c text, a text, y float8, x float8, p text, k jsonb)
  where not exists (select 1 from public.place_external_refs e where e.source = 'osm' and e.external_id = d.r)
), src as materialized (
  -- Le trigger de slug ne voit pas les lignes de la même requête : suffixe explicite pour les homonymes.
  select gen_random_uuid() as id,
    public.unique_place_slug(case when homonym = 1 then n else n || ' ' || homonym end) as slug, raw.*
  from raw
), ins as (
  insert into public.places (id, slug, name, official_name, short_description, primary_category_id,
    administrative_unit_id, address_text, latitude, longitude, geographic_precision, coordinates_source,
    verification_status, publication_status, activity_status)
  select s.id, s.slug, s.n, s.o, s.d, cat.id,
    (select id from public.geographic_units where slug = 'kisangani' and type_key = 'ville'),
    s.a, s.y, s.x, s.p::public.geographic_precision, 'imported', 'unverified', 'published', 'unknown'
  from src s join public.categories cat on cat.slug = s.c
  returning id
), refs as (
  insert into public.place_external_refs (source, external_id, place_id, license, attribution, source_url)
  select 'osm', s.r, s.id, '${LICENSE}', ${sql(ATTRIBUTION)}, 'https://www.openstreetmap.org/' || s.r
  from src s join ins on ins.id = s.id
  returning place_id
), contacts as (
  insert into public.place_contacts (place_id, kind, value, is_primary, sort_order)
  select s.id, (c.value ->> 'kind')::public.contact_kind, c.value ->> 'value', c.ordinality = 1, c.ordinality - 1
  from src s join ins on ins.id = s.id
  cross join lateral jsonb_array_elements(coalesce(s.k, '[]'::jsonb)) with ordinality as c(value, ordinality)
  returning place_id
)
select public.write_audit_log('places.imported', 'place', null, jsonb_build_object(
  'source', 'osm', 'license', '${LICENSE}', 'bbox', '${BBOX}',
  'places', (select count(*) from ins), 'refs', (select count(*) from refs), 'contacts', (select count(*) from contacts)
)), (select count(*) from ins) as places_importes, (select count(*) from contacts) as contacts_importes;`);

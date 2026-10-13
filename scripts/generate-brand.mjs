// Génère toutes les déclinaisons du logo Boyoma Connect à partir de la source maîtresse
// (assets/brand/logo-source.webp, 1024 × 1024) : favicon, icônes PWA, pictogramme d'en-tête,
// image de partage Open Graph / Twitter par défaut. Usage : node scripts/generate-brand.mjs [source]
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const root = new URL("..", import.meta.url);
const path = (p) => new URL(p, root).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const source = process.argv[2] ?? path("assets/brand/logo-source.webp");

const BG = { r: 1, g: 13, b: 43 }; // #010d2b, fond du logo
const master = sharp(source).resize(1024, 1024, { fit: "cover" });
const masterBuf = await master.png().toBuffer();

// Pictogramme (épingle) : carré centré sur l'emblème, mesuré sur l'original 1254 px → 1024 px.
const k = 1024 / 1254;
const square = (cx, cy, size) => ({
  left: Math.round((cx - size / 2) * k),
  top: Math.round((cy - size / 2) * k),
  width: Math.round(size * k),
  height: Math.round(size * k),
});
const crop = square(627, 488, 640);
const emblem = await sharp(masterBuf).extract(crop).png().toBuffer();

// PNG en palette (dégradés tramés) : 3 à 5 fois plus léger, sans perte visible à ces tailles.
const png = (buf, size) =>
  sharp(buf)
    .resize(size, size)
    .png({ palette: true, quality: 92, effort: 10, dither: 1, compressionLevel: 9 })
    .toBuffer();
// Fond sombre sans texte : bande supérieure du logo (dégradé seul), étirée et floutée.
const darkBg = async (w, h) =>
  sharp(masterBuf)
    .extract({ left: 0, top: 0, width: 1024, height: 140 })
    .resize(w, h, { fit: "fill" })
    .blur(25)
    .png()
    .toBuffer();
// Masque de fondu (bords transparents) pour poser une image nette sur ce fond sans couture.
const feather = (w, h, edge) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><radialGradient id="m" r="${0.5 + edge}"><stop offset="${1 - edge * 2.4}" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#m)"/></svg>`,
  );
// Version « maskable » : emblème à 72 % (zone sûre de 80 %) sur fond sombre, bords fondus.
const maskableArt = await (async () => {
  const inner = 368;
  const art = await sharp(emblem)
    .resize(inner, inner)
    .composite([{ input: feather(inner, inner, 0.08), blend: "dest-in" }])
    .png()
    .toBuffer();
  return sharp(await darkBg(512, 512))
    .composite([{ input: art, gravity: "center" }])
    .png()
    .toBuffer();
})();

await mkdir(path("public/brand"), { recursive: true });
await mkdir(path("public/icons"), { recursive: true });

// En-tête et pages : pictogramme léger (WebP) + logo complet.
await sharp(emblem).resize(192, 192).webp({ quality: 88 }).toFile(path("public/brand/emblem-192.webp"));
await sharp(masterBuf).resize(640, 640).webp({ quality: 84 }).toFile(path("public/brand/logo-640.webp"));

// Favicon .ico (PNG 16, 32, 48 intégrés) + icônes de l'App Router.
const icoSizes = [16, 32, 48];
const icoImages = await Promise.all(icoSizes.map((s) => png(emblem, s)));
const header = Buffer.alloc(6 + 16 * icoImages.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoImages.length, 4);
let offset = header.length;
icoImages.forEach((img, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(icoSizes[i] % 256, e);
  header.writeUInt8(icoSizes[i] % 256, e + 1);
  header.writeUInt8(0, e + 2);
  header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(img.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += img.length;
});
await writeFile(path("src/app/favicon.ico"), Buffer.concat([header, ...icoImages]));
await writeFile(path("src/app/icon.png"), await png(emblem, 192));
await writeFile(path("src/app/apple-icon.png"), await png(emblem, 180));

// PWA (manifest, service worker).
await writeFile(path("public/icons/icon-192.png"), await png(emblem, 192));
await writeFile(path("public/icons/icon-512.png"), await png(emblem, 512));
await writeFile(path("public/icons/apple-touch-icon.png"), await png(emblem, 180));
await writeFile(path("public/icons/maskable-512.png"), await png(maskableArt, 512));

// Image de partage par défaut (pages sans image propre) : logo complet sur fond assorti.
// Fond : le logo lui-même étiré et flouté (couleurs identiques), logo net fondu sur les bords.
const og = async (file) => {
  const bg = await darkBg(1200, 630);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="630" height="630"><defs><linearGradient id="m"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".14" stop-color="#fff"/><stop offset=".86" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect width="630" height="630" fill="url(#m)"/></svg>`,
  );
  const logo = await sharp(masterBuf)
    .resize(630, 630)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  await sharp(bg)
    .composite([{ input: logo, gravity: "center" }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(file);
};
await og(path("src/app/opengraph-image.jpg"));
await og(path("src/app/twitter-image.jpg"));
const alt = "Boyoma Connect — Toute la Tshopo, à portée de main.";
await writeFile(path("src/app/opengraph-image.alt.txt"), alt);
await writeFile(path("src/app/twitter-image.alt.txt"), alt);

console.log("Déclinaisons du logo générées.");

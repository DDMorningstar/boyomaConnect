// Génère les icônes PWA PNG à partir de public/icons/icon.svg (sharp).
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const svg = await readFile(new URL("../public/icons/icon.svg", import.meta.url));
const maskable = await readFile(new URL("../public/icons/maskable.svg", import.meta.url));
const out = (n) => new URL(`../public/icons/${n}`, import.meta.url).pathname;

await sharp(svg).resize(192, 192).png().toFile(out("icon-192.png"));
await sharp(svg).resize(512, 512).png().toFile(out("icon-512.png"));
await sharp(svg).resize(180, 180).png().toFile(out("apple-touch-icon.png"));
await sharp(maskable).resize(512, 512).png().toFile(out("maskable-512.png"));
console.log("Icônes générées.");

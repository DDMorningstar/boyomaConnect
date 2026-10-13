// Captures réelles de Boyoma Connect (production) pour les vidéos. Aucune donnée inventée.
//   node video/scripts/capture.mjs
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../public/screens/", import.meta.url));
const B = "https://boyoma-connect.vercel.app";
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  locale: "fr-FR",
  colorScheme: "dark",
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const T = { timeout: 240000 };

async function shot(path, name, { ready, full = false, scroll = 0, wait = 2500 } = {}) {
  await page.goto(B + path, { waitUntil: "domcontentloaded", ...T });
  if (ready) await page.waitForSelector(ready, T);
  await page.waitForTimeout(wait);
  if (scroll) {
    await page.mouse.wheel(0, scroll);
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: OUT + name, fullPage: full });
  console.log("ok", name);
}

await shot("/?zone=kisangani", "home.png", { ready: "nav[aria-label=Zone] a[aria-current=true]" });
await shot("/?zone=kisangani", "home-full.png", { ready: "nav[aria-label=Zone] a[aria-current=true]", full: true });
await shot("/recherche?q=hotel&zone=kisangani", "search.png", { ready: "a[href^='/lieux/']" });
await shot("/lieux/rex-transit", "place.png", { ready: "#actions-principales", wait: 4000 });
await shot("/lieux/rex-transit", "place-full.png", { ready: "#actions-principales", full: true, wait: 4000 });
await shot("/lieux/rex-transit", "place-sticky.png", { ready: "#actions-principales", scroll: 700, wait: 3000 });
await shot("/zones/tshopo", "zone.png", { ready: "h1" });
await shot("/carte?zone=tshopo", "map-tshopo.png", { ready: "canvas", wait: 15000 });
await shot("/carte?zone=kisangani", "map-kisangani.png", { ready: "canvas", wait: 15000 });
await browser.close();

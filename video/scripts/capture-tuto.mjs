// Captures réelles (production) pour le tutoriel « inscrire son établissement ».
// Pages publiques uniquement (aucune connexion) : connexion, onglet « Créer un compte », ajouter un lieu.
//   node video/scripts/capture-tuto.mjs
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

async function open(path, ready) {
  await page.goto(B + path, { waitUntil: "domcontentloaded", ...T });
  await page.waitForSelector(ready, T);
  await page.waitForTimeout(2500);
}

await open("/connexion", "text=Créer un compte");
await page.screenshot({ path: OUT + "tuto-connexion.png" });
console.log("ok tuto-connexion.png");
// Attendre l'hydratation React avant de cliquer sur l'onglet.
await page.waitForFunction(
  () => [...document.querySelectorAll("[role=tab]")].some((b) => Object.keys(b).some((k) => k.startsWith("__react"))),
  null,
  T,
);
await page.getByRole("tab", { name: "Créer un compte" }).click();
await page.waitForSelector("#display_name", T);
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + "tuto-inscription.png" });
console.log("ok tuto-inscription.png");

await open("/ajouter-un-lieu", "text=Créer ma fiche");
await page.screenshot({ path: OUT + "tuto-ajouter.png" });
console.log("ok tuto-ajouter.png");

console.log("google:", await page.goto(B + "/connexion").then(() => page.locator("button:has-text('Google')").first().isDisabled().catch(() => "?")));
await browser.close();

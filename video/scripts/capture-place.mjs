// Fiche Rex Transit : capture pleine page sans éléments fixes, coupée avant « Avis » (pas de contacts
// personnels dans la vidéo), et capture avec la barre d'actions fixe visible.
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../public/screens/", import.meta.url));
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: "fr-FR", colorScheme: "dark", isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const T = { timeout: 240000 };
await page.goto("https://boyoma-connect.vercel.app/lieux/rex-transit", { waitUntil: "domcontentloaded", ...T });
await page.waitForSelector("#actions-principales", T);
await page.waitForTimeout(5000);
// Un rechargement tardif (service worker) peut survenir : on réessaie jusqu'à stabilité.
async function retry(fn) {
  for (let i = 0; i < 5; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!String(e).includes("context was destroyed")) throw e;
      await page.waitForSelector("#actions-principales", T);
      await page.waitForTimeout(3000);
    }
  }
  throw new Error("Page instable");
}

// 1. Barre d'actions fixe : défilement réel puis attente de son apparition.
// Juste assez pour sortir les actions principales de l'écran (la barre apparaît) sans atteindre
// la section Contacts.
await retry(() =>
  page.evaluate(() => {
    const a = document.getElementById("actions-principales");
    window.scrollTo(0, a.getBoundingClientRect().bottom + window.scrollY + 40);
  }),
);
await retry(() => page.waitForFunction(() => [...document.querySelectorAll("div.fixed")].some((d) => d.textContent?.includes("Appeler") && d.getAttribute("aria-hidden") === "false"), null, { timeout: 15000 }));
await page.waitForTimeout(800);
const contactsVisible = await page.evaluate(() => {
  const h = [...document.querySelectorAll("h2")].find((e) => e.textContent?.trim() === "Contacts");
  return h ? h.getBoundingClientRect().top < window.innerHeight : false;
});
if (contactsVisible) throw new Error("Contacts visibles : capture refusée (données personnelles).");
await page.screenshot({ path: OUT + "place-sticky.png" });
console.log("ok place-sticky.png");

// 2. Pleine page propre, coupée avant la section « Avis ».
await retry(() => page.evaluate(() => window.scrollTo(0, 0)));
await retry(() => page.addStyleTag({ content: 'body > header, body header:not(main header), nav[aria-label="Navigation principale"], div.fixed { display: none !important; }' }));
await page.waitForTimeout(800);
const cut = await retry(() => page.evaluate(() => {
  const h = [...document.querySelectorAll("h2")].find((e) => e.textContent?.trim() === "Avis");
  return h ? Math.floor(h.getBoundingClientRect().top + window.scrollY - 24) : 2000;
}));
await page.screenshot({ path: OUT + "place-full.png", fullPage: true, clip: { x: 0, y: 0, width: 390, height: cut } });
console.log("ok place-full.png", cut);
await browser.close();

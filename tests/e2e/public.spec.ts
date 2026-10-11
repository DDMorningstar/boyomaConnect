import { expect, test } from "@playwright/test";

test("un visiteur ouvre l'accueil et voit la recherche et les catégories", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Kisangani");
  await expect(page.getByRole("combobox")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Catégories" })).toBeVisible();
});

test("une recherche sans résultat affiche un état vide explicite", async ({ page }) => {
  await page.goto("/recherche?q=zzqxwvnonexistant");
  await expect(page.getByText(/Aucun résultat/)).toBeVisible();
});

test("une catégorie existe et une fiche inexistante renvoie 404", async ({ page }) => {
  await page.goto("/categories/pharmacies");
  await expect(page.getByRole("heading", { level: 1, name: "Pharmacies" })).toBeVisible();
  const res = await page.goto("/lieux/ce-lieu-n-existe-pas");
  expect(res?.status()).toBe(404);
});

test("les six communes de Kisangani sont listées", async ({ page }) => {
  await page.goto("/explorer");
  for (const c of ["Makiso", "Mangobo", "Tshopo", "Kabondo", "Kisangani", "Lubunga"]) {
    await expect(page.getByRole("link", { name: new RegExp(`^${c}`) }).first()).toBeVisible();
  }
});

test("le manifeste PWA est servi", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).short_name).toBe("Boyoma");
});

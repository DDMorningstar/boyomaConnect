import { describe, expect, it } from "vitest";
import { catalogPrice, inquiryMessage, visibleCatalog } from "@/features/catalog/format";

const base = { price: null, currency: null, price_unit: null } as const;

describe("prix du catalogue", () => {
  it("prix fixe, « à partir de », unité", () => {
    expect(catalogPrice({ ...base, price: 15000, currency: "CDF", price_type: "fixed" })).toMatch(
      /^15\s?000\sFC$/,
    );
    expect(
      catalogPrice({ ...base, price: 25, currency: "USD", price_type: "from", price_unit: "nuit" }),
    ).toMatch(/^À partir de 25\s?\$ \/ nuit$/);
  });
  it("sur devis, gratuit, ou rien quand le prix n'est pas indiqué", () => {
    expect(catalogPrice({ ...base, price_type: "on_quote" })).toBe("Sur devis");
    expect(catalogPrice({ ...base, price_type: "free" })).toBe("Gratuit");
    expect(catalogPrice({ ...base, price_type: "fixed" })).toBeNull();
  });
});

describe("présentation et contact", () => {
  it("articles publiés seulement, mis en avant d'abord puis ordre choisi", () => {
    const items = [
      { id: "a", is_published: true, is_featured: false, sort_order: 0 },
      { id: "b", is_published: false, is_featured: true, sort_order: 1 },
      { id: "c", is_published: true, is_featured: true, sort_order: 2 },
      { id: "d", is_published: true, is_featured: false, sort_order: 3 },
    ];
    expect(visibleCatalog(items).map((i) => i.id)).toEqual(["c", "a", "d"]);
  });
  it("message pré-rempli citant l'article, le prix et le lien", () => {
    expect(
      inquiryMessage("Rex Transit", { name: "Chambre", priceLabel: "15 000 FC / nuit" }, "https://x/y"),
    ).toBe(
      "Bonjour Rex Transit, je suis intéressé(e) par « Chambre » (15 000 FC / nuit), vu sur Boyoma Connect : https://x/y",
    );
    expect(inquiryMessage("A", { name: "B", priceLabel: null }, "u")).toBe(
      "Bonjour A, je suis intéressé(e) par « B », vu sur Boyoma Connect : u",
    );
  });
});

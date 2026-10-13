import { describe, expect, it } from "vitest";
import { completeness } from "@/features/owner/completeness";
import type { ManagedPlace } from "@/features/owner/queries";

const base: ManagedPlace = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "fictif-test",
  name: "[FICTIF] Boutique test",
  publication_status: "published",
  short_description: null,
  full_description: null,
  address_text: null,
  landmark_description: null,
  directions: null,
  price_range: null,
  currency: null,
  payment_methods: [],
  logo_path: null,
  primary_category: null,
  place_contacts: [],
  place_media: [],
  catalog_items: [],
  verification_status: "unverified",
  last_verified_at: null,
  hours_verified_at: null,
  place_hours: [],
  place_special_hours: [],
  my_role: "owner",
};

describe("completeness", () => {
  it("vaut 0 pour une fiche vide et liste toutes les étapes", () => {
    const { score, steps } = completeness(base);
    expect(score).toBe(0);
    expect(steps).toHaveLength(8);
    expect(steps.reduce((s, st) => s + st.weight, 0)).toBe(100);
    expect(steps.every((s) => s.href.startsWith(`/espace-pro/lieux/${base.id}/`))).toBe(true);
  });

  it("atteint 100 pour une fiche complète", () => {
    const item = { is_published: true } as ManagedPlace["catalog_items"][number];
    const { score } = completeness({
      ...base,
      logo_path: "places/x/logo.webp",
      short_description: "Présentation",
      landmark_description: "Repère",
      place_contacts: [
        { id: "1", kind: "phone", value: "x" },
        { id: "2", kind: "whatsapp", value: "x" },
      ],
      place_media: [
        { id: "a", storage_path: "a", kind: "gallery", moderation_status: "approved", sort_order: 0 },
        { id: "b", storage_path: "b", kind: "cover", moderation_status: "approved", sort_order: 1 },
      ],
      place_hours: [{ id: "h", day_of_week: 1, opens_at: "08:00", closes_at: "17:00", is_closed: false }],
      catalog_items: [item, item, item],
    });
    expect(score).toBe(100);
  });

  it("ne compte pas les articles masqués ni le logo comme photo", () => {
    const hidden = { is_published: false } as ManagedPlace["catalog_items"][number];
    const { steps } = completeness({
      ...base,
      place_media: [
        { id: "l", storage_path: "l", kind: "logo", moderation_status: "approved", sort_order: 0 },
      ],
      catalog_items: [hidden, hidden, hidden],
    });
    expect(steps.find((s) => s.key === "photos")?.done).toBe(false);
    expect(steps.find((s) => s.key === "catalog")?.done).toBe(false);
  });
});

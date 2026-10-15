import { describe, expect, it } from "vitest";
import { BADGES, badgeProgress, total } from "@/features/community/badges";

const zero = { reviews: 0, photos: 0, reports: 0, places: 0 };

describe("badges des contributeurs", () => {
  it("aucun badge sans contribution validée", () => {
    expect(badgeProgress(zero).every((b) => !b.earned && b.value === 0)).toBe(true);
  });

  it("premier avis et progression du critique local", () => {
    const p = badgeProgress({ ...zero, reviews: 3 });
    expect(p.find((b) => b.def.key === "first-review")?.earned).toBe(true);
    const critic = p.find((b) => b.def.key === "critic")!;
    expect(critic.earned).toBe(false);
    expect(critic.value).toBe(3);
  });

  it("la progression est plafonnée à l'objectif", () => {
    const p = badgeProgress({ ...zero, photos: 42 });
    expect(p.find((b) => b.def.key === "photographer")?.value).toBe(10);
  });

  it("le pilier compte toutes les contributions", () => {
    const c = { reviews: 10, photos: 10, reports: 3, places: 2 };
    expect(total(c)).toBe(25);
    expect(badgeProgress(c).every((b) => b.earned)).toBe(true);
  });

  it("clés uniques", () => {
    expect(new Set(BADGES.map((b) => b.key)).size).toBe(BADGES.length);
  });
});

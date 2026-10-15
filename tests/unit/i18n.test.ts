import { describe, expect, it } from "vitest";
import { LOCALES, MESSAGES, isLocale, translate } from "@/lib/i18n";

describe("langues de l'interface", () => {
  it("chaque langue traduit toutes les clés du français", () => {
    const keys = Object.keys(MESSAGES.fr);
    for (const { code } of LOCALES) {
      expect(Object.keys(MESSAGES[code]).sort()).toEqual([...keys].sort());
      for (const k of keys) expect(MESSAGES[code][k as keyof typeof MESSAGES.fr].trim()).not.toBe("");
    }
  });

  it("refuse une langue inconnue", () => {
    expect(isLocale("ln")).toBe(true);
    expect(isLocale("xx")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it("traduit", () => {
    expect(translate("fr", "action.call")).toBe("Appeler");
    expect(translate("sw", "action.call")).toBe("Piga simu");
  });
});

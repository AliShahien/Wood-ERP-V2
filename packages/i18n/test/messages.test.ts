import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, PERMISSION_CATALOG } from "../../core/src/auth/permissions";
import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { createTranslator, flattenKeys } from "../src/index";

describe("i18n catalogs", () => {
  it("Arabic and English have identical keys", () => {
    expect(flattenKeys(ar).sort()).toEqual(flattenKeys(en).sort());
  });

  it("every permission module and action has a label", () => {
    const t = createTranslator("ar");
    for (const m of Object.keys(PERMISSION_CATALOG)) expect(t(`permissions.modules.${m}`)).not.toContain("permissions.");
    for (const p of ALL_PERMISSIONS) {
      const action = p.split(".")[1]!;
      expect(t(`permissions.actions.${action}`), p).not.toContain("permissions.");
    }
  });

  it("interpolates parameters and falls back to the key", () => {
    const t = createTranslator("en");
    expect(t("common.page", { page: 2, pageCount: 5 })).toBe("Page 2 of 5");
    expect(t("does.not.exist")).toBe("does.not.exist");
  });
});

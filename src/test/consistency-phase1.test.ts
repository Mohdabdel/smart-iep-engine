import { describe, expect, it } from "vitest";
import { normalizeArabicText } from "@/lib/arabic-normalize";

describe("M-1 Arabic normalization", () => {
  it("fixes broken lam-alef ligatures from PDF extraction", () => {
    expect(normalizeArabicText("األعمال")).toBe("الأعمال");
    expect(normalizeArabicText("باإلضافة إلى اآلن")).toBe("بالإضافة إلى الآن");
    expect(normalizeArabicText("بسم هللا")).toBe("بسم الله");
    expect(normalizeArabicText("ﻻ يوجد")).toBe("لا يوجد");
  });
  it("leaves correct text untouched", () => {
    const t = "الأعمال المنزلية بالإضافة إلى الله، والهدف 80% من 10 محاولات";
    expect(normalizeArabicText(t)).toBe(t);
  });
});

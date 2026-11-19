import { describe, it, expect } from "vitest";
import { parseQuantity } from "./quantity";
import { parsePrice } from "./price";
import { classify } from "./classify";
import { unitPrice, sanityOk } from "./unitprice";
import { extractProducts, Word } from "./parse";

// Python tests/test_quantity.py と同じケースでTS移植の同等性を確認
describe("parseQuantity", () => {
  it("grams / kg / ml / L", () => {
    expect(parseQuantity("500g")).toMatchObject({ amount: 500, unit: "g" });
    expect(parseQuantity("1.5kg")).toMatchObject({ amount: 1500, unit: "g" });
    expect(parseQuantity("350ml")).toMatchObject({ amount: 350, unit: "ml" });
    expect(parseQuantity("2L")).toMatchObject({ amount: 2000, unit: "ml" });
  });
  it("counts", () => {
    expect(parseQuantity("10個入")).toMatchObject({ unit: "count", count: 10 });
    expect(parseQuantity("1パック(10個)")).toMatchObject({ unit: "count", count: 10 });
    expect(parseQuantity("1玉")).toMatchObject({ unit: "count", count: 1 });
  });
  it("per-100g, fullwidth, none, size-word", () => {
    expect(parseQuantity("100g当り")?.perUnitAmount).toBe(100);
    expect(parseQuantity("５００ｇ")).toMatchObject({ amount: 500, unit: "g" });
    expect(parseQuantity("新鮮でおいしい")).toBeNull();
    expect(parseQuantity("Lサイズ")).toBeNull();
  });
});

describe("parsePrice", () => {
  it("plain / tax-included / dual / body / per100g", () => {
    expect(parsePrice("198円")).toMatchObject({ amountIncl: 198, taxStatus: "included" });
    expect(parsePrice("税込213円")?.amountIncl).toBe(213);
    const d = parsePrice("98円(税込105.84円)");
    expect(d).toMatchObject({ amountIncl: 105.84, amountExcl: 98, taxStatus: "included" });
    const b = parsePrice("本体価格98円");
    expect(b?.taxStatus).toBe("estimated");
    expect(Math.round((b!.amountIncl) * 100) / 100).toBe(105.84);
    expect(parsePrice("¥1,980")?.amountIncl).toBe(1980);
    expect(parsePrice("100g当り98円")?.isPer100g).toBe(true);
  });
  it("rejects phone / year / noise", () => {
    expect(parsePrice("098-850-1234")).toBeNull();
    expect(parsePrice("2026年11月19日")).toBeNull();
    expect(parsePrice("おすすめ")).toBeNull();
  });
});

describe("classify + unitPrice", () => {
  it("categories", () => {
    expect(classify("キャベツ")).toMatchObject({ id: "vegetables", compareUnit: "100g" });
    expect(classify("たまご10個")).toMatchObject({ id: "eggs", compareUnit: "item" });
    expect(classify("おいしい牛乳")).toMatchObject({ id: "milk", compareUnit: "100ml" });
    expect(classify("こしひかり5kg")).toMatchObject({ id: "rice", compareUnit: "1kg" });
    expect(classify("謎の珍味XYZ").id).toBe("other");
  });
  it("unit prices", () => {
    expect(unitPrice(parsePrice("198円")!, parseQuantity("1000ml"), classify("牛乳"))).toMatchObject({
      value: 19.8, unitLabel: "¥/100ml",
    });
    expect(unitPrice(parsePrice("1980円")!, parseQuantity("5kg"), classify("こしひかり5kg"))).toMatchObject({
      value: 396, unitLabel: "¥/1kg",
    });
    expect(unitPrice(parsePrice("213円")!, parseQuantity("10個入"), classify("たまご"))).toMatchObject({
      value: 21.3, unitLabel: "¥/個",
    });
    expect(unitPrice(parsePrice("300円")!, null, classify("刺身"))).toBeNull();
  });
  it("sanity caps", () => {
    expect(sanityOk({ value: 9800, unitLabel: "¥/100g" }, classify("キャベツ"))).toBe(false);
    expect(sanityOk({ value: 49, unitLabel: "¥/100g" }, classify("キャベツ"))).toBe(true);
  });
});

describe("extractProducts", () => {
  const W = (text: string, x: number, y: number, w: number, h: number, conf = 90): Word =>
    ({ text, x, y, w, h, conf });

  it("groups name near price, drops far words", () => {
    const out = extractProducts([
      W("りんご", 100, 100, 120, 40),
      W("398円", 100, 160, 100, 50, 95),
      W("遠くの文字", 1200, 900, 100, 40),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toContain("りんご");
    expect(out[0].name).not.toContain("遠く");
  });

  it("merges split tax-included tokens, prefers tax-incl", () => {
    const out = extractProducts([
      W("りんご", 100, 100, 120, 40),
      W("98円", 100, 160, 90, 50, 95),
      W("(税込105.84円)", 100, 220, 180, 36, 93),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].price.amountIncl).toBe(105.84);
    expect(out[0].price.taxStatus).toBe("included");
  });

  it("merges split '98' + '円' then parses 98", () => {
    const out = extractProducts([
      W("キャベツ", 40, 50, 160, 40),
      W("98", 40, 120, 90, 50),
      W("円", 135, 120, 50, 50),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].price.amountIncl).toBe(98);
  });

  it("tiny price dropped, huge price low confidence", () => {
    expect(extractProducts([W("ティッシュ", 10, 10, 100, 30), W("3円", 10, 50, 60, 40)])).toHaveLength(0);
    const huge = extractProducts([W("高級肉", 10, 10, 100, 30), W("999999円", 10, 50, 120, 40)]);
    expect(huge[0].confidence).toBeLessThanOrEqual(0.2);
  });
});

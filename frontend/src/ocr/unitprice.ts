// 単価エンジン（analyzer/unitprice.py のTS移植）。容量不明は null。
import { Category } from "./classify";
import { Price } from "./price";
import { Quantity } from "./quantity";

export interface UnitPrice {
  value: number;
  unitLabel: "¥/100g" | "¥/1kg" | "¥/100ml" | "¥/個";
}

const CATEGORY_CAPS: Record<string, number> = {
  vegetables: 3000, fruits: 3000, eggs: 200, milk: 300, rice: 5000, bread: 1500,
};
const LABEL_CAPS: Record<string, number> = {
  "¥/100g": 10000, "¥/100ml": 2000, "¥/個": 5000, "¥/1kg": 20000,
};

const r2 = (v: number) => Math.round(v * 100) / 100;

export function unitPrice(price: Price, qty: Quantity | null, cat: Category): UnitPrice | null {
  if (!qty || !price) return null;

  if (price.isPer100g || (qty.perUnitAmount && qty.unit === "g")) {
    const base = (price.amountIncl / (qty.perUnitAmount || 100)) * 100;
    if (cat.compareUnit === "1kg") return { value: r2(base * 10), unitLabel: "¥/1kg" };
    return { value: r2(base), unitLabel: "¥/100g" };
  }
  if (qty.unit === "count") {
    const n = qty.count || qty.amount;
    if (!n) return null;
    return { value: r2(price.amountIncl / n), unitLabel: "¥/個" };
  }
  if (qty.unit === "g") {
    if (cat.compareUnit === "1kg") return { value: r2((price.amountIncl / qty.amount) * 1000), unitLabel: "¥/1kg" };
    return { value: r2((price.amountIncl / qty.amount) * 100), unitLabel: "¥/100g" };
  }
  if (qty.unit === "ml") {
    return { value: r2((price.amountIncl / qty.amount) * 100), unitLabel: "¥/100ml" };
  }
  return null;
}

export function sanityOk(up: UnitPrice | null, cat: Category): boolean {
  if (!up) return true;
  const cap = CATEGORY_CAPS[cat.id] ?? LABEL_CAPS[up.unitLabel] ?? 99999;
  return up.value <= cap;
}

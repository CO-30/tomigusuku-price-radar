// 内容量・個数パーサ（analyzer/quantity.py のTS移植）。不明は null。
export interface Quantity {
  amount: number;
  unit: "g" | "ml" | "count";
  count: number | null;
  perUnitAmount: number | null;
}

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const COUNT_WORDS = "個|枚|本|パック|袋|束|玉|尾|切|丁|缶|食|房|株|ケ|コ";

const RE_PER = new RegExp(`${NUM}\\s*(kg|g|ml|l)\\s*(?:当り|当たり|あたり)`, "i");
const RE_WEIGHT = new RegExp(`(?:約)?${NUM}\\s*(kg|g)(?![a-z])`, "i");
const RE_VOLUME = new RegExp(`(?:約)?${NUM}\\s*(ml|cc|l)(?![a-z])`, "i");
const RE_COUNT = new RegExp(`${NUM}\\s*(${COUNT_WORDS})\\s*(?:入り?|入)?`);
const RE_INNER = new RegExp(`\\(\\s*${NUM}\\s*(?:${COUNT_WORDS})\\s*(?:入り?|入)?\\s*\\)`);

// 全角→半角正規化
function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/Ｌ/g, "L");
}

export function parseQuantity(text: string): Quantity | null {
  if (!text) return null;
  const t = normalize(text);

  let m = RE_PER.exec(t);
  if (m) {
    const n = parseFloat(m[1]);
    const u = m[2].toLowerCase();
    if (u === "kg") return { amount: n * 1000, unit: "g", count: null, perUnitAmount: n * 1000 };
    if (u === "g") return { amount: n, unit: "g", count: null, perUnitAmount: n };
    if (u === "l") return { amount: n * 1000, unit: "ml", count: null, perUnitAmount: n * 1000 };
    return { amount: n, unit: "ml", count: null, perUnitAmount: n };
  }

  m = RE_WEIGHT.exec(t);
  if (m) {
    const n = parseFloat(m[1]);
    return { amount: m[2].toLowerCase() === "kg" ? n * 1000 : n, unit: "g", count: null, perUnitAmount: null };
  }

  m = RE_VOLUME.exec(t);
  if (m) {
    const n = parseFloat(m[1]);
    return { amount: m[2].toLowerCase() === "l" ? n * 1000 : n, unit: "ml", count: null, perUnitAmount: null };
  }

  m = RE_COUNT.exec(t);
  if (m) {
    const outer = Math.trunc(parseFloat(m[1]));
    const inner = RE_INNER.exec(t);
    const count = inner ? Math.trunc(parseFloat(inner[1])) : outer;
    return { amount: outer, unit: "count", count, perUnitAmount: null };
  }

  return null;
}

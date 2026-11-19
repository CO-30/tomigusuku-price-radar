// 商品分類（analyzer/classify.py のTS移植）。キーワード最長一致。
import cats from "../ocr_categories.json";

export interface Category {
  id: string;
  label: string;
  compareUnit: "100g" | "1kg" | "100ml" | "item";
}

type Spec = { label: string; compare_unit: string; keywords: string[] };
const CATS = cats as Record<string, Spec>;

export function classify(name: string): Category {
  let best: { len: number; id: string } | null = null;
  for (const [cid, spec] of Object.entries(CATS)) {
    for (const kw of spec.keywords) {
      if (kw && name.includes(kw)) {
        if (!best || kw.length > best.len) best = { len: kw.length, id: cid };
      }
    }
  }
  const id = best ? best.id : "other";
  const spec = CATS[id];
  return { id, label: spec.label, compareUnit: spec.compare_unit as Category["compareUnit"] };
}

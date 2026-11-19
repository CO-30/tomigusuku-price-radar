// アプリ内カメラで撮影・解析した商品を保持する（localStorage, 当日分のみ有効）。
import { Product } from "./types";
import { classify } from "./ocr/classify";
import { extractProducts } from "./ocr/parse";
import { unitPrice, sanityOk } from "./ocr/unitprice";
import { Word } from "./ocr/parse";

const KEY = "pr:captures";
const CONFIDENCE_THRESHOLD = 0.55;

export interface Capture {
  date: string; // 撮影日 YYYY-MM-DD
  store: string; // 店舗名（ユーザー入力、任意）
  thumb: string; // dataURL サムネイル
  products: Product[];
}

export function loadCaptures(): Capture[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as Capture[];
  } catch {
    return [];
  }
}

export function saveCaptures(list: Capture[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 容量超過時は黙って無視 */
  }
}

// 当日分の撮影商品だけを取り出してランキングに合流させる
export function todaysCaptureProducts(today: string): Product[] {
  return loadCaptures()
    .filter((c) => c.date === today)
    .flatMap((c) => c.products);
}

// OCR単語列 → 商品配列（サーバ pipeline.py と同じ規則）
export function wordsToProducts(
  words: Word[],
  store: string,
  today: string,
  thumb: string,
): Product[] {
  const raws = extractProducts(words);
  return raws.map((rp, i) => {
    const cat = classify(rp.name);
    const up = unitPrice(rp.price, rp.qty, cat);
    const implausible = !sanityOk(up, cat);
    return {
      id: Date.now() + i,
      store_id: "camera",
      store_name: store || "撮影",
      name: rp.name,
      category: cat.id,
      price_incl: rp.price.amountIncl,
      price_excl: rp.price.amountExcl,
      tax_status: rp.price.taxStatus,
      qty_amount: rp.qty ? rp.qty.amount : null,
      qty_unit: rp.qty ? rp.qty.unit : null,
      qty_count: rp.qty ? rp.qty.count : null,
      unit_price: up ? up.value : null,
      unit_label: up ? up.unitLabel : null,
      confidence: rp.confidence,
      date: today,
      period_start: today,
      period_end: today,
      period_estimated: 1,
      flyer_image: thumb,
      source_url: null,
      captured: true,
      needs_review: rp.confidence < CONFIDENCE_THRESHOLD || implausible,
    } as Product & { captured: boolean; needs_review: boolean };
  });
}

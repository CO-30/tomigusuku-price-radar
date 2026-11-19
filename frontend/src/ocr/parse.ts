// 価格アンカー方式の商品抽出（analyzer/parse.py のTS移植）。
import { Price, parsePrice } from "./price";
import { Quantity, parseQuantity } from "./quantity";

export interface Word {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  conf: number;
}

export interface RawProduct {
  name: string;
  price: Price;
  qty: Quantity | null;
  confidence: number;
}

const RE_ANCHOR = /(税込)?[¥￥]?\d[\d,]*(?:\.\d+)?\s*円|[¥￥]\d[\d,]*/;
const RE_NOISE = /^[\d\s,.¥￥円税込抜本体価格当りたあ()（）~〜・|一-]+$/;

function plausible(p: Price): boolean {
  return p.amountIncl >= 10 && p.amountIncl <= 99999;
}

// 同一行の近接トークンを結合（OCRは「98円」を「98」「円」に割る）
export function mergeWords(words: Word[]): Word[] {
  if (!words.length) return [];
  const rows: Word[][] = [];
  for (const w of [...words].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x)) {
    const cy = w.y + w.h / 2;
    let placed = false;
    for (const row of rows) {
      const rcy = row.reduce((s, r) => s + r.y + r.h / 2, 0) / row.length;
      const rh = Math.max(...row.map((r) => r.h));
      if (Math.abs(cy - rcy) <= Math.max(rh, w.h) * 0.6) {
        row.push(w);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push([w]);
  }

  const merged: Word[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let cur: Word | null = null;
    for (const w of row) {
      if (!cur) {
        cur = { ...w };
        continue;
      }
      const gap = w.x - (cur.x + cur.w);
      if (gap <= Math.max(cur.h, w.h) * 0.8) {
        const right = Math.max(cur.x + cur.w, w.x + w.w);
        const bottom = Math.max(cur.y + cur.h, w.y + w.h);
        const top = Math.min(cur.y, w.y);
        cur = {
          text: cur.text + w.text,
          x: cur.x,
          y: top,
          w: right - cur.x,
          h: bottom - top,
          conf: w.conf > 0 ? Math.min(cur.conf, w.conf) : cur.conf,
        };
      } else {
        merged.push(cur);
        cur = { ...w };
      }
    }
    if (cur) merged.push(cur);
  }
  return merged;
}

export function extractProducts(
  rawWords: Word[],
  xRange = 300,
  yUp = 160,
  yDown = 80,
): RawProduct[] {
  const words = mergeWords(rawWords);
  const anchors: { aw: Word; price: Price }[] = [];
  for (const w of words) {
    if (RE_ANCHOR.test(w.text)) {
      const p = parsePrice(w.text);
      if (p) anchors.push({ aw: w, price: p });
    }
  }

  const used = new Set<Word>();
  const consumed = new Set<Word>();
  const products: RawProduct[] = [];

  for (const { aw, price: price0 } of anchors) {
    if (consumed.has(aw)) continue;
    let price = price0;
    const cx = aw.x + aw.w / 2;
    const cy = aw.y;
    const group: Word[] = [];
    for (const w of words) {
      if (w === aw) continue;
      const wx = w.x + w.w / 2;
      if (
        Math.abs(wx - cx) <= xRange &&
        cy - (w.y + w.h) >= -yUp &&
        cy - (w.y + w.h) <= yUp &&
        w.y - (aw.y + aw.h) <= yDown
      ) {
        if (used.has(w)) continue;
        group.push(w);
      }
    }
    group.sort((a, b) => a.y - b.y || a.x - b.x);

    const nameParts: string[] = [];
    let qty: Quantity | null = null;
    const confs = [aw.conf];
    for (const w of group) {
      if (w.text.includes("税込") && !aw.text.includes("税込") && RE_ANCHOR.test(w.text)) {
        const pp = parsePrice(w.text);
        if (pp) {
          price = {
            amountIncl: pp.amountIncl,
            amountExcl: price.amountIncl,
            taxStatus: "included",
            isPer100g: price.isPer100g,
          };
          consumed.add(w);
          used.add(w);
          confs.push(w.conf);
          continue;
        }
      }
      const q = parseQuantity(w.text);
      if (q && qty === null) {
        qty = q;
        confs.push(w.conf);
        used.add(w);
        continue;
      }
      if (RE_ANCHOR.test(w.text) || RE_NOISE.test(w.text)) continue;
      nameParts.push(w.text);
      confs.push(w.conf);
      used.add(w);
    }

    const name = nameParts.join("").trim();
    if (!name) continue;
    if (qty === null) qty = parseQuantity(name);

    let conf = confs.reduce((a, b) => a + b, 0) / confs.length / 100;
    if (!plausible(price)) conf = Math.min(conf, 0.2);

    products.push({ name, price, qty, confidence: Math.round(conf * 1000) / 1000 });
  }
  return products;
}

// 価格パーサ（analyzer/price.py のTS移植）。税込優先・税抜は8%換算。
export const TAX_RATE = 0.08;

export interface Price {
  amountIncl: number;
  amountExcl: number | null;
  taxStatus: "included" | "estimated";
  isPer100g: boolean;
}

const NUM = String.raw`(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?`;
const RE_INCL = new RegExp(`税込\\s*¥?${NUM}\\s*円?`);
const RE_EXCL_WORD = /本体価格|税抜|本体/;
const RE_PRICE = new RegExp(`(?:¥|￥)${NUM}|${NUM}\\s*円`);
const RE_PHONE = /\d{2,4}-\d{2,4}-\d{3,4}/;
const RE_DATE = /\d+\s*年|\d+\s*月\s*\d+\s*日/;
const RE_PER100G = /100\s*g\s*(?:当り|当たり|あたり)/i;

function toNum(whole: string, frac: string | undefined): number {
  return parseFloat(whole.replace(/,/g, "") + (frac || ""));
}

export function parsePrice(text: string): Price | null {
  if (!text) return null;
  const t = text.normalize("NFKC");
  if (RE_PHONE.test(t) || RE_DATE.test(t)) return null;

  const per100g = RE_PER100G.test(t);
  const inclM = RE_INCL.exec(t);

  const rest = inclM ? t.slice(0, inclM.index) + t.slice(inclM.index + inclM[0].length) : t;
  let other: number | null = null;
  const pm = RE_PRICE.exec(rest);
  if (pm) {
    if (pm[1] !== undefined) other = toNum(pm[1], pm[2]);
    else if (pm[3] !== undefined) other = toNum(pm[3], pm[4]);
  }

  if (inclM) {
    const incl = toNum(inclM[1], inclM[2]);
    return { amountIncl: incl, amountExcl: other, taxStatus: "included", isPer100g: per100g };
  }

  if (other === null) return null;
  if (!(other >= 10 && other <= 999999)) return null;

  if (RE_EXCL_WORD.test(t)) {
    return {
      amountIncl: Math.round(other * (1 + TAX_RATE) * 100) / 100,
      amountExcl: other,
      taxStatus: "estimated",
      isPer100g: per100g,
    };
  }
  return { amountIncl: other, amountExcl: null, taxStatus: "included", isPer100g: per100g };
}

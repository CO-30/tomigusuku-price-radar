export interface StoreStatus {
  id: string;
  name: string;
  area: string;
  status: "ok" | "failed" | "blocked" | "no_flyer" | "unsupported" | "manual";
  detail: string;
}

export interface Summary {
  date: string;
  updated_at: string;
  stores_total: number;
  stores_ok: number;
  products_total: number;
  review_total: number;
  bargains_total: number;
  stores: StoreStatus[];
}

export interface Product {
  id: number;
  store_id: string;
  store_name: string;
  name: string;
  category: string;
  price_incl: number;
  price_excl: number | null;
  tax_status: "included" | "estimated";
  qty_amount: number | null;
  qty_unit: string | null;
  qty_count: number | null;
  unit_price: number | null;
  unit_label: string | null;
  confidence: number;
  date: string;
  period_start: string | null;
  period_end: string | null;
  period_estimated: number;
  flyer_image: string | null;
  source_url: string | null;
  captured?: boolean;
  bargain?: boolean;
  stats?: {
    previous_price: number | null;
    min_7d: number | null;
    min_30d: number | null;
    avg_30d: number | null;
  };
}

export interface Ranking {
  date: string;
  all: Product[];
  categories: Record<string, Product[]>;
}

export interface Fallback {
  date: string | null;
  stale: boolean;
  all: Product[];
}

export interface HistoryEntry {
  current_price: number | null;
  history: [string, number][];
}

export const CATEGORY_LABELS: Record<string, string> = {
  vegetables: "野菜",
  fruits: "果物",
  eggs: "卵",
  milk: "牛乳・豆乳",
  dairy: "乳製品",
  rice: "米",
  bread: "パン",
  tofu_natto: "豆腐・納豆",
  noodles: "麺類",
  meat: "肉",
  seafood: "魚介",
  seasoning: "調味料",
  canned: "缶詰",
  frozen: "冷凍",
  processed: "加工・日配",
  drink: "飲料",
  other: "その他",
};

export const STATUS_LABELS: Record<StoreStatus["status"], string> = {
  ok: "自動取得",
  manual: "手動チラシ",
  no_flyer: "チラシ未投入",
  blocked: "取得制限",
  failed: "取得失敗",
  unsupported: "未対応",
};

// localStorage に保存する利用者データ（お気に入り・買い物リスト・価格アラート）
import { useEffect, useState } from "react";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function usePersistent<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => read(key, initial));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* プライベートモード等では保存されないが閲覧は継続できる */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

// 商品の同定キー（店舗をまたいで同名商品をまとめるのは name のみ）
export const productKey = (name: string) => name.trim();

export interface AlertRule {
  name: string;
  targetPrice: number;
}

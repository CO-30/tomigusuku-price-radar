import { Product, Ranking, Summary, HistoryEntry } from "./types";

const BASE = import.meta.env.BASE_URL;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}data/${path}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export const loadSummary = () => fetchJson<Summary>("summary.json");
export const loadReview = () => fetchJson<Product[]>("review.json");
export const loadRanking = () => fetchJson<Ranking>("ranking.json");
export const loadHistory = () =>
  fetchJson<Record<string, HistoryEntry>>("history.json");

export const flyerUrl = (p: string | null) => (p ? `${BASE}${p}` : null);

export const yen = (v: number) =>
  v >= 1000 ? v.toLocaleString("ja-JP") : String(Math.round(v * 100) / 100);

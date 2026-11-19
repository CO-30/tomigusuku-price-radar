import { useCallback, useEffect, useMemo, useState } from "react";
import { Home } from "./Home";
import { ShopList } from "./ShopList";
import { Settings, alertHits } from "./Settings";
import { Detail } from "./Detail";
import { Camera } from "./Camera";
import { loadFallback, loadHistory, loadRanking, loadReview, loadSummary } from "./data";
import { AlertRule, usePersistent } from "./store";
import { todaysCaptureProducts } from "./captures";
import { Fallback, HistoryEntry, Product, Ranking, Summary } from "./types";

type Tab = "home" | "camera" | "list" | "settings";

export default function App() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [fallback, setFallback] = useState<Fallback | null>(null);
  const [history, setHistory] = useState<Record<string, HistoryEntry>>({});
  const [review, setReview] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [selected, setSelected] = useState<Product | null>(null);
  const [captureTick, setCaptureTick] = useState(0);

  const [favorites, setFavorites] = usePersistent<string[]>("pr:favorites", []);
  const [list, setList] = usePersistent<string[]>("pr:shoplist", []);
  const [alerts, setAlerts] = usePersistent<AlertRule[]>("pr:alerts", []);

  useEffect(() => {
    Promise.all([loadSummary(), loadRanking(), loadHistory()])
      .then(([s, r, h]) => {
        setSummary(s);
        setRanking(r);
        setHistory(h);
      })
      .catch((e) => setError(String(e)));
    loadReview().then(setReview).catch(() => setReview([]));
    loadFallback().then(setFallback).catch(() => setFallback(null));
  }, []);

  const onCaptured = useCallback(() => setCaptureTick((t) => t + 1), []);

  // サーバのランキング + 当日の撮影商品を合流し、単価順に並べ直す
  const merged = useMemo<Ranking | null>(() => {
    if (!summary) return ranking;
    const caps = todaysCaptureProducts(summary.date);
    if (!ranking) {
      if (!caps.length) return null;
      return { date: summary.date, all: caps, categories: groupBy(caps) };
    }
    if (!caps.length) return ranking;
    const all = [...ranking.all, ...caps].sort(byUnit);
    return { date: ranking.date, all, categories: groupBy(all) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranking, summary, captureTick]);

  const nAlerts = useMemo(
    () => (merged ? alertHits(merged, alerts).length : 0),
    [merged, alerts]
  );

  if (error && !summary)
    return (
      <div className="app">
        <div className="empty">
          <b>データを読み込めませんでした</b>
          初回の自動更新がまだ実行されていない可能性があります。（{error}）
        </div>
      </div>
    );
  if (!summary || !merged)
    return <div className="loading">読み込み中…</div>;

  const favSet = new Set(favorites);
  const listSet = new Set(list);

  return (
    <div className="app">
      <header className="masthead">
        <h1>
          特売レーダー<small>豊見城</small>
        </h1>
        <div className="date">
          <div>{summary.date}</div>
          <div>更新 {summary.updated_at.slice(11)}</div>
        </div>
      </header>

      {tab === "home" && (
        <Home
          summary={summary}
          ranking={merged}
          review={review}
          fallback={fallback}
          onSelect={setSelected}
          onGoCamera={() => setTab("camera")}
        />
      )}
      {tab === "camera" && <Camera today={summary.date} onCaptured={onCaptured} />}
      {tab === "list" && (
        <ShopList ranking={merged} list={list} setList={setList} onSelect={setSelected} />
      )}
      {tab === "settings" && (
        <Settings
          ranking={merged}
          favorites={favorites}
          setFavorites={setFavorites}
          alerts={alerts}
          setAlerts={setAlerts}
        />
      )}

      {selected && (
        <Detail
          p={selected}
          history={history[`${selected.store_id}|${selected.name}`]}
          fav={favSet.has(selected.name)}
          inList={listSet.has(selected.name)}
          onFav={() =>
            setFavorites(
              favSet.has(selected.name)
                ? favorites.filter((f) => f !== selected.name)
                : [...favorites, selected.name]
            )
          }
          onList={() =>
            setList(
              listSet.has(selected.name)
                ? list.filter((f) => f !== selected.name)
                : [...list, selected.name]
            )
          }
          onClose={() => setSelected(null)}
        />
      )}

      <nav className="tabbar" aria-label="メイン">
        <div className="inner">
          <button className={`tab ${tab === "home" ? "active" : ""}`} onClick={() => setTab("home")}>
            <span className="ico">📰</span>今日の特売
          </button>
          <button className={`tab ${tab === "camera" ? "active" : ""}`} onClick={() => setTab("camera")}>
            <span className="ico">📷</span>撮って解析
          </button>
          <button className={`tab ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>
            <span className="ico">🧺</span>リスト
          </button>
          <button className={`tab ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>
            <span className="ico">⚙️</span>アラート{nAlerts > 0 ? `(${nAlerts})` : ""}
          </button>
        </div>
      </nav>
    </div>
  );
}

function byUnit(a: Product, b: Product): number {
  return (
    (a.unit_price ?? Infinity) - (b.unit_price ?? Infinity) ||
    a.price_incl - b.price_incl
  );
}

function groupBy(items: Product[]): Record<string, Product[]> {
  const m: Record<string, Product[]> = {};
  for (const p of items) (m[p.category] ??= []).push(p);
  return m;
}

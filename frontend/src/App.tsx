import { useEffect, useMemo, useState } from "react";
import { Home } from "./Home";
import { ShopList } from "./ShopList";
import { Settings, alertHits } from "./Settings";
import { Detail } from "./Detail";
import { loadHistory, loadRanking, loadSummary } from "./data";
import { AlertRule, usePersistent } from "./store";
import { HistoryEntry, Product, Ranking, Summary } from "./types";

type Tab = "home" | "list" | "settings";

export default function App() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [history, setHistory] = useState<Record<string, HistoryEntry>>({});
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [selected, setSelected] = useState<Product | null>(null);

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
  }, []);

  const nAlerts = useMemo(
    () => (ranking ? alertHits(ranking, alerts).length : 0),
    [ranking, alerts]
  );

  if (error)
    return (
      <div className="app">
        <div className="empty">
          <b>データを読み込めませんでした</b>
          初回の自動更新がまだ実行されていない可能性があります。（{error}）
        </div>
      </div>
    );
  if (!summary || !ranking)
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
        <Home summary={summary} ranking={ranking} onSelect={setSelected} />
      )}
      {tab === "list" && (
        <ShopList ranking={ranking} list={list} setList={setList} onSelect={setSelected} />
      )}
      {tab === "settings" && (
        <Settings
          ranking={ranking}
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
          <button className={`tab ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>
            <span className="ico">🧺</span>買い物リスト
          </button>
          <button className={`tab ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>
            <span className="ico">⚙️</span>アラート{nAlerts > 0 ? `(${nAlerts})` : ""}
          </button>
        </div>
      </nav>
    </div>
  );
}

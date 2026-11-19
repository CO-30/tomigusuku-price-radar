import { useMemo, useState } from "react";
import { Fallback, Product, Ranking, Summary, CATEGORY_LABELS, STATUS_LABELS } from "./types";
import { yen } from "./data";

type SortKey = "unit" | "price" | "store" | "end";

interface Props {
  summary: Summary;
  ranking: Ranking;
  review: Product[];
  fallback: Fallback | null;
  onSelect: (p: Product) => void;
  onGoCamera: () => void;
}

export function Home({ summary, ranking, review, fallback, onSelect, onGoCamera }: Props) {
  const [cat, setCat] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("unit");

  // 当日の特売（サーバ＋撮影）が空で、過去の収集結果がある場合はそれを代わりに表示
  const showingFallback =
    ranking.all.length === 0 && !!fallback && fallback.all.length > 0;
  const active: Ranking = showingFallback
    ? { date: fallback!.date ?? summary.date, all: fallback!.all, categories: groupCats(fallback!.all) }
    : ranking;

  const cats = useMemo(
    () => Object.keys(active.categories).sort(),
    [active]
  );

  const items = useMemo(() => {
    const base = cat === "all" ? active.all : active.categories[cat] ?? [];
    const arr = [...base];
    const cmp: Record<SortKey, (a: Product, b: Product) => number> = {
      unit: (a, b) =>
        (a.unit_price ?? Infinity) - (b.unit_price ?? Infinity) ||
        a.price_incl - b.price_incl,
      price: (a, b) => a.price_incl - b.price_incl,
      store: (a, b) => a.store_name.localeCompare(b.store_name, "ja"),
      end: (a, b) => (a.period_end ?? "9999").localeCompare(b.period_end ?? "9999"),
    };
    return arr.sort(cmp[sort]);
  }, [active, cat, sort]);

  return (
    <>
      <div className="statusline" role="status">
        <span>
          店舗 <b className="num">{summary.stores_ok}</b>/{summary.stores_total}
        </span>
        <span>
          特売 <b className="num">{summary.products_total}</b>件
        </span>
        <span className="deal-count">
          お買い得 <b className="num">{summary.bargains_total}</b>件
        </span>
        {summary.review_total > 0 && (
          <span>要確認 {summary.review_total}件</span>
        )}
      </div>

      <button className="home-shoot" onClick={onGoCamera}>
        📷 チラシを撮る <span>→ その場で解析</span>
      </button>

      <nav className="chips chips-top" aria-label="カテゴリ">
        <button className={`chip ${cat === "all" ? "active" : ""}`} onClick={() => setCat("all")}>
          すべて
        </button>
        {cats.map((c) => (
          <button key={c} className={`chip ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>
            {CATEGORY_LABELS[c] ?? c}
          </button>
        ))}
      </nav>

      <div className="sortrow">
        <label htmlFor="sort">並べ替え</label>
        <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="unit">単価が安い順</option>
          <option value="price">売価が安い順</option>
          <option value="store">店舗ごと</option>
          <option value="end">特売の終了が近い順</option>
        </select>
      </div>

      {showingFallback && (
        <div className="fallback-banner">
          今日の特売はまだ届いていません。
          <b>{active.date} 時点の最新情報</b>を表示しています。
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty">
          <b>今日の特売データがまだありません</b>
          手元のチラシを撮って解析すれば、すぐランキングに追加できます。
          <button className="btn primary" style={{ marginTop: 16 }} onClick={onGoCamera}>
            📷 チラシを撮って解析
          </button>
        </div>
      ) : (
        <ol className="rows">
          {items.map((p, i) => (
            <li key={p.id ?? `${p.store_id}-${p.name}-${i}`}>
              <button className={`row ${p.bargain ? "bargain" : ""}`} onClick={() => onSelect(p)}>
                <span className={`rank num ${i < 3 ? "top" : ""}`}>{i + 1}</span>
                <span className="info">
                  <span className="name">{p.name}</span>
                  <span className="meta">
                    <span>{p.store_name}</span>
                    {p.period_end && <span>〜{p.period_end.slice(5).replace("-", "/")}</span>}
                    {p.bargain && <span className="deal-tag">お買い得</span>}
                  </span>
                </span>
                <span className="price">
                  {p.unit_price != null ? (
                    <>
                      <span className="unit num">
                        {yen(p.unit_price)}
                        <small>{p.unit_label}</small>
                      </span>
                      <span className="total num">売価 {yen(p.price_incl)}円</span>
                    </>
                  ) : (
                    <span className="unit num">
                      {yen(p.price_incl)}
                      <small>円</small>
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {review.length > 0 && (
        <section className="stores">
          <h3>要確認（読取信頼度が低い・価格が不自然な {review.length} 件）</h3>
          {review.map((p, i) => (
            <div className="store-item" key={i}>
              <span>
                {p.name} <span className="note">{p.store_name}</span>
              </span>
              <span className="num">{p.price_incl}円</span>
            </div>
          ))}
          <p className="note">
            ランキングには含めていません。チラシ画像を直接ご確認ください。
          </p>
        </section>
      )}

      <section className="stores">
        <h3>店舗別の取得状況（{summary.date}）</h3>
        {summary.stores.map((s) =>
          s.flyer_url ? (
            <a className="store-item store-link" key={s.id} href={s.flyer_url} target="_blank" rel="noreferrer">
              <span>
                {s.name} <span className="note">{s.area}</span>
              </span>
              <span className="flyer-go">チラシ ›</span>
            </a>
          ) : (
            <div className="store-item" key={s.id}>
              <span>
                {s.name} <span className="note">{s.area}</span>
              </span>
              <span className={`st ${s.status}`}>{STATUS_LABELS[s.status]}</span>
            </div>
          )
        )}
        <p className="note">
          各店の「チラシ ›」で公式の特売チラシをそのまま開けます。開いた画面を
          スクリーンショットし、「撮って解析」タブの「スクショ・写真から選ぶ」で
          読み込ませれば、そのままランキングに加わります。店頭のチラシはその場で撮影できます。
        </p>
      </section>
    </>
  );
}

function groupCats(items: Product[]): Record<string, Product[]> {
  const m: Record<string, Product[]> = {};
  for (const p of items) (m[p.category] ??= []).push(p);
  return m;
}

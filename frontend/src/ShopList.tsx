import { useMemo, useState } from "react";
import { Product, Ranking } from "./types";
import { yen } from "./data";
import { productKey } from "./store";

interface Props {
  ranking: Ranking;
  list: string[];
  setList: (v: string[]) => void;
  onSelect: (p: Product) => void;
}

// 商品名（部分一致）ごとに最安の掲載を探す
function bestFor(ranking: Ranking, name: string): Product | null {
  const n = name.trim();
  let best: Product | null = null;
  for (const p of ranking.all) {
    if (!p.name.includes(n)) continue;
    if (!best || p.price_incl < best.price_incl) best = p;
  }
  return best;
}

export function ShopList({ ranking, list, setList, onSelect }: Props) {
  const [input, setInput] = useState("");

  const rows = useMemo(
    () => list.map((name) => ({ name, best: bestFor(ranking, name) })),
    [list, ranking]
  );

  const byStore = useMemo(() => {
    const m = new Map<string, { store: string; items: Product[] }>();
    for (const r of rows) {
      if (!r.best) continue;
      const e = m.get(r.best.store_id) ?? { store: r.best.store_name, items: [] };
      e.items.push(r.best);
      m.set(r.best.store_id, e);
    }
    return [...m.values()];
  }, [rows]);

  const total = rows.reduce((s, r) => s + (r.best?.price_incl ?? 0), 0);

  const add = () => {
    const v = productKey(input);
    if (v && !list.includes(v)) setList([...list, v]);
    setInput("");
  };

  return (
    <div className="page">
      <h2>買い物リスト</h2>
      <div className="addform">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="例: 卵、キャベツ、牛乳"
          aria-label="買いたい商品名"
        />
        <button className="btn primary" onClick={add}>追加</button>
      </div>

      {rows.length === 0 && (
        <p className="note">買いたい商品を追加すると、今日どの店が最安かを表示します。</p>
      )}

      {rows.map((r) => (
        <div className="list-item" key={r.name}>
          <span>
            <b>{r.name}</b>
            {r.best ? (
              <span className="best">
                {" "}{r.best.store_name} {yen(r.best.price_incl)}円
              </span>
            ) : (
              <span className="nohit"> 本日の特売掲載なし</span>
            )}
          </span>
          {r.best ? (
            <button className="iconbtn" onClick={() => onSelect(r.best!)} aria-label="詳細">▶</button>
          ) : (
            <span />
          )}
          <button
            className="iconbtn"
            onClick={() => setList(list.filter((x) => x !== r.name))}
            aria-label={`${r.name}を削除`}
          >
            ✕
          </button>
        </div>
      ))}

      {rows.some((r) => r.best) && (
        <>
          <div className="sumline">
            <span>特売掲載分の合計</span>
            <span className="num">{yen(total)}円</span>
          </div>
          <h2>店舗ごとの買い回り</h2>
          {byStore.map((g) => (
            <div key={g.store}>
              <h3 className="note">{g.store}</h3>
              {g.items.map((p) => (
                <div className="list-item" key={p.name}>
                  <span>{p.name}</span>
                  <span className="num">{yen(p.price_incl)}円</span>
                  <span />
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

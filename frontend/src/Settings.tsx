import { useState } from "react";
import { Ranking } from "./types";
import { yen } from "./data";
import { AlertRule } from "./store";

interface Props {
  ranking: Ranking;
  favorites: string[];
  setFavorites: (v: string[]) => void;
  alerts: AlertRule[];
  setAlerts: (v: AlertRule[]) => void;
}

export function alertHits(ranking: Ranking, alerts: AlertRule[]) {
  return alerts.flatMap((a) => {
    const hits = ranking.all.filter(
      (p) => p.name.includes(a.name) && p.price_incl <= a.targetPrice
    );
    return hits.map((p) => ({ rule: a, p }));
  });
}

export function Settings({ ranking, favorites, setFavorites, alerts, setAlerts }: Props) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const hits = alertHits(ranking, alerts);

  const add = () => {
    const target = Number(price);
    if (!name.trim() || !Number.isFinite(target) || target <= 0) return;
    setAlerts([...alerts.filter((a) => a.name !== name.trim()),
               { name: name.trim(), targetPrice: target }]);
    setName("");
    setPrice("");
  };

  return (
    <div className="page">
      <h2>価格アラート</h2>
      <p className="note">
        商品名と目標価格を登録すると、特売がその価格以下になった日にここへ表示されます。
      </p>
      {hits.map(({ rule, p }, i) => (
        <div className="alert-hit" key={i}>
          <b>{p.name}</b> が {p.store_name} で <b className="num">{yen(p.price_incl)}円</b>
          （目標 {yen(rule.targetPrice)}円以下）
        </div>
      ))}
      <div className="addform">
        <input value={name} onChange={(e) => setName(e.target.value)}
               placeholder="商品名（例: 卵）" aria-label="アラート商品名" />
        <input value={price} onChange={(e) => setPrice(e.target.value)}
               placeholder="目標円" inputMode="numeric" style={{ maxWidth: "7em" }}
               aria-label="目標価格" />
        <button className="btn primary" onClick={add}>登録</button>
      </div>
      {alerts.map((a) => (
        <div className="list-item" key={a.name}>
          <span>{a.name} — {yen(a.targetPrice)}円以下</span>
          <span />
          <button className="iconbtn" aria-label={`${a.name}のアラートを削除`}
                  onClick={() => setAlerts(alerts.filter((x) => x.name !== a.name))}>✕</button>
        </div>
      ))}

      <h2 style={{ marginTop: 28 }}>お気に入り商品</h2>
      {favorites.length === 0 && (
        <p className="note">商品詳細から ☆ で登録すると、ここに常時表示されます。</p>
      )}
      {favorites.map((f) => {
        const hit = ranking.all.find((p) => p.name.includes(f));
        return (
          <div className="list-item" key={f}>
            <span>
              <b>{f}</b>
              {hit ? (
                <span className="best"> {hit.store_name} {yen(hit.price_incl)}円</span>
              ) : (
                <span className="nohit"> 本日の掲載なし</span>
              )}
            </span>
            <span />
            <button className="iconbtn" aria-label={`${f}をお気に入り解除`}
                    onClick={() => setFavorites(favorites.filter((x) => x !== f))}>✕</button>
          </div>
        );
      })}

      <h2 style={{ marginTop: 28 }}>このアプリについて</h2>
      <p className="note">
        豊見城市周辺のスーパーの特売チラシを毎朝7時までに自動処理し、容量をもとに
        実質単価で横断比較します。robots.txt で自動収集が許可されていない店舗は、
        チラシ撮影画像の手動投入（GitHub リポジトリの inbox フォルダ）で補完します。
        読取信頼度の低い商品はランキングから外し「要確認」として扱います。
      </p>
    </div>
  );
}

import { Product, HistoryEntry, CATEGORY_LABELS } from "./types";
import { flyerUrl, yen } from "./data";
import { Spark } from "./Spark";

interface Props {
  p: Product;
  history?: HistoryEntry;
  fav: boolean;
  inList: boolean;
  onFav: () => void;
  onList: () => void;
  onClose: () => void;
}

export function Detail({ p, history, fav, inList, onFav, onList, onClose }: Props) {
  const img = flyerUrl(p.flyer_image);
  const periodText = p.period_end
    ? `${p.period_start ?? "?"} 〜 ${p.period_end}${p.period_estimated ? "（推定）" : ""}`
    : "不明";
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{p.name}</h2>
        <div className="sub">
          {p.store_name} ・ {CATEGORY_LABELS[p.category] ?? p.category}
          {p.bargain ? " ・ お買い得" : ""}
        </div>
        <div className="pricebox">
          {p.unit_price != null ? (
            <div className="unit num">
              {yen(p.unit_price)}
              <small>{p.unit_label}</small>
            </div>
          ) : (
            <div className="unit num">
              {yen(p.price_incl)}
              <small>円（単価算出不可）</small>
            </div>
          )}
          <div className="total">
            売価 {yen(p.price_incl)}円
            {p.tax_status === "estimated" ? "（税8%換算）" : "（税込）"}
          </div>
        </div>
        <dl className="kv">
          <dt>特売期間</dt>
          <dd>{periodText}</dd>
          {p.stats?.previous_price != null && (
            <>
              <dt>前回価格</dt>
              <dd>{yen(p.stats.previous_price)}円</dd>
            </>
          )}
          {p.stats?.min_30d != null && (
            <>
              <dt>30日最安</dt>
              <dd>{yen(p.stats.min_30d)}円 / 平均 {yen(p.stats.avg_30d!)}円</dd>
            </>
          )}
          <dt>読取信頼度</dt>
          <dd>{Math.round(p.confidence * 100)}%</dd>
        </dl>
        {history && history.history.length > 1 && (
          <div className="sparkbox">
            <Spark points={history.history} />
            <div className="caption">価格の推移（履歴 {history.history.length} 回分）</div>
          </div>
        )}
        <div className="actions">
          <button className={`btn ${fav ? "on" : ""}`} onClick={onFav}>
            {fav ? "お気に入り解除" : "☆ お気に入り"}
          </button>
          <button className={`btn ${inList ? "on" : ""}`} onClick={onList}>
            {inList ? "リストから外す" : "買い物リストへ"}
          </button>
          <button className="btn primary" onClick={onClose}>
            閉じる
          </button>
        </div>
        {img && (
          <a className="flyer-link" href={img} target="_blank" rel="noreferrer">
            <img src={img} alt={`${p.store_name}のチラシ`} loading="lazy" />
          </a>
        )}
        {p.source_url && (
          <p className="note">
            <a href={p.source_url} target="_blank" rel="noreferrer">元のチラシページを開く</a>
          </p>
        )}
      </div>
    </div>
  );
}

"""日次パイプライン: 収集 → OCR解析 → 単価計算 → DB蓄積 → JSONエクスポート。

毎朝 GitHub Actions から実行される。1店舗の失敗が全体を止めないこと、
前日データを当日として誤表示しないことを保証する。
"""
from __future__ import annotations

import hashlib
import json
import shutil
from dataclasses import dataclass
from datetime import date, datetime, timezone, timedelta
from pathlib import Path

from analyzer.classify import classify
from analyzer.ocr import ocr_image, pdf_to_images
from analyzer.parse import extract_products
from analyzer.unitprice import sanity_ok, unit_price
from collector.run import collect_all, load_stores
from storage import db as dbm

JST = timezone(timedelta(hours=9))
CONFIDENCE_THRESHOLD = 0.55
BARGAIN_DISCOUNT = 0.10  # 30日平均より10%以上安ければお買い得候補
FLYER_RETENTION_DAYS = 30  # 公開用チラシ画像の保持日数（リポジトリ肥大対策）


@dataclass
class Report:
    date: str
    stores_ok: int
    stores_total: int
    products: int
    review: int


def _analyze_file(path: Path) -> list:
    p = Path(path)
    if p.suffix.lower() == ".pdf":
        pages = pdf_to_images(p, p.parent / "_pages")
        words = []
        out = []
        for page in pages:
            out.extend(extract_products(ocr_image(page)))
        return out
    return extract_products(ocr_image(p))


def run(today: date | None = None, base_dir: Path | str = ".") -> Report:
    today = today or datetime.now(JST).date()
    base = Path(base_dir)
    t = today.isoformat()
    raw_dir = base / "data" / "raw"
    flyer_pub = base / "data" / "flyers" / t
    public = base / "data" / "public"
    public.mkdir(parents=True, exist_ok=True)

    conn = dbm.init_db(base / "data" / "radar.sqlite")
    stores = load_stores()
    for s in stores:
        conn.execute(
            "INSERT OR REPLACE INTO stores(id,name,area,chain,source_type,url,flyer_url) "
            "VALUES(?,?,?,?,?,?,?)",
            (s["id"], s["name"], s.get("area"), s.get("chain"),
             s.get("source", {}).get("type"), s.get("source", {}).get("url"),
             s.get("flyer_url")))
    conn.commit()

    # 1. 収集
    results = collect_all(today, raw_dir, inbox_dir=base / "inbox", stores=stores)

    # 2. 解析 → DB
    n_products = 0
    for res in results:
        dbm.log_fetch(conn, res.store_id, t, res.status, res.detail)
        items = []
        for f in res.files:
            src = Path(f["path"])
            # 同一内容のファイルは一度だけ取込む（inbox 残置による再取込・
            # 推定期間のズレ・チラシ画像の日次複製を防ぐ）
            sha1 = hashlib.sha1(src.read_bytes()).hexdigest()
            if dbm.was_ingested(conn, res.store_id, sha1):
                continue
            # Pages から参照できる場所にコピー
            dest = flyer_pub / res.store_id / src.name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
            rel_img = str(dest.relative_to(base))
            try:
                raws = _analyze_file(src)
            except Exception as e:
                dbm.log_fetch(conn, res.store_id, t, res.status,
                              f"{res.detail}; 解析失敗 {src.name}: {str(e)[:100]}")
                continue
            dbm.mark_ingested(conn, res.store_id, sha1, src.name,
                              f["period_start"], f["period_end"], t)
            for rp in raws:
                cat = classify(rp.name)
                up = unit_price(rp.price, rp.qty, cat)
                implausible = not sanity_ok(up, cat)
                items.append({
                    "store_id": res.store_id, "name": rp.name,
                    "category": cat.id,
                    "price_incl": rp.price.amount_incl,
                    "price_excl": rp.price.amount_excl,
                    "tax_status": rp.price.tax_status,
                    "qty_amount": rp.qty.amount if rp.qty else None,
                    "qty_unit": rp.qty.unit if rp.qty else None,
                    "qty_count": rp.qty.count if rp.qty else None,
                    "unit_price": up.value if up else None,
                    "unit_label": up.unit_label if up else None,
                    "confidence": rp.confidence,
                    "needs_review": int(rp.confidence < CONFIDENCE_THRESHOLD
                                        or implausible),
                    "date": t,
                    "period_start": f["period_start"],
                    "period_end": f["period_end"],
                    "period_estimated": int(f["period_estimated"]),
                    "flyer_image": rel_img,
                    "source_url": f.get("source_url"),
                })
        n_products += dbm.upsert_products(conn, items)

    # 2.5 古い公開チラシ画像の間引き
    flyers_root = base / "data" / "flyers"
    if flyers_root.is_dir():
        cutoff = (today - timedelta(days=FLYER_RETENTION_DAYS)).isoformat()
        for d in flyers_root.iterdir():
            if d.is_dir() and d.name < cutoff:
                shutil.rmtree(d, ignore_errors=True)

    # 3. エクスポート
    now = datetime.now(JST).strftime("%Y-%m-%d %H:%M")
    statuses = dbm.store_statuses(conn, t)
    ok_states = {"ok", "manual"}
    rank_all = dbm.ranking(conn, today)

    history: dict[str, dict] = {}
    for row in rank_all:
        key = f"{row['store_id']}|{row['name']}"
        stats = dbm.price_stats(conn, row["name"], row["store_id"], today)
        history[key] = stats
        row["stats"] = {k: stats[k] for k in
                        ("previous_price", "min_7d", "min_30d", "avg_30d")}
        avg = stats["avg_30d"]
        row["bargain"] = bool(
            avg and row["price_incl"] <= avg * (1 - BARGAIN_DISCOUNT)
            and (stats["min_30d"] is None or row["price_incl"] <= stats["min_30d"]))

    cats: dict[str, list] = {}
    for row in rank_all:
        cats.setdefault(row["category"], []).append(row)

    review = dbm.review_list(conn, today)

    # 当日分が無いとき用の最新スナップショット（期間切れでも直近の収集結果を見せる）
    fb_date, fb_rows = dbm.fallback_ranking(conn)
    for row in fb_rows:
        stats = dbm.price_stats(conn, row["name"], row["store_id"], today)
        row["stats"] = {k: stats[k] for k in
                        ("previous_price", "min_7d", "min_30d", "avg_30d")}
    fallback = {"date": fb_date, "stale": bool(fb_date and fb_date < t),
                "all": fb_rows}

    summary = {
        "date": t, "updated_at": now,
        "stores_total": len(stores),
        "stores_ok": sum(1 for s in statuses if s["status"] in ok_states),
        "products_total": len(rank_all),
        "review_total": len(review),
        "bargains_total": sum(1 for r in rank_all if r.get("bargain")),
        "stores": statuses,
    }
    (public / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    (public / "ranking.json").write_text(
        json.dumps({"date": t, "all": rank_all, "categories": cats},
                   ensure_ascii=False), encoding="utf-8")
    (public / "history.json").write_text(
        json.dumps(history, ensure_ascii=False), encoding="utf-8")
    (public / "review.json").write_text(
        json.dumps(review, ensure_ascii=False), encoding="utf-8")
    (public / "fallback.json").write_text(
        json.dumps(fallback, ensure_ascii=False), encoding="utf-8")

    conn.close()
    return Report(date=t, stores_ok=summary["stores_ok"],
                  stores_total=len(stores), products=n_products,
                  review=len(review))


if __name__ == "__main__":
    import sys
    rep = run()
    print(f"[price-radar] {rep.date}: 店舗 {rep.stores_ok}/{rep.stores_total}, "
          f"商品 {rep.products}件追加, 要確認 {rep.review}件")
    sys.exit(0)

"""SQLite ストレージ。価格履歴の蓄積とランキング・統計クエリ。"""
from __future__ import annotations

import sqlite3
from datetime import date, timedelta
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS stores(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, area TEXT, chain TEXT,
  source_type TEXT, url TEXT
);
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL REFERENCES stores(id),
  name TEXT NOT NULL, category TEXT,
  price_incl REAL NOT NULL, price_excl REAL, tax_status TEXT,
  qty_amount REAL, qty_unit TEXT, qty_count INTEGER,
  unit_price REAL, unit_label TEXT,
  confidence REAL, needs_review INTEGER DEFAULT 0,
  date TEXT NOT NULL,
  period_start TEXT, period_end TEXT, period_estimated INTEGER DEFAULT 0,
  flyer_image TEXT, source_url TEXT
);
-- period_end が NULL でも重複排除が効くよう式インデックスで一意制約を張る
CREATE UNIQUE INDEX IF NOT EXISTS uq_products
  ON products(store_id, name, price_incl, COALESCE(period_end,''));
CREATE TABLE IF NOT EXISTS ingested(
  store_id TEXT NOT NULL, sha1 TEXT NOT NULL, filename TEXT,
  period_start TEXT, period_end TEXT, first_date TEXT,
  PRIMARY KEY(store_id, sha1)
);
CREATE TABLE IF NOT EXISTS fetch_log(
  store_id TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL,
  detail TEXT, PRIMARY KEY(store_id, date)
);
CREATE INDEX IF NOT EXISTS idx_products_date ON products(date);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name, store_id);
"""

PRODUCT_COLS = [
    "store_id", "name", "category", "price_incl", "price_excl", "tax_status",
    "qty_amount", "qty_unit", "qty_count", "unit_price", "unit_label",
    "confidence", "needs_review", "date", "period_start", "period_end",
    "period_estimated", "flyer_image", "source_url",
]


def init_db(path: Path | str) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def was_ingested(conn: sqlite3.Connection, store_id: str, sha1: str) -> dict | None:
    r = conn.execute("SELECT * FROM ingested WHERE store_id=? AND sha1=?",
                     (store_id, sha1)).fetchone()
    return dict(r) if r else None


def mark_ingested(conn: sqlite3.Connection, store_id: str, sha1: str,
                  filename: str, period_start: str | None,
                  period_end: str | None, first_date: str) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO ingested(store_id,sha1,filename,period_start,"
        "period_end,first_date) VALUES(?,?,?,?,?,?)",
        (store_id, sha1, filename, period_start, period_end, first_date))
    conn.commit()


def upsert_products(conn: sqlite3.Connection, items: list[dict]) -> int:
    n = 0
    for it in items:
        row = {c: it.get(c) for c in PRODUCT_COLS}
        row.setdefault("period_estimated", 0)
        cur = conn.execute(
            f"INSERT OR IGNORE INTO products({','.join(PRODUCT_COLS)}) "
            f"VALUES({','.join(':' + c for c in PRODUCT_COLS)})", row)
        n += cur.rowcount
    conn.commit()
    return n


def log_fetch(conn: sqlite3.Connection, store_id: str, d: str,
              status: str, detail: str = "") -> None:
    conn.execute(
        "INSERT OR REPLACE INTO fetch_log(store_id,date,status,detail) "
        "VALUES(?,?,?,?)", (store_id, d, status, detail))
    conn.commit()


def ranking(conn: sqlite3.Connection, today: date,
            category: str | None = None) -> list[dict]:
    """当日有効・要確認除外・単価昇順（単価なしは価格昇順で末尾）。"""
    t = today.isoformat()
    q = """
    SELECT p.*, s.name AS store_name, s.area AS store_area
    FROM products p JOIN stores s ON s.id = p.store_id
    WHERE p.needs_review = 0
      AND (p.period_end IS NULL OR p.period_end >= :t)
      AND (p.period_start IS NULL OR p.period_start <= :t)
      AND p.date = (SELECT MAX(date) FROM products p2
                    WHERE p2.store_id=p.store_id AND p2.name=p.name
                      AND p2.needs_review = 0
                      AND (p2.period_end IS NULL OR p2.period_end >= :t)
                      AND (p2.period_start IS NULL OR p2.period_start <= :t))
    """
    args = {"t": t}
    if category:
        q += " AND p.category = :cat"
        args["cat"] = category
    q += """ ORDER BY (p.unit_price IS NULL), p.unit_price ASC, p.price_incl ASC"""
    return [dict(r) for r in conn.execute(q, args).fetchall()]


def fallback_ranking(conn: sqlite3.Connection) -> tuple[str | None, list[dict]]:
    """当日分が無いとき用に、商品がある最新日の結果を返す（期間切れでも可）。

    戻り値は (その日付, 行リスト)。要確認は除外、単価昇順。
    """
    row = conn.execute(
        "SELECT MAX(date) AS d FROM products WHERE needs_review = 0").fetchone()
    latest = row["d"] if row else None
    if not latest:
        return None, []
    q = """
    SELECT p.*, s.name AS store_name, s.area AS store_area
    FROM products p JOIN stores s ON s.id = p.store_id
    WHERE p.needs_review = 0 AND p.date = :d
    ORDER BY (p.unit_price IS NULL), p.unit_price ASC, p.price_incl ASC
    """
    return latest, [dict(r) for r in conn.execute(q, {"d": latest}).fetchall()]


def review_list(conn: sqlite3.Connection, today: date) -> list[dict]:
    t = today.isoformat()
    q = """
    SELECT p.*, s.name AS store_name FROM products p
    JOIN stores s ON s.id = p.store_id
    WHERE p.needs_review = 1 AND (p.period_end IS NULL OR p.period_end >= ?)
    ORDER BY p.store_id, p.name
    """
    return [dict(r) for r in conn.execute(q, (t,)).fetchall()]


def price_stats(conn: sqlite3.Connection, name: str, store_id: str,
                today: date) -> dict:
    t = today.isoformat()
    d7 = (today - timedelta(days=7)).isoformat()
    d30 = (today - timedelta(days=30)).isoformat()
    rows = conn.execute(
        "SELECT date, price_incl FROM products "
        "WHERE name=? AND store_id=? AND date<=? ORDER BY date DESC",
        (name, store_id, t)).fetchall()
    hist = [(r["date"], r["price_incl"]) for r in rows]
    current = hist[0][1] if hist else None
    previous = next((p for d, p in hist if d < t), None)
    in7 = [p for d, p in hist if d7 <= d < t]
    in30 = [p for d, p in hist if d30 <= d < t]
    return {
        "current_price": current,
        "previous_price": previous,
        "min_7d": min(in7) if in7 else None,
        "min_30d": min(in30) if in30 else None,
        "avg_30d": sum(in30) / len(in30) if in30 else None,
        "history": hist[:30],
    }


def store_statuses(conn: sqlite3.Connection, d: str) -> list[dict]:
    q = """
    SELECT s.id, s.name, s.area, COALESCE(f.status,'failed') AS status,
           COALESCE(f.detail,'') AS detail
    FROM stores s LEFT JOIN fetch_log f ON f.store_id=s.id AND f.date=?
    ORDER BY s.area, s.name
    """
    return [dict(r) for r in conn.execute(q, (d,)).fetchall()]

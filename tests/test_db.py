from datetime import date

import pytest

from storage.db import init_db, upsert_products, ranking, price_stats, log_fetch


@pytest.fixture
def conn(tmp_path):
    c = init_db(tmp_path / "t.sqlite")
    c.execute("INSERT INTO stores(id,name,area,chain,source_type) "
              "VALUES('union_tomigusuku','ユニオン豊見城店','豊見城市','union','manual')")
    return c


def item(**kw):
    base = dict(
        store_id="union_tomigusuku", name="キャベツ", category="vegetables",
        price_incl=98.0, price_excl=None, tax_status="included",
        qty_amount=1.0, qty_unit="count", qty_count=1,
        unit_price=98.0, unit_label="¥/個", confidence=0.9,
        needs_review=0, date="2026-11-19",
        period_start="2026-11-19", period_end="2026-11-21",
        flyer_image="data/flyers/2026-11-19/union_tomigusuku/f1.png",
        source_url=None,
    )
    base.update(kw)
    return base


def test_duplicate_insert_once(conn):
    n1 = upsert_products(conn, [item(), item()])
    n2 = upsert_products(conn, [item()])
    rows = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    assert rows == 1


def test_expired_not_in_ranking(conn):
    upsert_products(conn, [
        item(),
        item(name="古いレタス", period_end="2026-11-18", unit_price=1.0),
    ])
    r = ranking(conn, date(2026, 11, 19))
    names = [x["name"] for x in r]
    assert "キャベツ" in names and "古いレタス" not in names


def test_needs_review_excluded(conn):
    upsert_products(conn, [item(), item(name="怪しい3円", price_incl=3.0,
                                        needs_review=1, unit_price=0.1)])
    names = [x["name"] for x in ranking(conn, date(2026, 11, 19))]
    assert "怪しい3円" not in names


def test_ranking_sorted_by_unit_price_nulls_last(conn):
    upsert_products(conn, [
        item(name="高い卵", unit_price=30.0),
        item(name="安い卵", unit_price=20.0),
        item(name="単価不明", unit_price=None, qty_amount=None),
    ])
    r = ranking(conn, date(2026, 11, 19))
    assert [x["name"] for x in r][:2] == ["安い卵", "高い卵"]
    assert r[-1]["name"] == "単価不明"


def test_price_stats_history(conn):
    for d, p in [("2026-10-25", 128.0), ("2026-11-10", 118.0), ("2026-11-19", 98.0)]:
        upsert_products(conn, [item(date=d, price_incl=p, unit_price=p,
                                    period_start=d, period_end=d)])
    s = price_stats(conn, "キャベツ", "union_tomigusuku", today=date(2026, 11, 19))
    # 過去30日統計は「当日を除く」比較基準（お買い得判定のベース）
    assert s["previous_price"] == 118.0
    assert s["min_30d"] == 118.0
    assert s["avg_30d"] == pytest.approx((128.0 + 118.0) / 2)
    assert s["current_price"] == 98.0


def test_fetch_log(conn):
    log_fetch(conn, "union_tomigusuku", "2026-11-19", "manual", "inbox 2 files")
    row = conn.execute("SELECT status FROM fetch_log").fetchone()
    assert row[0] == "manual"


def test_ranking_survives_later_needs_review_row(conn):
    # 有効行(11/19, 期間〜11/22)の後に同名商品の要確認行(11/20)が入っても
    # 有効なセールが消えてはならない（最新日サブクエリの欠陥回帰テスト）
    upsert_products(conn, [item()])
    upsert_products(conn, [item(date="2026-11-20", price_incl=3.0,
                                needs_review=1, unit_price=None,
                                period_start="2026-11-20",
                                period_end="2026-11-23")])
    names = [x["name"] for x in ranking(conn, date(2026, 11, 20))]
    assert "キャベツ" in names


def test_unique_applies_with_null_period_end(conn):
    upsert_products(conn, [item(period_end=None), item(period_end=None)])
    upsert_products(conn, [item(period_end=None)])
    rows = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    assert rows == 1

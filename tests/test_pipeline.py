import json
from datetime import date
from pathlib import Path

import pytest

from pipeline import run
from tools.make_fixture import make_flyer


@pytest.fixture(scope="module")
def result(tmp_path_factory):
    root = tmp_path_factory.mktemp("proj")
    inbox = root / "inbox" / "union_tomigusuku"
    inbox.mkdir(parents=True)
    make_flyer(inbox / "2026-11-19_2026-11-21.png")
    rep = run(today=date(2026, 11, 19), base_dir=root)
    return root, rep


def test_summary_json(result):
    root, rep = result
    s = json.loads((root / "data" / "public" / "summary.json").read_text())
    assert s["date"] == "2026-11-19"
    assert s["stores_total"] >= 16
    assert s["stores_ok"] == 1
    assert s["products_total"] >= 4
    statuses = {x["id"]: x["status"] for x in s["stores"]}
    assert statuses["union_tomigusuku"] == "manual"
    assert statuses["maxvalu_toyomi"] == "no_flyer"


def test_ranking_json_sorted_and_linked(result):
    root, rep = result
    r = json.loads((root / "data" / "public" / "ranking.json").read_text())
    assert r["all"], "ランキングが空"
    ups = [x["unit_price"] for x in r["all"] if x["unit_price"] is not None]
    assert ups == sorted(ups)
    top = r["all"][0]
    assert top["store_name"]
    assert top["flyer_image"]
    assert (root / top["flyer_image"]).exists(), "チラシ画像がPagesから参照できる場所にない"
    assert "categories" in r


def test_history_json(result):
    root, rep = result
    h = json.loads((root / "data" / "public" / "history.json").read_text())
    assert isinstance(h, dict)
    any_key = next(iter(h))
    assert "history" in h[any_key]


def test_report_counts(result):
    root, rep = result
    assert rep.products >= 4
    assert rep.stores_ok == 1


def test_rerun_next_day_does_not_duplicate(tmp_path):
    from datetime import date as _date
    root = tmp_path
    inbox = root / "inbox" / "union_tomigusuku"
    inbox.mkdir(parents=True)
    make_flyer(inbox / "photo_no_period.jpg")  # 期間なしファイル
    r1 = run(today=_date(2026, 11, 19), base_dir=root)
    assert r1.products > 0
    r2 = run(today=_date(2026, 11, 20), base_dir=root)
    # 同一ファイルの再取込で商品が増えてはならない
    assert r2.products == 0
    import sqlite3
    conn = sqlite3.connect(root / "data" / "radar.sqlite")
    n = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    assert n == r1.products
    # チラシ画像も日次複製されない
    flyer_dirs = list((root / "data" / "flyers").iterdir())
    assert len(flyer_dirs) == 1

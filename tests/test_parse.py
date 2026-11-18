from pathlib import Path

import pytest

from analyzer.ocr import Word, ocr_image
from analyzer.parse import extract_products
from tools.make_fixture import make_flyer

FIXTURE = Path(__file__).parent / "fixtures" / "flyer1.png"


@pytest.fixture(scope="module")
def products():
    if not FIXTURE.exists():
        make_flyer(FIXTURE)
    return extract_products(ocr_image(FIXTURE))


def test_extracts_cabbage_with_price(products):
    hits = [p for p in products if "キャベツ" in p.name]
    assert hits and hits[0].price.amount_incl == 98


def test_extracts_eggs_tax_included(products):
    hits = [p for p in products if "たまご" in p.name or "卵" in p.name]
    assert hits and hits[0].price.amount_incl == 213


def test_extracts_milk_with_quantity(products):
    hits = [p for p in products if "牛乳" in p.name]
    assert hits
    assert hits[0].qty is not None and hits[0].qty.amount == 1000


def test_implausible_price_low_confidence():
    words = [
        Word("ティッシュ", 10, 10, 100, 30, 90.0),
        Word("3円", 10, 50, 60, 40, 90.0),  # 誤読価格 (<10円)
    ]
    out = extract_products(words)
    assert all(p.confidence <= 0.3 for p in out if p.price.amount_incl == 3) or not out


def test_name_near_price_grouped():
    words = [
        Word("りんご", 100, 100, 120, 40, 92.0),
        Word("398円", 100, 160, 100, 50, 95.0),
        Word("遠くの文字", 1200, 900, 100, 40, 90.0),
    ]
    out = extract_products(words)
    assert len(out) == 1
    assert "りんご" in out[0].name
    assert "遠く" not in out[0].name


def test_split_dual_notation_prefers_tax_included_token():
    # 「98円」と「(税込105.84円)」が別トークンに割れた場合も税込を採用する
    words = [
        Word("りんご", 100, 100, 120, 40, 92.0),
        Word("98円", 100, 160, 90, 50, 95.0),
        Word("(税込105.84円)", 100, 220, 180, 36, 93.0),
    ]
    out = extract_products(words)
    assert len(out) == 1
    assert out[0].price.amount_incl == 105.84
    assert out[0].price.tax_status == "included"


def test_huge_price_gets_low_confidence():
    words = [
        Word("高級肉", 10, 10, 100, 30, 90.0),
        Word("999999円", 10, 50, 120, 40, 90.0),
    ]
    out = extract_products(words)
    assert len(out) == 1
    assert out[0].confidence <= 0.2


def test_tiny_price_is_dropped():
    # 10円未満の単独表記はOCRノイズとして拾わない（商品を作らない）
    words = [
        Word("ティッシュ", 10, 10, 100, 30, 90.0),
        Word("3円", 10, 50, 60, 40, 90.0),
    ]
    assert extract_products(words) == []

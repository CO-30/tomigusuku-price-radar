from analyzer.classify import classify
from analyzer.price import Price
from analyzer.quantity import Quantity
from analyzer.unitprice import unit_price


def test_cabbage_per_item():
    up = unit_price(Price(158), Quantity(1, "count", count=1), classify("キャベツ1玉"))
    assert up.value == 158
    assert up.unit_label == "¥/個"


def test_meat_per_100g_passthrough():
    p = Price(98, is_per_100g=True)
    up = unit_price(p, Quantity(100, "g", per_unit_amount=100), classify("豚ロース切身"))
    assert up.value == 98
    assert up.unit_label == "¥/100g"


def test_milk_1l_per_100ml():
    up = unit_price(Price(198), Quantity(1000, "ml"), classify("牛乳"))
    assert round(up.value, 2) == 19.8
    assert up.unit_label == "¥/100ml"


def test_rice_5kg_per_1kg():
    up = unit_price(Price(1980), Quantity(5000, "g"), classify("こしひかり5kg"))
    assert up.value == 396
    assert up.unit_label == "¥/1kg"


def test_eggs_10pack_per_item():
    up = unit_price(Price(213), Quantity(1, "count", count=10), classify("たまご10個入"))
    assert round(up.value, 2) == 21.3
    assert up.unit_label == "¥/個"


def test_unknown_quantity_returns_none():
    assert unit_price(Price(300), None, classify("お刺身盛り合わせ")) is None


def test_vegetables_by_weight_when_grams_known():
    up = unit_price(Price(100), Quantity(500, "g"), classify("もやし"))
    assert up.value == 20
    assert up.unit_label == "¥/100g"


def test_sanity_cap_flags_implausible_unit_price():
    from analyzer.unitprice import UnitPrice, sanity_ok
    # 野菜 9800円/100g はOCR誤読として要確認扱い
    assert sanity_ok(UnitPrice(9800, "¥/100g"), classify("キャベツ")) is False
    assert sanity_ok(UnitPrice(49, "¥/100g"), classify("キャベツ")) is True
    assert sanity_ok(UnitPrice(25, "¥/個"), classify("たまご10個")) is True
    assert sanity_ok(UnitPrice(900, "¥/個"), classify("たまご10個")) is False
    assert sanity_ok(None, classify("キャベツ")) is True

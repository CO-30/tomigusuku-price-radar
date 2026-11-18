from analyzer.quantity import parse_quantity


def q(text):
    return parse_quantity(text)


def test_grams():
    r = q("500g")
    assert (r.amount, r.unit) == (500, "g")


def test_kg_normalized_to_g():
    r = q("1.5kg")
    assert (r.amount, r.unit) == (1500, "g")


def test_ml():
    r = q("350ml")
    assert (r.amount, r.unit) == (350, "ml")


def test_liter_normalized_to_ml():
    r = q("2L")
    assert (r.amount, r.unit) == (2000, "ml")


def test_count_iri():
    r = q("10個入")
    assert (r.amount, r.unit, r.count) == (10, "count", 10)


def test_pack():
    r = q("3パック")
    assert (r.amount, r.unit, r.count) == (3, "count", 3)


def test_pack_with_inner_count():
    r = q("1パック(10個)")
    assert r.unit == "count"
    assert r.count == 10


def test_per_100g():
    r = q("100g当り")
    assert r.per_unit_amount == 100
    assert r.unit == "g"


def test_sheets():
    r = q("5枚入")
    assert (r.amount, r.unit, r.count) == (5, "count", 5)


def test_approx():
    r = q("約300g")
    assert (r.amount, r.unit) == (300, "g")


def test_no_quantity():
    assert q("新鮮でおいしい") is None


def test_size_word_not_quantity():
    assert q("Lサイズ") is None


def test_fullwidth_digits():
    r = q("５００ｇ")
    assert (r.amount, r.unit) == (500, "g")


def test_hitotama():
    r = q("1玉")
    assert (r.amount, r.unit, r.count) == (1, "count", 1)

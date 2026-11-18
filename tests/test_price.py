from analyzer.price import parse_price


def test_plain_yen_is_tax_included_by_default_flag():
    r = parse_price("198円")
    assert r.amount_incl == 198
    assert r.tax_status == "included"


def test_explicit_tax_included():
    r = parse_price("税込213円")
    assert r.amount_incl == 213
    assert r.tax_status == "included"


def test_dual_notation_prefers_included():
    r = parse_price("98円(税込105.84円)")
    assert r.amount_incl == 105.84
    assert r.amount_excl == 98
    assert r.tax_status == "included"


def test_body_price_estimates_8_percent():
    r = parse_price("本体価格98円")
    assert r.amount_excl == 98
    assert round(r.amount_incl, 2) == 105.84
    assert r.tax_status == "estimated"


def test_yen_symbol_with_comma():
    r = parse_price("¥1,980")
    assert r.amount_incl == 1980


def test_trailing_tax_excluded():
    r = parse_price("99円 税抜")
    assert r.amount_excl == 99
    assert round(r.amount_incl, 2) == 106.92
    assert r.tax_status == "estimated"


def test_per_100g_detected():
    r = parse_price("100g当り98円")
    assert r.amount_incl == 98
    assert r.is_per_100g is True


def test_phone_number_rejected():
    assert parse_price("098-850-1234") is None


def test_year_rejected():
    assert parse_price("2026年11月19日") is None


def test_no_price():
    assert parse_price("おすすめ") is None

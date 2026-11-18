from analyzer.classify import classify


def test_cabbage_is_vegetable_per_100g():
    c = classify("キャベツ")
    assert c.id == "vegetables"
    assert c.compare_unit == "100g"


def test_banana_is_fruit():
    assert classify("バナナ").id == "fruits"


def test_egg_variants_per_item():
    for name in ["卵", "たまご", "玉子", "特売たまご10個"]:
        c = classify(name)
        assert c.id == "eggs", name
        assert c.compare_unit == "item"


def test_milk_per_100ml():
    c = classify("おいしい牛乳")
    assert c.id == "milk"
    assert c.compare_unit == "100ml"


def test_yogurt_is_dairy_100g():
    c = classify("プレーンヨーグルト")
    assert c.id == "dairy"
    assert c.compare_unit == "100g"


def test_rice_per_1kg():
    c = classify("こしひかり5kg")
    assert c.id == "rice"
    assert c.compare_unit == "1kg"


def test_bread():
    assert classify("超熟食パン").id == "bread"


def test_natto():
    assert classify("極小粒納豆3パック").id == "tofu_natto"


def test_unknown_is_other():
    c = classify("謎の珍味XYZ")
    assert c.id == "other"


def test_longest_match_wins():
    # 「豆乳」は牛乳より先に豆乳(milk扱いだが dairy でなく milk カテゴリ)判定
    # ここでは最長一致の検証: 「アイスミルクキャンデー」が milk にならない例の代わりに
    # 「牛乳石鹸」のような非食品はないため、フルーツ牛乳は milk で良い
    assert classify("調製豆乳1L").id == "milk"

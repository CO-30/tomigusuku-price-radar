"""単価エンジン。価格+容量+カテゴリ → 比較単価。容量不明なら None（推測禁止）。"""
from __future__ import annotations

from dataclasses import dataclass

from analyzer.classify import Category
from analyzer.price import Price
from analyzer.quantity import Quantity


@dataclass
class UnitPrice:
    value: float
    unit_label: str  # "¥/100g" | "¥/1kg" | "¥/100ml" | "¥/個"


# カテゴリ別の単価上限（これを超える値はOCR誤読の疑いとして要確認に回す）
_CATEGORY_CAPS: dict[str, float] = {
    "vegetables": 3000, "fruits": 3000,   # ¥/100g
    "eggs": 200,                           # ¥/個
    "milk": 300,                           # ¥/100ml
    "rice": 5000,                          # ¥/1kg
    "bread": 1500,                         # ¥/個
}
_LABEL_CAPS: dict[str, float] = {
    "¥/100g": 10000, "¥/100ml": 2000, "¥/個": 5000, "¥/1kg": 20000,
}


def sanity_ok(up: "UnitPrice | None", cat: Category) -> bool:
    """単価がカテゴリとして現実的な範囲か。Falseなら要確認扱いにする。"""
    if up is None:
        return True
    cap = _CATEGORY_CAPS.get(cat.id, _LABEL_CAPS.get(up.unit_label, 99999))
    return up.value <= cap


def unit_price(price: Price, qty: Quantity | None, cat: Category) -> UnitPrice | None:
    if qty is None or price is None:
        return None

    # 100g当り表記はそのまま 100g 単価
    if price.is_per_100g or (qty.per_unit_amount and qty.unit == "g"):
        base = price.amount_incl / (qty.per_unit_amount or 100) * 100
        if cat.compare_unit == "1kg":
            return UnitPrice(round(base * 10, 2), "¥/1kg")
        return UnitPrice(round(base, 2), "¥/100g")

    if qty.unit == "count":
        n = qty.count or qty.amount
        if not n:
            return None
        return UnitPrice(round(price.amount_incl / n, 2), "¥/個")

    if qty.unit == "g":
        if cat.compare_unit == "1kg":
            return UnitPrice(round(price.amount_incl / qty.amount * 1000, 2), "¥/1kg")
        return UnitPrice(round(price.amount_incl / qty.amount * 100, 2), "¥/100g")

    if qty.unit == "ml":
        return UnitPrice(round(price.amount_incl / qty.amount * 100, 2), "¥/100ml")

    return None

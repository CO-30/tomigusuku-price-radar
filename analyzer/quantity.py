"""内容量・個数のパーサ。

チラシの商品テキストから容量(g/ml)・個数を抽出し正規化する。
不明な場合は None を返し、呼び出し側は単価計算をしない（推測禁止）。
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass


@dataclass
class Quantity:
    amount: float          # 正規化後の数量 (g / ml / count)
    unit: str              # "g" | "ml" | "count"
    count: int | None = None          # 個数（countの場合、内訳個数があればそれ）
    per_unit_amount: float | None = None  # 「100g当り」等の単位量表記


# 単位 → (正規化単位, 倍率)
_WEIGHT = {"g": 1, "ｇ": 1, "グラム": 1, "kg": 1000, "ｋｇ": 1000, "キロ": 1000}
_VOLUME = {"ml": 1, "ｍｌ": 1, "cc": 1, "l": 1000, "ｌ": 1000, "リットル": 1000}
_COUNT_WORDS = "個|枚|本|パック|袋|束|玉|尾|切|丁|缶|食|房|株|ケ|コ"

_NUM = r"(\d+(?:\.\d+)?)"

_RE_PER = re.compile(rf"{_NUM}\s*(kg|g|ml|l)\s*(?:当り|当たり|あたり)", re.I)
_RE_WEIGHT = re.compile(rf"(?:約)?{_NUM}\s*(kg|g)(?![a-z])", re.I)
_RE_VOLUME = re.compile(rf"(?:約)?{_NUM}\s*(ml|cc|l)(?![a-z])", re.I)
_RE_COUNT = re.compile(rf"{_NUM}\s*({_COUNT_WORDS})\s*(?:入り?|入)?")
_RE_INNER = re.compile(rf"\(\s*{_NUM}\s*(?:{_COUNT_WORDS})\s*(?:入り?|入)?\s*\)")


def _normalize(text: str) -> str:
    # 全角→半角、小文字化
    t = unicodedata.normalize("NFKC", text)
    return t.replace("Ｌ", "L")


def parse_quantity(text: str) -> Quantity | None:
    if not text:
        return None
    t = _normalize(text)

    # サイズ語（Lサイズ, LL, S玉 等）は容量ではない: 数字を伴わないL/M/Sを除外
    # → 正規表現が数字必須なので「Lサイズ」は自然に落ちるが、"2L" ペット等は volume。
    m = _RE_PER.search(t)
    if m:
        n, u = float(m.group(1)), m.group(2).lower()
        if u in ("kg",):
            return Quantity(amount=n * 1000, unit="g", per_unit_amount=n * 1000)
        if u in ("g",):
            return Quantity(amount=n, unit="g", per_unit_amount=n)
        if u in ("l",):
            return Quantity(amount=n * 1000, unit="ml", per_unit_amount=n * 1000)
        return Quantity(amount=n, unit="ml", per_unit_amount=n)

    m = _RE_WEIGHT.search(t)
    if m:
        n, u = float(m.group(1)), m.group(2).lower()
        return Quantity(amount=n * (1000 if u == "kg" else 1), unit="g")

    m = _RE_VOLUME.search(t)
    if m:
        n, u = float(m.group(1)), m.group(2).lower()
        return Quantity(amount=n * (1000 if u == "l" else 1), unit="ml")

    m = _RE_COUNT.search(t)
    if m:
        outer = int(float(m.group(1)))
        inner = _RE_INNER.search(t)
        count = int(float(inner.group(1))) if inner else outer
        return Quantity(amount=float(outer), unit="count", count=count)

    return None

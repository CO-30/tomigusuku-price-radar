"""価格パーサ。

チラシの価格表記から税込価格を抽出する。
- 税込表記を最優先
- 税抜のみの場合は食品軽減税率8%で換算し tax_status="estimated"
- 電話番号・日付など価格でない数字は除外
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

TAX_RATE = 0.08  # 食品軽減税率


@dataclass
class Price:
    amount_incl: float                 # 税込価格
    amount_excl: float | None = None   # 税抜価格（判明時）
    tax_status: str = "included"       # "included" | "estimated"
    is_per_100g: bool = False


_NUM = r"(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?"

_RE_INCL = re.compile(rf"税込\s*¥?{_NUM}\s*円?")
_RE_EXCL_WORD = re.compile(r"本体価格|税抜|本体")
_RE_PRICE = re.compile(rf"(?:¥|￥){_NUM}|{_NUM}\s*円")
_RE_PHONE = re.compile(r"\d{2,4}-\d{2,4}-\d{3,4}")
_RE_DATE = re.compile(r"\d+\s*年|\d+\s*月\s*\d+\s*日")
_RE_PER100G = re.compile(r"100\s*g\s*(?:当り|当たり|あたり)", re.I)


def _to_float(whole: str, frac: str | None) -> float:
    return float(whole.replace(",", "") + (frac or ""))


def parse_price(text: str) -> Price | None:
    if not text:
        return None
    t = unicodedata.normalize("NFKC", text)

    if _RE_PHONE.search(t) or _RE_DATE.search(t):
        return None

    per100g = bool(_RE_PER100G.search(t))
    incl_m = _RE_INCL.search(t)

    # 税込以外の価格候補（税込部分を除いた残りから探す）
    rest = t[: incl_m.start()] + t[incl_m.end():] if incl_m else t
    other = None
    pm = _RE_PRICE.search(rest)
    if pm:
        groups = [g for g in pm.groups()]
        # _RE_PRICE は2つの数値グループ組を持つ
        if groups[0] is not None:
            other = _to_float(groups[0], groups[1])
        elif groups[2] is not None:
            other = _to_float(groups[2], groups[3])

    if incl_m:
        incl = _to_float(incl_m.group(1), incl_m.group(2))
        return Price(amount_incl=incl, amount_excl=other,
                     tax_status="included", is_per_100g=per100g)

    if other is None:
        return None
    if not (10 <= other <= 999999):
        return None

    if _RE_EXCL_WORD.search(t):
        return Price(amount_incl=round(other * (1 + TAX_RATE), 2),
                     amount_excl=other, tax_status="estimated",
                     is_per_100g=per100g)

    # 表記なしの単独価格は税込とみなす（チラシ総額表示義務）
    return Price(amount_incl=other, tax_status="included", is_per_100g=per100g)

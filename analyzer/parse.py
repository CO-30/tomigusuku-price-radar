"""価格アンカー方式の商品抽出。

OCR 単語列から価格らしきトークンを核にし、近傍の語を商品名・容量として束ねる。
チラシは非定型なため、レイアウト解析よりこの方式が頑健。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from analyzer.ocr import Word
from analyzer.price import Price, parse_price
from analyzer.quantity import Quantity, parse_quantity

# 価格アンカー候補: 「98円」「¥1,980」「税込213円」など
_RE_ANCHOR = re.compile(r"(税込)?[¥￥]?\d[\d,]*(?:\.\d+)?\s*円|[¥￥]\d[\d,]*")

# 名前として無視する語
_RE_NOISE = re.compile(r"^[\d\s,.¥￥円税込抜本体価格当りたあ()（）~〜・|一-]+$")


@dataclass
class RawProduct:
    name: str
    price: Price
    qty: Quantity | None
    confidence: float
    bbox: tuple[int, int, int, int]
    raw_text: str = ""
    name_words: list[Word] = field(default_factory=list)


def _plausible(price: Price) -> bool:
    return 10 <= price.amount_incl <= 99999


def merge_words(words: list[Word]) -> list[Word]:
    """同一行の近接トークンを結合する（Tesseractは「98円」を「98」「円」に割るため）。"""
    if not words:
        return []
    # 行クラスタリング: y中心が高さの6割以内なら同一行
    rows: list[list[Word]] = []
    for w in sorted(words, key=lambda w: (w.y + w.h / 2, w.x)):
        cy = w.y + w.h / 2
        placed = False
        for row in rows:
            rcy = sum(r.y + r.h / 2 for r in row) / len(row)
            rh = max(r.h for r in row)
            if abs(cy - rcy) <= max(rh, w.h) * 0.6:
                row.append(w)
                placed = True
                break
        if not placed:
            rows.append([w])

    merged: list[Word] = []
    for row in rows:
        row.sort(key=lambda w: w.x)
        cur: Word | None = None
        for w in row:
            if cur is None:
                cur = Word(w.text, w.x, w.y, w.w, w.h, w.conf)
                continue
            gap = w.x - (cur.x + cur.w)
            if gap <= max(cur.h, w.h) * 0.8:
                right = max(cur.x + cur.w, w.x + w.w)
                bottom = max(cur.y + cur.h, w.y + w.h)
                top = min(cur.y, w.y)
                cur = Word(cur.text + w.text, cur.x, top,
                           right - cur.x, bottom - top,
                           min(cur.conf, w.conf) if w.conf > 0 else cur.conf)
            else:
                merged.append(cur)
                cur = Word(w.text, w.x, w.y, w.w, w.h, w.conf)
        if cur:
            merged.append(cur)
    return merged


def extract_products(
    words: list[Word],
    x_range: int = 300,
    y_up: int = 160,
    y_down: int = 80,
) -> list[RawProduct]:
    words = merge_words(words)
    anchors: list[tuple[Word, Price]] = []
    for w in words:
        if _RE_ANCHOR.search(w.text):
            p = parse_price(w.text)
            if p:
                anchors.append((w, p))

    used: set[int] = set()
    consumed_anchors: set[int] = set()
    products: list[RawProduct] = []
    for aw, price in anchors:
        if id(aw) in consumed_anchors:
            continue
        # 近傍語収集: 価格の上方・左右にある語を名前/容量候補に
        cx, cy = aw.x + aw.w // 2, aw.y
        group: list[Word] = []
        for i, w in enumerate(words):
            if w is aw:
                continue
            wx = w.x + w.w // 2
            if abs(wx - cx) <= x_range and -y_up <= (cy - (w.y + w.h)) <= y_up \
                    and (w.y - (aw.y + aw.h)) <= y_down:
                if id(w) in used:
                    continue
                group.append(w)

        group.sort(key=lambda w: (w.y, w.x))
        name_parts: list[str] = []
        qty: Quantity | None = None
        confs = [aw.conf]
        for w in group:
            # 分割トークン化した税込表記（例:「98円」の下の「(税込105.84円)」）は
            # 本体価格と統合し、税込を正とする
            if ("税込" in w.text and "税込" not in aw.text
                    and _RE_ANCHOR.search(w.text)):
                pp = parse_price(w.text)
                if pp:
                    price = Price(amount_incl=pp.amount_incl,
                                  amount_excl=price.amount_incl,
                                  tax_status="included",
                                  is_per_100g=price.is_per_100g)
                    consumed_anchors.add(id(w))
                    used.add(id(w))
                    confs.append(w.conf)
                    continue
            q = parse_quantity(w.text)
            if q and qty is None:
                qty = q
                confs.append(w.conf)
                used.add(id(w))
                continue
            if _RE_ANCHOR.search(w.text) or _RE_NOISE.match(w.text):
                continue
            name_parts.append(w.text)
            confs.append(w.conf)
            used.add(id(w))

        name = "".join(name_parts).strip()
        if not name:
            continue
        # 名前自体に容量が含まれる場合（例: こしひかり5kg）
        if qty is None:
            qty = parse_quantity(name)

        conf = (sum(confs) / len(confs)) / 100.0
        if not _plausible(price):
            conf = min(conf, 0.2)

        x0 = min([aw.x] + [w.x for w in group]) if group else aw.x
        y0 = min([aw.y] + [w.y for w in group]) if group else aw.y
        x1 = max([aw.x + aw.w] + [w.x + w.w for w in group]) if group else aw.x + aw.w
        y1 = max([aw.y + aw.h] + [w.y + w.h for w in group]) if group else aw.y + aw.h

        products.append(RawProduct(
            name=name, price=price, qty=qty, confidence=round(conf, 3),
            bbox=(x0, y0, x1 - x0, y1 - y0),
            raw_text=" ".join([w.text for w in group] + [aw.text]),
        ))
    return products

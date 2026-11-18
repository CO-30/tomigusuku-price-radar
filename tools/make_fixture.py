"""テスト用の合成チラシ画像を生成する。

実チラシの代わりに、日本語フォントで商品名・容量・価格を描いた画像を作り、
OCR→抽出パイプラインの検証に使う。
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
]


def find_font() -> str:
    for p in FONT_CANDIDATES:
        if Path(p).exists():
            return p
    raise RuntimeError("日本語フォントが見つかりません")


# (商品名, 容量表記, 価格表記) を格子状に描く
DEFAULT_ITEMS = [
    ("キャベツ", "1玉", "98円"),
    ("特売たまご", "10個入", "税込213円"),
    ("おいしい牛乳", "1000ml", "198円"),
    ("こしひかり", "5kg", "1980円"),
    ("豚ロース切身", "100g当り", "128円"),
    ("プレーンヨーグルト", "400g", "138円"),
]


def make_flyer(out: Path, items=None, size=(1400, 1000)) -> Path:
    items = items or DEFAULT_ITEMS
    img = Image.new("RGB", size, "white")
    d = ImageDraw.Draw(img)
    font_path = find_font()
    f_name = ImageFont.truetype(font_path, 44)
    f_qty = ImageFont.truetype(font_path, 34)
    f_price = ImageFont.truetype(font_path, 60)

    cols = 2
    cw, ch = size[0] // cols, 300
    for i, (name, qty, price) in enumerate(items):
        x = (i % cols) * cw + 40
        y = (i // cols) * ch + 40
        d.rectangle([x - 20, y - 20, x + cw - 60, y + ch - 60], outline="#cccccc", width=2)
        d.text((x, y), name, fill="black", font=f_name)
        d.text((x, y + 70), qty, fill="#333333", font=f_qty)
        d.text((x, y + 130), price, fill="#cc0000", font=f_price)

    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    return out


if __name__ == "__main__":
    dest = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("tests/fixtures/flyer1.png")
    print(make_flyer(dest))

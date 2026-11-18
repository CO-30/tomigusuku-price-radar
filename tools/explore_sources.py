"""robots許可済みソースのページ構造調査（GitHub Actions上で実行）。

チラシ画像・店舗ページへ辿るためのリンク構造を出力する。
robots.txt が拒否するサイトには触れない。
"""
from __future__ import annotations

import re
import sys
import time

import requests

from collector.robots import USER_AGENT, check_robots

TARGETS = [
    ("ryubo_top", "https://ryubostore.jp/"),
    ("gyomu_shoplist", "https://www.gyomusuper.jp/shop/?pref=沖縄県"),
    ("donki_store_search", "https://www.donki.com/store/shop_list.php?pref=沖縄県"),
    ("ja_okinawa_top", "https://www.ja-okinawa.or.jp/"),
    ("aeon_store_list", "https://www.aeon-ryukyu.jp/store/"),
]

PAT = re.compile(
    r'href="([^"]*)"[^>]*>([^<]{0,40}(?:チラシ|ちらし|店舗|特売|セール|leaflet|'
    r'flyer|chirashi|shop|store)[^<]{0,40})',
    re.I)
IMG = re.compile(r'(?:src|href)="([^"]*(?:chirashi|flyer|leaflet|tokubai)[^"]*)"', re.I)


def dump(name: str, url: str) -> None:
    print(f"\n===== {name}: {url}")
    if not check_robots(url):
        print("  robots NG — スキップ")
        return
    try:
        time.sleep(2)
        r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=25)
        print(f"  HTTP {r.status_code} / {len(r.text)} bytes / final={r.url}")
        if r.status_code != 200:
            return
        html = r.text
        seen = set()
        for m in PAT.finditer(html):
            href, text = m.group(1), re.sub(r"\s+", " ", m.group(2)).strip()
            key = (href, text)
            if key in seen:
                continue
            seen.add(key)
            print(f"  LINK {href}  |  {text}")
            if len(seen) > 60:
                break
        for m in IMG.finditer(html):
            print(f"  IMGREF {m.group(1)}")
    except Exception as e:
        print(f"  ERR {type(e).__name__}: {e}")


if __name__ == "__main__":
    urls = sys.argv[1:]
    if urls:
        for i, u in enumerate(urls):
            dump(f"arg{i}", u)
    else:
        for name, url in TARGETS:
            dump(name, url)

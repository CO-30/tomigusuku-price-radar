"""公式チラシソースの到達性調査。GitHub Actions 上で実行する。

各チェーンの候補URLについて robots.txt の判定と HTTP ステータスを記録し、
auto 昇格の判断材料にする。
"""
from __future__ import annotations

from collector.robots import USER_AGENT, check_robots

CANDIDATES = [
    ("sanei", "https://www.san-a.co.jp/"),
    ("union", "http://www.uniondayo.jp/"),
    ("kanehide", "https://www.kanehide-sj.co.jp/"),
    ("aeon_ryukyu", "https://www.aeon-ryukyu.jp/flyer/"),
    ("ryubo", "https://ryubostore.jp/"),
    ("direx", "https://www.direx.co.jp/flyer/"),
    ("gyomu", "https://www.gyomusuper.jp/shop/"),
    ("donki", "https://www.donki.com/"),
    ("acoop_okinawa", "https://www.ja-okinawa.or.jp/"),
]


def main() -> None:
    import requests
    print(f"UA: {USER_AGENT}")
    for name, url in CANDIDATES:
        allowed = check_robots(url)
        status = "-"
        if allowed:
            try:
                r = requests.get(url, headers={"User-Agent": USER_AGENT},
                                 timeout=20)
                status = str(r.status_code)
            except Exception as e:
                status = f"ERR {type(e).__name__}"
        print(f"{name:14s} robots={'OK' if allowed else 'NG':3s} "
              f"http={status:8s} {url}")


if __name__ == "__main__":
    main()

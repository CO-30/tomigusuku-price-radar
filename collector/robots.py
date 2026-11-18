"""robots.txt 実行時判定。拒否されたソースは取得しない（規約遵守を構造化）。"""
from __future__ import annotations

import urllib.error
import urllib.request
import urllib.robotparser
from urllib.parse import urlsplit

USER_AGENT = ("TomigusukuPriceRadar/1.0 "
              "(+https://github.com/tomishirokharea/price-radar; personal use)")

_cache: dict[str, urllib.robotparser.RobotFileParser] = {}


def check_robots(url: str, ua: str = USER_AGENT, timeout: int = 15) -> bool:
    """url の取得が robots.txt 上許可されているか。

    robots.txt が取得できない(404等)場合は慣例に従い許可とみなすが、
    接続自体の失敗は False（安全側）。
    """
    parts = urlsplit(url)
    base = f"{parts.scheme}://{parts.netloc}"
    rp = _cache.get(base)
    if rp is None:
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(f"{base}/robots.txt")
        try:
            req = urllib.request.Request(f"{base}/robots.txt",
                                         headers={"User-Agent": ua})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                if r.status >= 400:
                    rp.allow_all = True
                else:
                    rp.parse(r.read().decode("utf-8", "replace").splitlines())
        except Exception as e:  # 4xx は許可扱い、接続不能は拒否扱い
            if isinstance(e, urllib.error.HTTPError) and 400 <= e.code < 500:
                rp.allow_all = True
            else:
                return False
        _cache[base] = rp
    return rp.can_fetch(ua, url)

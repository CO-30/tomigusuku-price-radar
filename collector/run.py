"""収集オーケストレータ。

- auto ソース: robots.txt 判定 → 許可時のみ取得（2秒間隔・UA明示）
- manual ソース: inbox/<store_id>/ の投入ファイルを取込
- 店舗ごとに FetchResult(status) を返す。1店舗の失敗は他店舗を止めない。
"""
from __future__ import annotations

import re
import shutil
import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

import yaml

from collector.robots import USER_AGENT, check_robots

STORES_YAML = Path(__file__).parent / "stores.yaml"
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".pdf"}

# ファイル名 YYYY-MM-DD_YYYY-MM-DD.* → (開始, 終了)
_RE_PERIOD = re.compile(r"(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})")


@dataclass
class FetchResult:
    store_id: str
    status: str  # ok | failed | blocked | no_flyer | unsupported | manual
    files: list[dict] = field(default_factory=list)
    detail: str = ""


def load_stores(path: Path = STORES_YAML) -> list[dict]:
    return yaml.safe_load(path.read_text(encoding="utf-8"))["stores"]


def _collect_inbox(store: dict, today: date, raw_dir: Path,
                   inbox_dir: Path) -> FetchResult:
    sid = store["id"]
    src = inbox_dir / sid
    files = []
    if src.is_dir():
        for f in sorted(src.iterdir()):
            if f.suffix.lower() not in IMAGE_EXTS:
                continue
            m = _RE_PERIOD.search(f.name)
            if m:
                ps, pe, est = m.group(1), m.group(2), False
            else:
                ps = today.isoformat()
                pe = (today + timedelta(days=3)).isoformat()
                est = True
            dest = raw_dir / today.isoformat() / sid / f.name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, dest)
            files.append({"path": str(dest), "period_start": ps,
                          "period_end": pe, "period_estimated": est,
                          "source_url": None})
    if not files:
        return FetchResult(sid, "no_flyer", detail="inboxに投入なし")
    return FetchResult(sid, "manual", files=files,
                       detail=f"inbox {len(files)}件")


def _collect_auto(store: dict, today: date, raw_dir: Path) -> FetchResult:
    import requests
    sid = store["id"]
    url = store.get("source", {}).get("url")
    if not url:
        return FetchResult(sid, "unsupported", detail="URL未設定")
    if not check_robots(url):
        return FetchResult(sid, "blocked", detail="robots.txt により拒否")
    try:
        time.sleep(2)  # 礼儀的间隔
        r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
        r.raise_for_status()
        # アダプタ拡張点: 現状は取得ページ内の画像/PDFリンク収集は店舗別アダプタに委ねる。
        # 汎用実装としてページ本体のみ保存し、画像抽出アダプタ未実装なら unsupported。
        adapter = store.get("source", {}).get("adapter")
        if not adapter:
            return FetchResult(sid, "unsupported",
                               detail="取得は可能だが解析アダプタ未実装")
        return FetchResult(sid, "failed", detail=f"未知のアダプタ: {adapter}")
    except Exception as e:
        return FetchResult(sid, "failed", detail=str(e)[:200])


def collect_all(today: date, raw_dir: Path,
                inbox_dir: Path = Path("inbox"),
                stores: list[dict] | None = None) -> list[FetchResult]:
    stores = stores if stores is not None else load_stores()
    results: list[FetchResult] = []
    for store in stores:
        try:
            stype = store.get("source", {}).get("type", "manual")
            if stype == "auto":
                res = _collect_auto(store, today, raw_dir)
                # auto で何も取れなくても inbox に投入があれば拾う
                if res.status in ("blocked", "unsupported", "failed"):
                    ib = _collect_inbox(store, today, raw_dir, inbox_dir)
                    if ib.status == "manual":
                        ib.detail += f" (auto: {res.status})"
                        res = ib
            else:
                res = _collect_inbox(store, today, raw_dir, inbox_dir)
        except Exception as e:
            res = FetchResult(store["id"], "failed", detail=str(e)[:200])
        results.append(res)
    return results

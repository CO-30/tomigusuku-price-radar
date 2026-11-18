"""商品名→カテゴリ分類。YAML辞書のキーワード最長一致。"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

_YAML = Path(__file__).parent / "categories.yaml"


@dataclass
class Category:
    id: str
    label: str
    compare_unit: str  # "100g" | "1kg" | "100ml" | "item"


_cache: dict | None = None


def _load() -> dict:
    global _cache
    if _cache is None:
        raw = yaml.safe_load(_YAML.read_text(encoding="utf-8"))["categories"]
        _cache = raw
    return _cache


def classify(name: str) -> Category:
    cats = _load()
    best: tuple[int, str] | None = None
    for cid, spec in cats.items():
        for kw in spec.get("keywords") or []:
            if kw and kw in name:
                if best is None or len(kw) > best[0]:
                    best = (len(kw), cid)
    cid = best[1] if best else "other"
    spec = cats[cid]
    return Category(id=cid, label=spec["label"], compare_unit=spec["compare_unit"])

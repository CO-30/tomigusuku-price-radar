"""OCR: チラシ画像/PDF → 座標付き単語リスト。

Tesseract (jpn) + OpenCV 前処理。PDF は PyMuPDF があればそれで、
なければ pdftoppm で画像化する。
"""
from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import pytesseract


@dataclass
class Word:
    text: str
    x: int
    y: int
    w: int
    h: int
    conf: float


def preprocess(img: np.ndarray) -> np.ndarray:
    """グレースケール化・拡大・コントラスト強調。チラシの小さい文字対策。"""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    h, w = gray.shape[:2]
    if max(h, w) < 2000:
        scale = 2000 / max(h, w)
        gray = cv2.resize(gray, (int(w * scale), int(h * scale)),
                          interpolation=cv2.INTER_CUBIC)
    gray = cv2.fastNlMeansDenoising(gray, h=8)
    return gray


def ocr_image(path: Path, lang: str = "jpn") -> list[Word]:
    img = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"画像を読めません: {path}")
    proc = preprocess(img)
    scale_x = img.shape[1] / proc.shape[1]
    scale_y = img.shape[0] / proc.shape[0]

    data = pytesseract.image_to_data(
        proc, lang=lang, config="--psm 11",
        output_type=pytesseract.Output.DICT,
    )
    words: list[Word] = []
    for i, text in enumerate(data["text"]):
        t = (text or "").strip()
        if not t:
            continue
        conf = float(data["conf"][i])
        if conf < 0:
            continue
        words.append(Word(
            text=t,
            x=int(data["left"][i] * scale_x),
            y=int(data["top"][i] * scale_y),
            w=max(1, int(data["width"][i] * scale_x)),
            h=max(1, int(data["height"][i] * scale_y)),
            conf=conf,
        ))
    return words


def pdf_to_images(path: Path, out_dir: Path, dpi: int = 200) -> list[Path]:
    """PDF→PNG。PyMuPDF 優先、なければ poppler (pdftoppm)。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(path)
        outs = []
        for i, page in enumerate(doc):
            pix = page.get_pixmap(dpi=dpi)
            p = out_dir / f"{path.stem}_p{i + 1}.png"
            pix.save(str(p))
            outs.append(p)
        return outs
    except ImportError:
        if not shutil.which("pdftoppm"):
            raise RuntimeError("PyMuPDF も pdftoppm もありません")
        subprocess.run(
            ["pdftoppm", "-png", "-r", str(dpi), str(path),
             str(out_dir / path.stem)],
            check=True, capture_output=True,
        )
        return sorted(out_dir.glob(f"{path.stem}*.png"))

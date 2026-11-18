from pathlib import Path

import pytest

from analyzer.ocr import ocr_image
from tools.make_fixture import make_flyer

FIXTURE = Path(__file__).parent / "fixtures" / "flyer1.png"


@pytest.fixture(scope="module")
def flyer() -> Path:
    if not FIXTURE.exists():
        make_flyer(FIXTURE)
    return FIXTURE


def test_ocr_reads_product_name(flyer):
    words = ocr_image(flyer)
    texts = "".join(w.text for w in words)
    assert "キャベツ" in texts


def test_ocr_reads_price_digits(flyer):
    words = ocr_image(flyer)
    texts = [w.text for w in words]
    assert any("98" in t for t in texts)


def test_words_have_positions(flyer):
    words = ocr_image(flyer)
    assert all(w.w > 0 and w.h > 0 for w in words)
    assert any(w.conf > 50 for w in words)

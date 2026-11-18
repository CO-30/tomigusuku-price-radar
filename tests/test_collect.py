import threading
from datetime import date
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

from collector.run import collect_all, load_stores
from collector.robots import check_robots


class Handler(BaseHTTPRequestHandler):
    ROBOTS = "User-agent: *\nDisallow: /private/\n"

    def do_GET(self):
        if self.path == "/robots.txt":
            body = self.ROBOTS.encode()
            self.send_response(200)
        elif self.path.endswith(".png"):
            body = b"\x89PNG fake"
            self.send_response(200)
        else:
            body = b"<html>flyer page</html>"
            self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


@pytest.fixture(scope="module")
def server():
    srv = HTTPServer(("127.0.0.1", 0), Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{srv.server_port}"
    srv.shutdown()


def test_robots_allows_public(server):
    assert check_robots(f"{server}/flyer/today", "TestUA") is True


def test_robots_blocks_private(server):
    assert check_robots(f"{server}/private/x", "TestUA") is False


def test_stores_yaml_loads():
    stores = load_stores()
    ids = [s["id"] for s in stores]
    assert "union_tomigusuku" in ids
    assert len(stores) >= 16
    assert all(s.get("source", {}).get("type") in ("auto", "manual") for s in stores)


def test_inbox_collected_as_manual(tmp_path):
    inbox = tmp_path / "inbox" / "union_tomigusuku"
    inbox.mkdir(parents=True)
    (inbox / "2026-11-19_2026-11-21.png").write_bytes(b"img")
    raw = tmp_path / "raw"
    results = collect_all(date(2026, 11, 19), raw, inbox_dir=tmp_path / "inbox",
                          stores=[{"id": "union_tomigusuku",
                                   "name": "ユニオン豊見城店",
                                   "source": {"type": "manual"}}])
    r = results[0]
    assert r.status == "manual"
    assert len(r.files) == 1
    assert r.files[0]["period_end"] == "2026-11-21"
    assert r.files[0]["period_estimated"] is False
    copied = Path(r.files[0]["path"])
    assert copied.exists() and raw in copied.parents


def test_inbox_without_period_estimates_3days(tmp_path):
    inbox = tmp_path / "inbox" / "union_tomigusuku"
    inbox.mkdir(parents=True)
    (inbox / "photo.jpg").write_bytes(b"img")
    results = collect_all(date(2026, 11, 19), tmp_path / "raw",
                          inbox_dir=tmp_path / "inbox",
                          stores=[{"id": "union_tomigusuku",
                                   "name": "ユニオン豊見城店",
                                   "source": {"type": "manual"}}])
    f = results[0].files[0]
    assert f["period_end"] == "2026-11-22"
    assert f["period_estimated"] is True


def test_manual_store_without_inbox_is_no_flyer(tmp_path):
    results = collect_all(date(2026, 11, 19), tmp_path / "raw",
                          inbox_dir=tmp_path / "inbox",
                          stores=[{"id": "union_tomigusuku",
                                   "name": "ユニオン豊見城店",
                                   "source": {"type": "manual"}}])
    assert results[0].status == "no_flyer"


def test_auto_store_blocked_by_robots(server, tmp_path):
    results = collect_all(date(2026, 11, 19), tmp_path / "raw",
                          inbox_dir=tmp_path / "inbox",
                          stores=[{"id": "x", "name": "X",
                                   "source": {"type": "auto",
                                              "url": f"{server}/private/flyer"}}])
    assert results[0].status == "blocked"

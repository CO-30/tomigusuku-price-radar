# TOMIGUSUKU PRICE RADAR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 毎朝7時(JST)にチラシ収集→OCR→単価ランキング→GitHub Pages 更新まで全自動で完了する完全無料システム。

**Architecture:** Python パイプライン（collector→analyzer→SQLite→JSON export）を GitHub Actions cron で実行し、React+Vite の静的フロントエンドを GitHub Pages に配信。手動投入 inbox を同一パイプラインで処理。

**Tech Stack:** Python 3.12, pytesseract/Tesseract5(jpn), OpenCV, PyMuPDF, PyYAML, requests, pytest / React 18 + Vite + TypeScript

**Spec:** docs/superpowers/specs/2026-11-19-price-radar-design.md

## Global Constraints

- 有料サービス・新規契約・外部APIキー一切なし。依存は pypi/npm の OSS のみ。
- 容量不明の商品の単価を推測しない（unit_price = null）。
- 税率は食品 8%。税抜のみの価格は `tax_status="estimated"` で税込換算。
- 比較単位: 野菜果物=100g / 卵=1個 / 牛乳・飲料=100ml / 米=1kg / 豆腐・納豆・ヨーグルト=100g / その他=100g,100ml,1個のいずれか。
- UA: `TomigusukuPriceRadar/1.0 (+https://github.com/tomishirokharea/price-radar; personal use)`、リクエスト間隔 >= 2秒。
- robots.txt が拒否するソースは取得しない（状態 `blocked`）。
- cron: `30 20 * * *` と再試行 `30 21 * * *`（JST 05:30 / 06:30）。
- 店舗状態の値: `ok | failed | blocked | no_flyer | unsupported | manual`。

## Review Focus

1. OCRが価格を誤読（8↔9, 1↔7等）→ 不自然価格検出（<10円 or >99999円、野菜>¥5000/100g等）で要確認行き。test_parse に含む。
2. 税込と税抜の二重表記 `98円(税込105.84円)` → 税込を採用し重複商品を作らない。test_price に含む。
3. 期限切れチラシ（特売期間終了）が当日ランキングに混入 → export 時に期間フィルタ。test_db に含む。
4. 同一店舗の同一商品が複数チラシで重複 → (store,name,price,期間) で重複排除。test_db に含む。
5. inbox のファイル名が規約外（期間なし）→ 取得日から+3日を期間とみなし `period_estimated` を付ける。test_collect に含む。

---

### Task 1: 数量パーサ `analyzer/quantity.py`

**Interfaces:**
- Produces: `parse_quantity(text: str) -> Quantity | None`、`Quantity(amount: float, unit: str, count: int | None, per_unit_amount: float | None)`。unit は `"g" | "ml" | "count"` に正規化（kg→g, L→ml, 個/枚/本/パック/袋/束/玉/尾/切→count）。
- Test: `tests/test_quantity.py`

- [x] 失敗するテストを書く: `500g`→(500,g), `1.5kg`→(1500,g), `350ml`, `2L`→(2000,ml), `10個入`→(10,count), `3パック`, `1パック(10個)`→count=10, `100g当り`→per-100g フラグ, `5枚入`, `約300g`, 容量なし→None, `Lサイズ`→None（サイズ語を容量と誤認しない）
- [x] 実装し pytest 緑化、コミット

### Task 2: 価格パーサ `analyzer/price.py`

**Interfaces:**
- Produces: `parse_price(text: str) -> Price | None`、`Price(amount_incl: float, amount_excl: float | None, tax_status: "included"|"estimated", is_per_100g: bool)`
- Test: `tests/test_price.py`

- [x] テスト: `198円`→included 198, `税込213円`, `98円(税込105.84円)`→105.84 を採用, `本体価格98円`→estimated 105.84, `¥1,980`, `99円 税抜`→106.92, 100g当り表記の検出, 電話番号/年号を価格と誤認しない
- [x] 実装・緑化・コミット

### Task 3: 分類辞書 `analyzer/classify.py` + `analyzer/categories.yaml`

**Interfaces:**
- Produces: `classify(name: str) -> Category`、`Category(id: str, label: str, compare_unit: "100g"|"1kg"|"100ml"|"item")`。カテゴリID: vegetables, fruits, eggs, milk, dairy, rice, bread, tofu_natto, noodles, seasoning, canned, frozen, processed, other。
- Test: `tests/test_classify.py`

- [x] テスト: キャベツ→vegetables/100g, バナナ→fruits, 卵/たまご/玉子→eggs/item, 牛乳→milk/100ml, ヨーグルト→dairy/100g, こしひかり5kg→rice/1kg, 食パン→bread, 納豆→tofu_natto, 不明語→other
- [x] 実装（YAML辞書 + 最長一致）・緑化・コミット

### Task 4: 単価エンジン `analyzer/unitprice.py`

**Interfaces:**
- Consumes: Quantity, Price, Category
- Produces: `unit_price(price: Price, qty: Quantity | None, cat: Category) -> UnitPrice | None`、`UnitPrice(value: float, unit_label: str)`（例 (39.6,"¥/100g")）。qty None → None。count 商品は ¥/個。100g当り価格はそのまま採用。
- Test: `tests/test_unitprice.py`

- [x] テスト: キャベツ1玉158円→¥/個, 豚肉100g当り98円→98, 牛乳1L 198円→19.8/100ml, 米5kg 1980円→396/1kg, 卵10個 213円→21.3/個, 容量不明→None
- [x] 実装・緑化・コミット

### Task 5: OCR `analyzer/ocr.py` + 合成チラシ生成 `tools/make_fixture.py`

**Interfaces:**
- Produces: `ocr_image(path: Path) -> list[Word]`（Word(text,x,y,w,h,conf)）、`pdf_to_images(path: Path, out_dir: Path) -> list[Path]`、前処理 `preprocess(img) -> img`（グレースケール+拡大+二値化）。
- Test: `tests/test_ocr.py`（合成チラシ: 日本語フォントで「キャベツ 1玉 98円」等を描画した画像）

- [x] フォント確保（Noto Sans CJK を GitHub release から取得 or システム内探索）
- [x] fixture 生成スクリプト→テスト: 合成画像から「キャベツ」「98」が読めること
- [x] 実装・緑化・コミット

### Task 6: 商品抽出 `analyzer/parse.py`

**Interfaces:**
- Consumes: Task1,2,5
- Produces: `extract_products(words: list[Word]) -> list[RawProduct]`（RawProduct(name,price:Price,qty,confidence:float,bbox)）。価格アンカー: 価格正規表現に合う語を核に、近傍（x±300px,y±80px目安）の語を名前候補として結合。不自然価格（<10, >99999）は confidence 0.2 以下。
- Test: `tests/test_parse.py`（合成チラシのWord列→2商品が正しい価格で出る、誤読価格が弾かれる）

- [x] テスト→実装・緑化・コミット

### Task 7: ストレージ `storage/db.py`

**Interfaces:**
- Produces: `init_db(path) -> Connection`; テーブル `stores(id,name,area,chain,source_type,url)`, `flyers(id,store_id,date,image_path,source_url,period_start,period_end,period_estimated)`, `products(id,flyer_id,store_id,name,category,price_incl,price_excl,tax_status,qty_amount,qty_unit,qty_count,unit_price,unit_label,confidence,needs_review,date)`, `fetch_log(store_id,date,status,detail)`; `upsert_products(conn, items) -> int`（重複排除 key=(store_id,name,price_incl,period_end)）; `ranking(conn, date, category=None) -> list[dict]`（needs_review 除外・期間内のみ・unit_price 昇順、unit_priceなしは価格昇順で末尾）; `price_stats(conn, name, store_id) -> dict`（前回価格・7日/30日最安・30日平均）。
- Test: `tests/test_db.py`

- [x] テスト: 重複2回投入→1件 / 期限切れがrankingに出ない / 履歴統計値 / needs_review除外
- [x] 実装・緑化・コミット

### Task 8: 収集 `collector/`（robots判定・取得・inbox）

**Interfaces:**
- Produces: `collector/stores.yaml`（§3の16店舗+ chain,area,source: {type: auto|manual, url}）; `check_robots(url, ua) -> bool`; `collect_all(date, raw_dir) -> list[FetchResult]`（FetchResult(store_id,status,files,detail)）。auto かつ robots NG → `blocked`。inbox/<store_id>/ のファイルを取込み `manual`、ファイル名 `YYYY-MM-DD_YYYY-MM-DD` から期間、なければ period_estimated=+3日。
- Test: `tests/test_collect.py`（ローカルHTTPサーバで robots 拒否/許可、inbox取込、期間推定）

- [x] テスト→実装・緑化・コミット

### Task 9: パイプライン `pipeline.py` + JSON export

**Interfaces:**
- Consumes: Task5-8
- Produces: `run(date=today) -> Report`; data/public/ に `summary.json`（日付,更新時刻,店舗数,成功数,商品数,店舗状態一覧）, `ranking.json`（全体+カテゴリ別、各商品にチラシ画像パス・店舗・期間・単価・お買い得判定: 30日平均比-10%以下&30日最安圏）, `history.json`（商品別時系列）, `review.json`（要確認）。チラシ画像は `data/flyers/<date>/<store>/` にコピーし Pages から参照可能に。
- Test: `tests/test_pipeline.py`（inbox にサンプル合成チラシ→run→JSON3種が整合）

- [x] テスト→実装・緑化・コミット

### Task 10: フロントエンド `frontend/`（React+Vite+TS）

**Interfaces:**
- Consumes: data/public/*.json（ビルド時に frontend/public/data へ同期）
- Produces: モバイル最優先 SPA。画面: ホーム（日付/更新時刻/店舗取得状況/最安ランキング/注目=お買い得）、カテゴリタブ、並べ替え（単価/価格/店舗/終了日）、商品カード（単価強調・店舗・期間・条件・チラシ画像リンク・履歴ミニグラフ）、お気に入り(⭐)、買い物リスト（店舗別集計+合計額+最安店舗表示）、設定（目標価格アラート）。localStorage キー: `pr:favorites`, `pr:shoplist`, `pr:alerts`。
- ビルド: `vite build --base=/price-radar/`

- [x] 雛形作成（vite react-ts, 依存最小）
- [x] データ層+画面実装（frontend-design スキル適用、テンプレ感を避ける）
- [x] `npm run build` 成功・コミット

### Task 11: GitHub Actions `.github/workflows/`

**Interfaces:**
- Produces: `daily.yml`: cron 20:30/21:30 UTC + workflow_dispatch。手順: checkout→当日成功マーカー(data/last_success)確認（再試行時スキップ）→apt: tesseract-ocr tesseract-ocr-jpn poppler-utils→pip install→pipeline 実行→data コミット&push→frontend build→Pages deploy（actions/upload-pages-artifact + deploy-pages）。失敗時も fetch_log コミット。`probe.yml`(dispatch): 各ソースの robots/到達性レポートを artifact 出力。
- 権限: `contents: write, pages: write, id-token: write`

- [x] 作成・YAML 構文検証（python yaml.safe_load）・コミット

### Task 12: 統合検証と最終化

- [x] 全テスト一括 PASS
- [x] 合成+撮影劣化シミュレーション画像での end-to-end 実行、JSON整合確認（フロントの実表示確認はサンドボックスにブラウザがないため、デプロイ後に実機で実施）
- [x] README（運用方法・手動投入手順・メンテ方法）
- [ ] リポジトリ push、Pages 有効化、workflow_dispatch で実機検証、cron 実行確認 ← **要ユーザー権限（リポジトリ作成）**

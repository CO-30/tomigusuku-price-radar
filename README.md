# 特売レーダー（TOMIGUSUKU PRICE RADAR）

沖縄県豊見城市周辺のスーパーの特売チラシを毎朝自動処理し、容量・個数を解析して
**実質単価（¥/100g・¥/100ml・¥/個 など）の安い順**に横断比較する個人向けWebアプリ。

- 公開URL: https://tomishirokharea.github.io/price-radar/
- 完全無料運用（GitHub Actions + GitHub Pages + SQLite。外部契約・APIキーなし）
- 毎朝 05:30 JST に収集・解析、06:30 に自動リトライ、7時までにランキング更新

## 仕組み

```
GitHub Actions (毎朝)
  collector  … robots.txt を実行時判定し、許可されたソースのみ自動取得
               + inbox/ に投入された手動チラシを取込
  analyzer   … Tesseract(日本語) OCR → 価格アンカー方式で商品抽出
               → 容量・税(8%)・分類 → 単価計算 → 信頼度付与
  storage    … SQLite (data/radar.sqlite) に価格履歴を蓄積（gitが履歴バックアップ）
  export     … data/public/*.json → React フロントエンドを GitHub Pages へ
```

読取信頼度が低い商品は「要確認」としてランキングから除外されます。
容量が読み取れない商品の単価は**推測せず**、売価のみで表示します。

## チラシの手動投入（最重要の運用）

沖縄の主要チェーン（ユニオン・かねひで・サンエー・イオン琉球系・ダイレックス等）の
Webチラシは、robots.txt 等で自動収集が許可されていません（2026-11 調査）。
そのため**チラシの撮影画像・スクリーンショットの手動投入が主力のデータ源**です。

1. チラシをスマホで撮影（新聞折込・店頭チラシ・公式アプリのスクショ）
2. GitHub のこのリポジトリで `inbox/<店舗ID>/` を開く（店舗IDは `collector/stores.yaml`）
3. 「Add file → Upload files」で画像をアップロード
   - ファイル名を `2026-11-19_2026-11-21.jpg`（開始日_終了日）にすると特売期間に反映
   - 名前が自由形式なら「投入日+3日」を期間として推定表示
4. 翌朝の自動実行で解析・反映（すぐ反映したい場合は Actions → daily-update → Run workflow）

処理済みの inbox ファイルは残しても問題ありません（重複は自動排除）。

## 自動取得の拡大

`.github/workflows/probe.yml`（Actions → source-probe → Run workflow）で各チェーン公式
サイトの robots/到達性を再調査できます。許可されたソースが見つかったら
`collector/stores.yaml` の該当店舗を `type: auto` + URL + アダプタ実装で昇格します。

## 開発

```bash
pip install -r requirements.txt      # 要: tesseract-ocr tesseract-ocr-jpn poppler-utils
python -m pytest                     # テスト一式
python pipeline.py                   # 手動で日次処理を実行
cd frontend && npm ci && npm run dev # フロントエンド開発サーバ
```

主要ディレクトリ: `collector/`(収集) `analyzer/`(OCR・解析) `storage/`(DB)
`frontend/`(表示) `data/`(DB・エクスポート・チラシ画像) `docs/superpowers/`(設計書・計画)

## 制約と設計判断

- robots.txt が拒否するサイト・トクバイ等の集約サービスは収集しない（規約遵守）
- 税抜表記のみの価格は 8% で税込換算し「税8%換算」と明示
- 通知はアプリ内表示（目標価格以下でアラート欄に表示）。プッシュ通知は無料維持のため非採用
- 月額運用費: 0円（public リポジトリの GitHub Actions / Pages 無料枠内）

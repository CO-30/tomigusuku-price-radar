# チラシ投入フォルダ

`inbox/<店舗ID>/` にチラシの画像（jpg/png/webp）か PDF を入れると、
翌朝の自動実行で OCR 解析されランキングに反映されます。

- 店舗IDの一覧: `collector/stores.yaml`
- ファイル名 `開始日_終了日.jpg`（例: `2026-11-19_2026-11-21.jpg`）で特売期間を指定
- 期間なしの名前なら投入日+3日を期間として推定します

例:
```
inbox/union_tomigusuku/2026-11-19_2026-11-21.jpg
inbox/sanei_v21_gibo/photo.jpg
```

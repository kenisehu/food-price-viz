# 学校給食費の推移

文部科学省「学校給食実施状況等調査」に基づく、全国平均の学校給食費（月額）を小学校・中学校別に表示する静的サイトです。

## データ

- 対象: 公立の完全給食実施校
- 期間: 2006年度〜2025年度（公表値がある年度のみ）
- 全国平均: 都道府県別学校数による加重平均
- 欠損年度: 補完しません
- 平成27年度以前の小学校: 中学年の平均月額

公式ファイルは `data/raw/`、出典台帳は `data/SOURCES.csv`、表示用JSONは `site/data/school-lunch-fees.json` にあります。

## データ再生成

Python 3.12 と Poppler の `pdftotext` が必要です。Python側の外部パッケージは使用しません。

```bash
python -X utf8 scripts/build_school_lunch.py
```

スクリプトは公式PDFのSHA-256を確認し、表から数値を抽出してJSONを生成します。

## ローカル表示

```bash
python -m http.server 8765 --directory site
```

ブラウザで `http://localhost:8765` を開いてください。

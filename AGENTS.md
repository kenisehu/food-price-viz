# AGENTS.md — 食料物価ウォッチ（共通ルール）

Claude Code・Codex（GPT）・Gemini CLI など、どのAIで作業する場合もこのファイルに従う。
各AI専用の設定ファイル（CLAUDE.md など）はこのファイルを読み込むだけにし、ルールをそこに書き足さない。

## このリポジトリは何か

政府統計（まずは総務省「消費者物価指数」）で、食料の物価を品目ごとに見せる静的サイト。
現在の main は OpenGov.jp の CPI ページの構成をそのまま採用した「たたき台」。
**見せ方の変更は、Discussions で合意してから PR にする**（AIが良かれと思って勝手に機能を足さない）。

## 絶対に守ること

1. **数字を手で書かない。** `site/data/` の数字は、`data/raw/` の公式ファイルを
   `scripts/` のスクリプトで変換したものだけ。AIが記憶や推測で数字を埋めることを禁止する。
2. **公式ファイルは加工せずに `data/raw/` に置き、`data/SOURCES.csv` に1行足す。**
   URL・取得日・sha256 を必ず記録する。
3. **チェックを緩めない。** `scripts/build_cpi.py` はウエイトの積み上げで階層を復元し、合わなければ停止する。
   止まったら、チェックを外すのではなく原因を調べる。
4. **近似値は近似と表示する。**
5. **APIキーやIDをコミットしない。** e-Stat のアプリケーションIDは `.env`（ローカル）か
   GitHub の Secrets（CI）に置く。
6. **解釈を断定しない。** 「制度変更の可能性」「原典を確認」のように、データから言える範囲にとどめる。

## 作業の流れ

- 変更は必ずブランチを切って PR にする。PR には「使ったAIとモデル名」「AIに任せた範囲」
  「人間が一次ソースで確認した範囲」を書く。
- レビューは、PR を作った人と**別の会社のAI**を使う人が行う。
- 意見の議論は Discussions、事実確認は Issues、変更は PR。

## ディレクトリ

```
data/raw/        公式ファイル（手を加えない）
data/SOURCES.csv 出典台帳
scripts/         raw → site/data への変換（Python 3.12、標準ライブラリのみ）
site/            静的サイト（index.html / app.js / style.css / data/）
```

## よく使うコマンド

```bash
python -X utf8 scripts/build_cpi.py        # データ再生成
python -m http.server 8765 --directory site  # ローカル表示 → http://localhost:8765
```

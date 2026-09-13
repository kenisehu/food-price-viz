"""総務省統計局のCPI長期時系列CSVから、食料の品目別指数データを作る。

入力（data/raw/、e-Statの公開ファイルをそのまま保存したもの）
  estat_item_index_long.csv  2025年基準 品目別価格指数 接続指数（1970年1月〜最新月）

出力
  site/data/cpi_food.json

数字は手で打たない。すべてこのスクリプトで raw から再生成する。
"""

from __future__ import annotations

import csv
import io
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "site" / "data" / "cpi_food.json"

FOOD_CODE = "0002"
BASE_YEAR = 2025


def read_cpi_csv(path: Path) -> dict:
    """統計局形式（6行のヘッダ＋月次行）を読む。"""
    text = path.read_bytes().decode("cp932")
    rows = list(csv.reader(io.StringIO(text)))
    names, codes, weights = rows[0], rows[2], rows[4]
    cols = [
        {
            "col": i,
            "code": codes[i].strip(),
            "name": names[i].strip(),
            "weight": int(weights[i]) if weights[i].strip() else None,
        }
        for i in range(1, len(names))
    ]
    months, values = [], []
    for r in rows[6:]:
        if not r or not r[0].strip().isdigit():
            continue
        months.append(r[0].strip())
        values.append([float(v) if v.strip() not in ("", "-") else None for v in r[1:]])
    return {"cols": cols, "months": months, "values": values}


def build_food_tree(cols: list[dict]) -> list[dict]:
    """ウエイトの積み上げで、食料の階層（類→品目）を復元する。

    CSVは「類のあとにその内訳が続く」順に並んでいるので、
    類をスタックに積み、品目のウエイトを差し引いて0になったら閉じる。
    """
    start = next(i for i, c in enumerate(cols) if c["code"] == FOOD_CODE)
    food = cols[start]
    nodes = [{**food, "parent": None, "depth": 0, "is_item": False}]
    stack = [[0, food["weight"]]]  # [nodes内のindex, 残りウエイト]
    for c in cols[start + 1 :]:
        if not stack:
            break
        is_item = not c["code"].startswith("0")
        parent_idx = stack[-1][0]
        nodes.append(
            {**c, "parent": nodes[parent_idx]["code"], "depth": nodes[parent_idx]["depth"] + 1, "is_item": is_item}
        )
        if is_item:
            for s in stack:
                s[1] -= c["weight"]
            while stack and stack[-1][1] <= 0:
                if stack[-1][1] < 0:
                    sys.exit(f"ウエイトの積み上げが合わない: {nodes[stack[-1][0]]['name']}")
                stack.pop()
        else:
            stack.append([len(nodes) - 1, c["weight"]])
    if stack:
        sys.exit("食料の階層を閉じきれなかった（CSVの並びが想定と違う）")
    return nodes


def main() -> None:
    src = read_cpi_csv(RAW / "estat_item_index_long.csv")
    tree = build_food_tree(src["cols"])
    months = src["months"]

    nodes = []
    for n in tree:
        k = n["col"] - 1
        series = [row[k] for row in src["values"]]
        first = next((i for i, v in enumerate(series) if v is not None), len(series))
        nodes.append(
            {
                "code": n["code"],
                "name": n["name"],
                "parent": n["parent"],
                "depth": n["depth"],
                "is_item": n["is_item"],
                "start": first,
                "values": series[first:],
            }
        )

    out = {
        "meta": {
            "base_year": BASE_YEAR,
            "first_month": months[0],
            "latest_month": months[-1],
            "built_at": date.today().isoformat(),
            "source": "消費者物価指数（総務省統計局）2025年基準 長期時系列データ 品目別価格指数",
        },
        "nodes": nodes,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    items = sum(n["is_item"] for n in nodes)
    print(f"最新月 {months[-1]} / 食料ノード {len(nodes)}（うち品目 {items}）")
    print(f"出力 {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()

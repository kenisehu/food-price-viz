"""総務省統計局のCPI品目別CSVから、食料の寄与度・推移データを作る。

入力（data/raw/、統計局・e-Statの公開ファイルをそのまま保存したもの）
  zmi2025aa.csv              2025年基準 品目別価格指数（小数第3位の参考値, 2025年1月〜）
  estat_item_index_long.csv  2025年基準 品目別価格指数 接続指数（1970年1月〜）
  estat_item_yoy_long.csv    2025年基準 品目別価格指数 前年同月比（公表値）

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

TREND_FROM = "201501"
FOOD_CODE = "0002"
ALL_CODE = "0001"
EXTRA_SERIES = {
    "0001": "総合",
    "0161": "生鮮食品を除く総合",
    "0172": "生鮮食品を除く食料",
    "0157": "生鮮食品",
}
SEASONAL_WEIGHT_GROUPS = {"生鮮魚介", "生鮮野菜", "生鮮果物"}


def read_cpi_csv(path: Path) -> dict:
    """統計局形式（6行のヘッダ＋月次行）を読む。"""
    text = path.read_bytes().decode("cp932")
    rows = list(csv.reader(io.StringIO(text)))
    names, en, codes, _serial, weights = rows[0], rows[1], rows[2], rows[3], rows[4]
    cols = []
    for i in range(1, len(names)):
        cols.append(
            {
                "col": i,
                "code": codes[i].strip(),
                "name": names[i].strip(),
                "en": en[i].strip(),
                "weight": int(weights[i]) if weights[i].strip() else None,
            }
        )
    months = {}
    for r in rows[6:]:
        if not r or not r[0].strip().isdigit():
            continue
        months[r[0].strip()] = [
            float(v) if v.strip() not in ("", "-", "…", "***") else None for v in r[1:]
        ]
    return {"cols": cols, "months": months}


def shift_month(ym: str, delta: int) -> str:
    y, m = int(ym[:4]), int(ym[4:])
    total = y * 12 + (m - 1) + delta
    return f"{total // 12:04d}{total % 12 + 1:02d}"


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
        node = {
            **c,
            "parent": nodes[parent_idx]["code"],
            "depth": nodes[parent_idx]["depth"] + 1,
            "is_item": is_item,
        }
        nodes.append(node)
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
    precise = read_cpi_csv(RAW / "zmi2025aa.csv")
    long_idx = read_cpi_csv(RAW / "estat_item_index_long.csv")
    long_yoy = read_cpi_csv(RAW / "estat_item_yoy_long.csv")

    p_col = {c["code"]: c for c in precise["cols"]}
    li_col = {c["code"]: c for c in long_idx["cols"]}
    ly_col = {c["code"]: c for c in long_yoy["cols"]}

    tree = build_food_tree(precise["cols"])
    items = [n for n in tree if n["is_item"]]

    # 生鮮魚介・野菜・果物は月別にウエイトが変わるため、年間ウエイトでの品目別寄与度は近似になる
    by_code = {n["code"]: n for n in tree}
    for n in tree:
        p, approx = n, False
        while p:
            if p["name"] in SEASONAL_WEIGHT_GROUPS:
                approx = True
                break
            p = by_code.get(p["parent"])
        n["approx"] = approx and n["name"] not in SEASONAL_WEIGHT_GROUPS

    months_precise = sorted(precise["months"])
    latest = months_precise[-1]
    # 寄与度は同じ基準（2025年基準）の12か月前が必要
    contrib_months = [m for m in months_precise if shift_month(m, -12) in precise["months"]]

    def pval(ym: str, code: str):
        return precise["months"][ym][p_col[code]["col"] - 1]

    w_all = p_col[ALL_CODE]["weight"]
    w_food = p_col[FOOD_CODE]["weight"]

    contributions = {}
    checks = []
    for ym in contrib_months:
        prev = shift_month(ym, -12)
        i_all_prev = pval(prev, ALL_CODE)
        i_food_prev = pval(prev, FOOD_CODE)
        food_yoy_calc = (pval(ym, FOOD_CODE) / i_food_prev - 1) * 100
        per_code = {}
        leaf_sum_food = 0.0
        mid_sum_food = 0.0
        for n in tree:
            cur, old = pval(ym, n["code"]), pval(prev, n["code"])
            if cur is None or old is None:
                continue
            diff = n["weight"] * (cur - old)
            c_food = diff / (w_food * i_food_prev) * 100
            c_all = diff / (w_all * i_all_prev) * 100
            per_code[n["code"]] = {"food_pt": round(c_food, 4), "all_pt": round(c_all, 4)}
            if n["is_item"]:
                leaf_sum_food += c_food
            if n["depth"] == 1:
                mid_sum_food += c_food
        official = ly_col.get(FOOD_CODE) and long_yoy["months"].get(ym, [None])[ly_col[FOOD_CODE]["col"] - 1]
        checks.append(
            {
                "month": ym,
                "food_yoy_official": official,
                "food_yoy_calc": round(food_yoy_calc, 3),
                "sum_mid_contrib": round(mid_sum_food, 3),
                "sum_item_contrib": round(leaf_sum_food, 3),
            }
        )
        if abs(mid_sum_food - food_yoy_calc) > 0.01:
            sys.exit(f"{ym}: 中分類の寄与度合計 {mid_sum_food:.3f} が食料の変化率 {food_yoy_calc:.3f} と合わない")
        if official is not None and abs(round(food_yoy_calc, 1) - official) > 0.1:
            sys.exit(f"{ym}: 計算した食料の前年同月比 {food_yoy_calc:.2f} が公表値 {official} と合わない")
        contributions[ym] = per_code

    # 推移（接続指数と公表の前年同月比）
    trend_months = [m for m in sorted(long_idx["months"]) if m >= TREND_FROM]
    series_codes = [n["code"] for n in tree] + [c for c in EXTRA_SERIES if c != FOOD_CODE]

    def series(src: dict, cols: dict, code: str):
        if code not in cols:
            return None
        k = cols[code]["col"] - 1
        return [src["months"][m][k] if m in src["months"] else None for m in trend_months]

    trend = {
        code: {"index": series(long_idx, li_col, code), "yoy": series(long_yoy, ly_col, code)}
        for code in series_codes
    }

    latest_yoy = {}
    for code in series_codes:
        if code in ly_col and latest in long_yoy["months"]:
            latest_yoy[code] = long_yoy["months"][latest][ly_col[code]["col"] - 1]

    out = {
        "meta": {
            "latest_month": latest,
            "base_year": 2025,
            "built_at": date.today().isoformat(),
            "contrib_months": contrib_months,
            "trend_months": trend_months,
            "weight_all": w_all,
            "weight_food": w_food,
            "checks": checks,
            "sources": [
                "総務省統計局「消費者物価指数」2025年基準 品目別価格指数（参考値：小数第3位）",
                "e-Stat 2025年基準消費者物価指数 長期時系列データ 品目別価格指数・前年同月比",
            ],
        },
        "nodes": [
            {
                "code": n["code"],
                "name": n["name"],
                "en": n["en"],
                "parent": n["parent"],
                "depth": n["depth"],
                "is_item": n["is_item"],
                "approx": n["approx"],
                "weight_per_10000_food": round(n["weight"] / w_food * 10000, 1),
                "weight_per_10000_all": round(n["weight"] / w_all * 10000, 2),
                "index": pval(latest, n["code"]),
                "yoy": latest_yoy.get(n["code"]),
            }
            for n in tree
        ],
        "extra": {
            code: {"name": name, "yoy": latest_yoy.get(code), "index": pval(latest, code) if code in p_col else None}
            for code, name in EXTRA_SERIES.items()
        },
        "contributions": contributions,
        "trend": trend,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"最新月 {latest} / 食料ノード {len(tree)}（うち品目 {len(items)}）")
    print("検算（食料の前年同月比）: 公表値 / 指数から計算 / 中分類寄与度の合計 / 品目寄与度の合計")
    for c in checks:
        print(
            f"  {c['month']}: {c['food_yoy_official']} / {c['food_yoy_calc']}"
            f" / {c['sum_mid_contrib']} / {c['sum_item_contrib']}"
        )
    print(f"出力 {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()

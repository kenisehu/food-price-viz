"""財務省「貿易統計」の品別国別表（輸入）から、CPI品目ごとの主な輸入先を作る。

入力
  data/raw/trade/import_2025_hs*.csv       品別国別表 輸入 2025年1-12月（e-Stat）
  data/raw/trade/customs_country_code_a1.htm  統計国名符号表（財務省貿易統計）
  data/mapping/cpi_hs_map.csv              CPI品目 → HSコードの対応表（人が判断して作る表）

出力
  site/data/import_sources.json

輸入額は手で打たない。対応表だけが人の判断で、その根拠は note 列と PR に書く。
"""

from __future__ import annotations

import csv
import html
import io
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRADE = ROOT / "data" / "raw" / "trade"
MAPPING = ROOT / "data" / "mapping" / "cpi_hs_map.csv"
OUT = ROOT / "site" / "data" / "import_sources.json"
YEAR = 2025
TOP_N = 5


def read_country_names() -> dict[str, str]:
    text = (TRADE / "customs_country_code_a1.htm").read_bytes().decode("cp932")
    names = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", text, flags=re.S | re.I):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, flags=re.S | re.I)]
        for i, c in enumerate(cells[:-1]):
            if re.fullmatch(r"\d{3}", c) and cells[i + 1] and "削除" not in cells[i + 1]:
                names[c] = cells[i + 1]
                break
    if len(names) < 150:
        sys.exit(f"国名符号表の読み取りに失敗（{len(names)}件）")
    return names


def read_imports() -> list[tuple[str, str, int]]:
    """(HS9桁, 国名符号, 年間輸入額[千円]) のリスト"""
    out = []
    files = sorted(TRADE.glob(f"import_{YEAR}_hs*.csv"))
    if not files:
        sys.exit("貿易統計のCSVが見つからない")
    for f in files:
        rows = csv.reader(io.StringIO(f.read_text(encoding="utf-8-sig")))
        header = next(rows)
        i_hs, i_country, i_value, i_year = header.index("HS"), header.index("Country"), header.index("Value-Year"), header.index("Year")
        for r in rows:
            if r[i_year] != str(YEAR):
                sys.exit(f"{f.name}: {YEAR}年以外の行がある")
            out.append((r[i_hs].strip("'"), r[i_country].strip(), int(r[i_value])))
    return out


def main() -> None:
    countries = read_country_names()
    imports = read_imports()
    mapping = list(csv.DictReader(MAPPING.open(encoding="utf-8")))
    cpi = {n["code"]: n["name"] for n in json.loads((ROOT / "site" / "data" / "cpi_food.json").read_text(encoding="utf-8"))["nodes"]}

    items = {}
    for m in mapping:
        if cpi.get(m["cpi_code"]) != m["cpi_name"]:
            sys.exit(f"対応表の品目名がCPIと一致しない: {m['cpi_code']} {m['cpi_name']}")
        prefixes = [p.strip() for p in m["hs_prefixes"].split(";") if p.strip()]
        by_country = defaultdict(int)
        matched_hs = set()
        for hs, country, value in imports:
            if any(hs.startswith(p) for p in prefixes):
                by_country[country] += value
                matched_hs.add(hs)
        if not matched_hs:
            sys.exit(f"{m['cpi_name']}: HSコード {prefixes} に該当する輸入が見つからない")
        unknown = [c for c in by_country if c not in countries]
        if unknown:
            sys.exit(f"{m['cpi_name']}: 国名符号表にない国コード {unknown}")
        total = sum(by_country.values())
        ranked = sorted(by_country.items(), key=lambda kv: kv[1], reverse=True)
        items[m["cpi_code"]] = {
            "hs_prefixes": prefixes,
            "hs_description": m["hs_description"],
            "note": m["note"],
            "total_thousand_yen": total,
            "country_count": len(ranked),
            "top": [
                {"country": countries[c], "value_thousand_yen": v, "share": round(v / total * 100, 1)}
                for c, v in ranked[:TOP_N]
            ],
        }

    out = {
        "meta": {
            "year": YEAR,
            "unit": "千円",
            "source": "財務省「貿易統計」品別国別表（輸入）2025年1-12月（確々報）",
        },
        "items": items,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    for code, it in items.items():
        top = "、".join(f"{t['country']} {t['share']}%" for t in it["top"][:3])
        print(f"{cpi[code]}: 輸入額 {it['total_thousand_yen'] / 1e5:,.0f}億円 / {top}")
    print(f"出力 {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

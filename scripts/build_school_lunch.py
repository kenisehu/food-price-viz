"""Build school lunch fee JSON from unmodified MEXT PDFs.

Requires `pdftotext` (Poppler). Python dependencies are standard-library only.
"""
from __future__ import annotations
import hashlib, json, re, shutil, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
METHOD = ROOT / "data/raw/mext_school_lunch_fee_method_2025.pdf"
SURVEY = ROOT / "data/raw/mext_school_lunch_survey_2025.pdf"
OUT = ROOT / "site/data/school-lunch-fees.json"
METHOD_URL = "https://www.mext.go.jp/content/20260730-mxt-kenshoku-000051287_02.pdf"
SURVEY_URL = "https://www.mext.go.jp/content/20260730-mxt-kenshoku-000051287_03.pdf"
METHOD_TITLE = "学校給食費調査における学校給食費平均月額及び給食回数の全国平均の算出方法の変更について"
SURVEY_TITLE = "学校給食実施状況等調査 令和7年度 学校給食費調査 第1表"
ERA = {"平成18年度":2006,"平成19年度":2007,"平成20年度":2008,"平成21年度":2009,"平成22年度":2010,"平成23年度":2011,"平成24年度":2012,"平成25年度":2013,"平成26年度":2014,"平成27年度":2015,"平成28年度":2016,"平成30年度":2018,"令和３年度":2021,"令和５年度":2023}
SHA = {METHOD.name:"d104512a7f1f1387d3e866a09f6674692047fc950c7c02043eaa7480ef8cb285",SURVEY.name:"216826d37fb3ab70aae75da318f1c6fa1197c21bede23a082b48ccc12c8493da"}

def text(path):
    exe=shutil.which("pdftotext")
    if not exe: raise SystemExit("pdftotext (Poppler) が必要です。")
    return subprocess.run([exe,"-layout",str(path),"-"],check=True,capture_output=True).stdout.decode("utf-8",errors="replace")
def number(s): return int(re.sub(r"[^0-9]","",s))
def main():
    for p in (METHOD,SURVEY):
        if hashlib.sha256(p.read_bytes()).hexdigest()!=SHA[p.name]: raise SystemExit(f"SHA-256 mismatch: {p.name}")
    method=text(METHOD); survey=text(SURVEY); records=[]
    pattern=re.compile(r"(令和[３５]年度|平成(?:18|19|20|21|22|23|24|25|26|27|28|30)年度)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)")
    rows={m.group(1):m.groups()[1:] for m in pattern.finditer(method)}
    if set(rows)!=set(ERA): raise SystemExit(f"過年度表の抽出不足: {sorted(rows)}")
    for label,year in sorted(ERA.items(),key=lambda x:x[1]):
        _,elem,_,junior=rows[label]
        records.append({"year":str(year),"elementary":number(elem),"juniorHigh":number(junior),"source":"文部科学省","sourceTitle":METHOD_TITLE,"sourceUrl":METHOD_URL})
    normalized=re.sub(r"(?<=\d)\s+(?=[,\d])","",survey)
    latest=re.search(r"小\s*学\s*校\s+191\s+([\d,]+).*?中\s*学\s*校\s+187\s+([\d,]+)",normalized,re.DOTALL)
    if not latest: raise SystemExit("令和7年度の抽出に失敗")
    records.append({"year":"2025","elementary":number(latest.group(1)),"juniorHigh":number(latest.group(2)),"source":"文部科学省","sourceTitle":SURVEY_TITLE,"sourceUrl":SURVEY_URL})
    OUT.write_text(json.dumps(records,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(records)} records")
if __name__=="__main__": main()

import json
import math
import re
from io import StringIO
from pathlib import Path

import pdfplumber
import pandas as pd
from lxml import html


import argparse

parser = argparse.ArgumentParser(description="Extract MGU official PDF and HTML snapshots")
parser.add_argument("snapshots", type=Path, help="Directory with mgu-kcp-2026.pdf and mgu-score-YEAR-full.html")
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = args.snapshots / "mgu-kcp-2026.pdf"
CATALOG_OUTPUT = ROOT / "data-sources/universities/msu/catalog-2026.json"
SCORES_OUTPUT = ROOT / "data-sources/universities/msu/passing-scores-2011-2025.json"

SCORE_PATHS = {
    2025: "pr-b-2025.php",
    2024: "pr-b-2024.php",
    2023: "pr-b-2023.php",
    2022: "pr-b-2022.php",
    2021: "pr-b-2021.php",
    2020: "pr-b-2020.php",
    2019: "pr-b-2019.php",
    2018: "pr-b-2018.php",
    2017: "pr-b-2017.php",
    2016: "pr-b.html",
    2015: "prokhodnye-bally-v-2015-godu-na-byudzhetnye-mesta.php",
    2014: "pr-b-2014.html",
    2013: "prokhodnye-bally-2013.php",
    2012: "pr-b-2012.html",
    2011: "pr-b-2011.html",
}


def clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def is_faculty(value: str) -> bool:
    return bool(value) and (
        value.endswith("факультет")
        or value.startswith("Факультет ")
        or value.startswith("Высшая школа")
        or value.startswith("Московская школа")
        or value.startswith("Институт ")
    )


def split_br(cell) -> list[str]:
    for br in cell.xpath(".//br"):
        br.tail = "|||" + (br.tail or "")
    return [clean(part) for part in "".join(cell.itertext()).split("|||") if clean(part)]


def number(value) -> int | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    match = re.fullmatch(r"(\d+)(?:\.0)?", clean(str(value)))
    return int(match.group(1)) if match else None


def is_branch(faculty: str) -> bool:
    normalized = faculty.casefold()
    return "филиал" in normalized or "пущино" in normalized


def exam_groups(value: str | None) -> list[str]:
    groups = []
    buffer = []
    for line in (value or "").splitlines():
        normalized = clean(line)
        if not normalized:
            continue
        buffer.append(normalized)
        if re.search(r"\(\d+\)$", normalized):
            groups.append(" ".join(buffer))
            buffer = []
    if buffer:
        groups.append(" ".join(buffer))
    return groups


records = []
faculty = ""
code = ""
stop = False

with pdfplumber.open(PDF_PATH) as pdf:
    for page_number, page in enumerate(pdf.pages, start=1):
        tables = page.extract_tables()
        if not tables:
            continue
        for row in tables[0]:
            raw_cells = row
            cells = [clean(cell) for cell in row]
            combined = " ".join(cells)
            if "Филиал МГУ" in combined:
                stop = True
                break
            if len(cells) < 5:
                continue
            first, description, budget, paid, exams = cells[:5]
            if is_faculty(first) and not description:
                faculty = first
                continue
            if re.fullmatch(r"\d{2}\.\d{2}\.\d{2}", first):
                code = first
            if description.startswith("в том числе") and records:
                quota_value = int(budget) if budget.isdigit() else None
                if "по особой квоте" in description:
                    records[-1]["specialQuota"] = quota_value
                elif "по отдельной квоте" in description:
                    records[-1]["separateQuota"] = quota_value
                elif "по детализированной целевой квоте" in description:
                    if quota_value is not None:
                        records[-1]["targetQuota"] = (
                            (records[-1]["targetQuota"] or 0) + quota_value
                        )
            if (
                description
                and not description.startswith("в том числе")
                and (
                    description.startswith("Направление подготовки")
                    or description.startswith("Специальность")
                    or description.startswith("Укрупненная группа")
                )
            ):
                records.append(
                    {
                        "page": page_number,
                        "faculty": faculty,
                        "code": code,
                        "description": description,
                        "budget": int(budget) if budget.isdigit() else None,
                        "paid": int(paid) if paid.isdigit() else None,
                        "specialQuota": None,
                        "separateQuota": None,
                        "targetQuota": None,
                        "exams": exams,
                        "examGroups": exam_groups(raw_cells[4]),
                    }
                )
        if stop:
            break

CATALOG_OUTPUT.write_text(
    json.dumps(
        {
            "sourceUrl": "https://cpk.msu.ru/files/2026/kcp_bak.pdf",
            "sourceTitle": "Перечень направлений подготовки и контрольные цифры приёма МГУ в 2026 году",
            "retrievedAt": "2026-08-27T00:00:00.000Z",
            "programs": records,
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)


scores = []
for year, route in sorted(SCORE_PATHS.items()):
    source_url = f"https://msu.ru/entrance/{route}"
    score_path = args.snapshots / f"mgu-score-{year}-full.html"
    source_html = score_path.read_text(encoding="utf-8")

    if year <= 2013:
        tree = html.fromstring(source_html)
        faculty = ""
        for row in tree.xpath("//table[1]//tr"):
            headers = row.xpath("./th")
            cells = row.xpath("./td")
            if len(headers) == 1 and headers[0].get("colspan") == "3":
                faculty = clean(" ".join(headers[0].itertext()))
                continue
            if len(cells) != 3 or not faculty or is_branch(faculty):
                continue
            programs = split_br(cells[0])
            joined_programs = []
            for name in programs:
                if name.startswith("(") and joined_programs:
                    joined_programs[-1] += " " + name
                else:
                    joined_programs.append(name)
            programs = joined_programs
            maxima = split_br(cells[1])
            passing = split_br(cells[2])
            if not (len(programs) == len(maxima) == len(passing)):
                programs = [" / ".join(programs)]
                maxima = [" / ".join(maxima)]
                passing = [" / ".join(passing)]
            for index, program_name in enumerate(programs):
                raw_score = passing[index] if index < len(passing) else ""
                raw_max = maxima[index] if index < len(maxima) else ""
                scores.append(
                    {
                        "year": year,
                        "faculty": faculty,
                        "program": program_name,
                        "code": None,
                        "score": number(raw_score),
                        "maxScore": number(raw_max),
                        "firstWaveScore": None,
                        "secondWaveScore": None,
                        "rawScore": raw_score,
                        "sourceUrl": source_url,
                    }
                )
        continue

    frame = pd.read_html(StringIO(source_html))[0]
    if year in (2014, 2015):
        frame = pd.read_html(StringIO(source_html), header=None)[0]
        for _, row in frame.iloc[1:].iterrows():
            faculty = clean(str(row.iloc[0]))
            if is_branch(faculty):
                continue
            program_name = clean(str(row.iloc[2]))
            code_match = re.search(r"\((\d{2}\.\d{2}\.\d{2})\)", clean(str(row.iloc[3])))
            if year == 2014:
                score = number(row.iloc[4])
                first_wave = None
                second_wave = None
            else:
                first_wave = number(row.iloc[4])
                second_wave = number(row.iloc[5])
                score = second_wave if second_wave is not None else first_wave
            scores.append(
                {
                    "year": year,
                    "faculty": faculty,
                    "program": program_name,
                    "code": code_match.group(1) if code_match else None,
                    "score": score,
                    "maxScore": None,
                    "firstWaveScore": first_wave,
                    "secondWaveScore": second_wave,
                    "rawScore": str(score) if score is not None else "",
                    "sourceUrl": source_url,
                }
            )
        continue

    if year == 2016:
        for _, row in frame.iterrows():
            faculty = clean(str(row.iloc[0]))
            if is_branch(faculty):
                continue
            program_field = clean(str(row.iloc[3]))
            code_match = re.search(r"\((\d{2}\.\d{2}\.\d{2})\)", program_field)
            first_wave = number(row.iloc[4])
            second_wave = number(row.iloc[5])
            score = second_wave if second_wave is not None else first_wave
            scores.append(
                {
                    "year": year,
                    "faculty": faculty,
                    "program": program_field,
                    "code": code_match.group(1) if code_match else None,
                    "score": score,
                    "maxScore": None,
                    "firstWaveScore": first_wave,
                    "secondWaveScore": second_wave,
                    "rawScore": str(score) if score is not None else "",
                    "sourceUrl": source_url,
                }
            )
        continue

    for _, row in frame.iterrows():
        faculty = clean(str(row.iloc[0]))
        if is_branch(faculty):
            continue
        program_name = clean(str(row.iloc[1]))
        raw_score = clean(str(row.iloc[-1]))
        if year >= 2024:
            parts = raw_score.split("/", maxsplit=1)
            score = number(parts[0])
            max_score = number(parts[1]) if len(parts) == 2 else None
        else:
            score = number(raw_score)
            max_score = number(row.iloc[2])
        scores.append(
            {
                "year": year,
                "faculty": faculty,
                "program": program_name,
                "code": None,
                "score": score,
                "maxScore": max_score,
                "firstWaveScore": None,
                "secondWaveScore": None,
                "rawScore": raw_score,
                "sourceUrl": source_url,
            }
        )

SCORES_OUTPUT.write_text(
    json.dumps(
        {
            "archiveUrl": "https://cpk.msu.ru/legal",
            "sourceTitle": "Официальный архив проходных баллов МГУ",
            "retrievedAt": "2026-08-27T00:00:00.000Z",
            "years": list(range(2025, 2010, -1)),
            "records": scores,
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)

print(f"CATALOG_COUNT={len(records)}")
print(f"SCORES_COUNT={len(scores)}")
for year in range(2011, 2026):
    print(year, sum(1 for item in scores if item["year"] == year))

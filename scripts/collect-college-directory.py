"""Collect the directory of colleges (СПО) from Ministry monitoring 2025.

Same source family and rules as scripts/collect-russia-directory.py (universities):
the monitoring is a dated, historical directory, not an admissions campaign or a
license registry. Only colleges (icon _1) and their branches (icon _0) are
collected; universities that also teach СПО (icon _2) are already in the
university catalog and are only referenced. Raw responses stay in ignored
tmp/colleges-research with SHA-256 in provenance.

  python -X utf8 scripts/collect-college-directory.py --checked-at 2026-11-25T18:00:00Z
writes data-sources/colleges/directory-2025.json and collection-report-2025.json.
"""

import argparse
import concurrent.futures
from collections import Counter
import importlib.util
import json
from pathlib import Path
import re
import time
from urllib.parse import parse_qs, urljoin, urlparse


def load_university_collector():
    path = Path(__file__).with_name("collect-russia-directory.py")
    spec = importlib.util.spec_from_file_location("russia_directory", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_university_collector()
base.CACHE = Path("tmp/colleges-research")
clean, page = base.clean, base.page


def fetch(url, filename, checked_at, refresh=False, attempts=4):
    """The monitoring host drops some connections under load: retry with backoff."""
    for attempt in range(attempts):
        path, metadata = base.fetch(url, filename, checked_at, refresh or attempt > 0)
        if metadata["httpStatus"] == "200" and metadata["exitCode"] == 0:
            return path, metadata
        time.sleep(3 * (attempt + 1))
    return path, metadata
INDEX_URL = base.BASE + "?m=spo&year=2025"
PROFILE_BASE = base.BASE + "iam/2025/_spo/inst.php?id="
OUTPUT = Path("data-sources/colleges")
KINDS = {"_1": "college", "_0": "branch", "_2": "university"}
NOTE = (
    "Наименование, адрес, сайт и ведомственная принадлежность — по мониторингу "
    "СПО Минобрнауки 2025. Это историческая справочная запись, а не подтверждение "
    "действующего приёма; лицензия, аккредитация и специальности требуют отдельной "
    "проверки по официальному сайту колледжа."
)


def quoted_title(text):
    """Text of the first quoted name, nested quotes kept; tolerates a missing closer."""
    match = re.search(r"[«\"]", text)
    if not match:
        return None
    depth, out = 1, []
    for index in range(match.end(), len(text)):
        char = text[index]
        if char == "«" or (char == '"' and (index == match.end() or text[index - 1] in " (")):
            depth += 1
        elif char in '»"':
            depth -= 1
            if depth == 0:
                break
        out.append(char)
    title = clean("".join(out))
    # A cut-off source name leaves one dangling quote at an edge; drop only that.
    if title.count('"') % 2:
        title = title.strip('"').strip()
    if title.count("«") != title.count("»"):
        title = title.strip("«»").strip()
    return title or None


def display_name(legal_name, kind):
    """Short name for colleges; branches keep the legal name like university branches."""
    if kind == "branch":
        return legal_name
    title = quoted_title(legal_name)
    if not title:
        # Unquoted: «ОГБПОУ [Владимирской области] Александровский … колледж».
        match = re.search(
            r"(?:учреждение|организация)(?:\s+профессионального образования)?\s+"
            r"(?:(?:[А-ЯЁ][а-яё-]+ой области|[А-ЯЁ][а-яё-]+ого края|города [А-ЯЁ][а-яё-]+|"
            r"Республики [А-ЯЁ][а-яё-]+)\s+)?([А-ЯЁ].+)$",
            legal_name,
        )
        return match.group(1) if match else legal_name
    # «ПОО "Астраханский базовый медицинский колледж"»: the inner quotes hold the name.
    inner = re.match(r"^[^\"«]*(?:организация|учреждение)\s+[«\"](.+)$", title, re.I)
    if inner:
        title = quoted_title('"' + inner.group(1)) or title
    return title


def collect_region(region, checked_at, refresh):
    path, metadata = fetch(region["sourceUrl"], "region-" + region["id"] + ".html", checked_at, refresh)
    document = page(path, metadata)
    rows = []
    for cell in document.xpath('//td[@class="inst"][a]'):
        link = cell.xpath('./a[contains(@href,"inst.php?id=")]')
        if not link:
            continue
        rows.append({
            "monitoringId": parse_qs(urlparse(link[0].get("href")).query)["id"][0],
            "legalName": clean(link[0].text_content()),
            "sourceCity": clean(cell.get("city", "")),
            "kind": KINDS.get(cell.get("icon"), "unknown"),
            "sourceIcon": cell.get("icon"),
            "region": region["name"],
            "federalDistrict": region["federalDistrict"],
            "listSourceUrl": region["sourceUrl"],
            "listSourceSha256": metadata["sourceSha256"],
        })
    return region, metadata, rows


def collect_college(row, checked_at, refresh):
    monitoring_id = row["monitoringId"]
    source_url = PROFILE_BASE + monitoring_id
    path, metadata = fetch(source_url, "inst-" + monitoring_id + ".html", checked_at, refresh)
    document = page(path, metadata)
    fields = {}
    for tr in document.xpath("//tr[td[@class='tt']]"):
        cells = tr.xpath("./td")
        if len(cells) == 2:
            fields.setdefault(clean(cells[0].text_content()).casefold(), clean(cells[1].text_content()))
    legal_name = fields.get("наименование образовательной организации", "")
    post = document.xpath('//*[@id="post"]')
    address = clean(post[0].text_content()) if post else ""
    authority = fields.get("ведомственная принадлежность", "")
    if not legal_name or not address or not authority:
        raise ValueError("incomplete_profile: " + json.dumps({"name": legal_name, "address": address, "authority": authority}, ensure_ascii=False))
    raw_site = fields.get("web-сайт", "")
    city, corrected = base.address_city(row["sourceCity"], address)
    students = None
    for tr in document.xpath('//table[@id="napde1"]//tr'):
        cells = [clean(cell.text_content()) for cell in tr.xpath("./td")]
        if cells and cells[0].startswith("1.1.") and len(cells) > 1:
            value = cells[1].replace(" ", "").replace(" ", "")
            students = int(value) if value.isdigit() else None
    slug = "college-" + monitoring_id
    college = {
        "id": slug,
        "slug": slug,
        "name": display_name(legal_name, row["kind"]),
        "legalName": legal_name,
        "kind": row["kind"],
        "city": city,
        "address": address,
        "region": row["region"],
        "federalDistrict": row["federalDistrict"],
        "website": base.website_url(raw_site),
        "websiteAsPublished": raw_site or None,
        "authority": authority,
        "ownership": "private" if authority == "Частные организации" else "public",
        "founder": fields.get("учредитель(и)") or None,
        "specifics": fields.get("специфика организации в частиреализации программ спо") or None,
        "employerFocus": fields.get("целевая направленность по типу работодателя выпускников") or None,
        "studentsAsPublished": students,
        "directory": {
            "monitoringId": monitoring_id,
            "sourceUrl": source_url,
            "sourceYear": 2025,
            "checkedAt": metadata["checkedAt"],
            "sourceSha256": metadata["sourceSha256"],
            "listSourceUrl": row["listSourceUrl"],
            "note": NOTE + (" Населённый пункт — по явно указанному адресу; метка в региональной таблице: " + row["sourceCity"] + "." if corrected else ""),
        },
    }
    return college


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checked-at", required=True)
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z", args.checked_at):
        raise ValueError("--checked-at must be a UTC ISO timestamp ending in Z")
    base.CACHE.mkdir(parents=True, exist_ok=True)
    path, index_metadata = fetch(INDEX_URL, "nation.html", args.checked_at, args.refresh)
    document = page(path, index_metadata)
    regions = []
    for link in document.xpath('//a[contains(@href,"_spo/material.php")]'):
        source_url = urljoin(base.BASE, link.get("href"))
        labels = link.getparent().getparent().xpath('./div[@class="n_fo_name"]/text()')
        regions.append({
            "id": parse_qs(urlparse(source_url).query)["id"][0],
            "name": clean(link.text_content()),
            "sourceUrl": source_url,
            "federalDistrict": base.DISTRICTS.get(labels[0]) if labels else None,
        })
    regions = list({region["id"]: region for region in regions}.values())
    roster, region_results, errors = {}, [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        def safe_region(region):
            try:
                return collect_region(region, args.checked_at, args.refresh)
            except Exception as error:
                errors.append({"region": region["name"], "sourceUrl": region["sourceUrl"], "error": str(error)[:300]})
                return region, {"httpStatus": "error"}, []

        for region, metadata, rows in pool.map(safe_region, regions):
            region_results.append({**region, "httpStatus": metadata["httpStatus"], "sourceSha256": metadata.get("sourceSha256"), "rows": len(rows)})
            for row in rows:
                roster.setdefault(row["monitoringId"], row)
    wanted = [row for row in roster.values() if row["kind"] in ("college", "branch")]
    universities = [row for row in roster.values() if row["kind"] == "university"]
    colleges = []

    def safe(row):
        try:
            return collect_college(row, args.checked_at, args.refresh), None
        except Exception as error:  # one broken page never stops the run
            return None, {"monitoringId": row["monitoringId"], "legalName": row["legalName"], "error": str(error)[:300]}

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for college, error in pool.map(safe, wanted):
            if college:
                colleges.append(college)
            else:
                errors.append(error)
    colleges.sort(key=lambda row: (row["region"], row["city"] or "", row["name"]))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    base.dump(OUTPUT / "directory-2025.json", {
        "checkedAt": args.checked_at,
        "source": INDEX_URL,
        "sourceSha256": index_metadata.get("sourceSha256"),
        "sourceYear": 2025,
        "note": NOTE,
        "colleges": colleges,
    })
    base.dump(OUTPUT / "collection-report-2025.json", {
        "checkedAt": args.checked_at,
        "regions": sorted(region_results, key=lambda r: r["name"]),
        "counts": {
            "regions": len(regions),
            "rosterRows": len(roster),
            "byKind": dict(Counter(row["kind"] for row in roster.values())),
            "colleges": len(colleges),
            "withWebsite": sum(1 for row in colleges if row["website"]),
            "errors": len(errors),
        },
        "universitiesTeachingSpo": [{k: row[k] for k in ("monitoringId", "legalName", "region")} for row in universities],
        "errors": errors,
    })
    print(json.dumps({"regions": len(regions), "colleges": len(colleges), "errors": len(errors), "byKind": dict(Counter(row["kind"] for row in roster.values()))}, ensure_ascii=False))


if __name__ == "__main__":
    main()

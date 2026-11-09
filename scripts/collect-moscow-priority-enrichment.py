"""Publish reviewed official Moscow gaps, preserving failed priority attempts.

The 11 October batch keeps the six named priorities in its failure report and
uses four reachable existing Moscow organizations as an explicitly permitted
fallback. Raw HTTP bodies remain under ignored tmp/russia-research.
"""
import argparse
import hashlib
import json
import re
import runpy
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
PREVIOUS = runpy.run_path(str(ROOT / "scripts/collect-moscow-targeted-enrichment.py"))
LEGACY = PREVIOUS["LEGACY"]
CLEAN = LEGACY["clean"]
PRIORITIES = ["mgu", "mai", "mipt", "mephi", "mpei", "rudn"]
SOURCES = {
    "mosgu": ["https://www.mosgu.ru/sveden/education/eduaccred/", "https://mosgu.ru/sveden/common/", "https://mosgu.ru/sveden/grants/"],
    "gaugn": ["https://gaugn.ru/sveden/education"],
    "gnesin": ["https://gnesin-academy.ru/sveden/education/eduaccred/", "https://gnesin-academy.ru/sveden/struct/", "https://gnesin-academy.ru/sveden/common/", "https://gnesin-academy.ru/admission/priemnaya-komissiya/"],
    "guu": ["https://guu.ru/sveden/struct/"],
}
PREVIOUS["REVIEWED_EDUCATION_TABLES"].update({"mosgu": (1, 2, 3)})
FACULTY_PATH = "/sveden/struct/faculties/"
# The first teaching-looking GUU block belongs to its MBA/additional-education
# school. Its two departments must not be presented as degree faculties.
GUU_EXCLUDED_UNITS = {
    "высшая школа бизнеса и технологий гуу",
    "кафедра управления бизнес-системами",
    "кафедра управления развитием бизнеса (базовая кафедра общероссийской общественной организации деловая россия)",
}


def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def content(node):
    return CLEAN(" ".join(node.itertext()))


def field(node, key):
    values = node.xpath('.//*[@itemprop="' + key + '"]')
    return content(values[0]) if values else ""


def educational_row(node, meta, issues, slug):
    code, title, profile, level = [field(node, k) for k in ["eduCode", "eduName", "eduProf", "eduLevel"]]
    if not re.fullmatch(r"\d{2}\.(?:03|04|05)\.\d{2}", code):
        return None
    if not title or not level or re.search(r"среднее профессиональн|дополнительн|аспирант|ординат|ассистент|филиал", title + " " + profile + " " + level, re.I):
        return None
    if not re.search(r"бакалавр|магистр|специалитет|базовое высшее|специализированное высшее", level, re.I):
        return None
    # A literal source typo must not silently become a valid program identity.
    if code == "46.03.01" and "культуролог" in title.casefold():
        issues.append({"universitySlug": slug, "kind": "source_code_title_conflict", "code": code, "title": title,
                       "sourceUrl": meta["url"], "note": "The published code belongs to History, while the title says Cultural Studies; row excluded pending editorial clarification."})
        return None
    return {"code": code, "title": title, "profile": PREVIOUS["profile_name"](profile), "level": level,
            "admissionsStatus": "pending_review", **LEGACY["provenance"](meta), "sourceYear": None}


def div_education(tree, meta, slug):
    """Reviewed div layouts, never statistical rows or a header's descendants."""
    rows, issues = [], []
    if slug == "gaugn":
        elements = tree.xpath('//div[@itemprop="eduAccred" and contains(@style,"table-row")]')
        for element in elements:
            row = educational_row(element, meta, issues, slug)
            if row is None:
                continue
            forms, duration = field(element, "eduForm"), field(element, "learningTerm")
            if not re.search(r"очн|заочн", forms, re.I):
                continue
            rows.append({**row, "forms": forms, "duration": duration or None})
    elif slug == "gnesin":
        elements = tree.xpath('//div[@itemprop="eduAccred" and contains(@class,"sveden-accreed-lang-item")]')
        for element in elements:
            row = educational_row(element, meta, issues, slug)
            if row is None:
                continue
            # Each form has its own sibling term. A dash means that form is
            # not represented by this source; never combine it with another.
            for part in element.xpath('.//div[contains(concat(" ",normalize-space(@class)," ")," sveden-accreed-lang-item-part-inner ")]'):
                forms, duration = field(part, "eduForm"), field(part, "learningTerm")
                if not forms or not duration or re.fullmatch(r"[-–—]|не реализуется|отсутствует", duration, re.I):
                    continue
                if re.search(r"очн|заочн", forms, re.I):
                    rows.append({**row, "forms": forms, "duration": duration})
    return rows, issues


def structural_units(tree, meta, slug):
    result = {}
    section = "Структура и органы управления образовательной организацией"
    if slug == "gnesin":
        for name, url in LEGACY["links"](tree, meta["url"]):
            if FACULTY_PATH in urlparse(url).path and "факультет" in name.casefold():
                result.setdefault(PREVIOUS["normalized"](name), {"name": name, "url": url, **LEGACY["provenance"](meta), "sourceSection": section})
    if slug == "guu":
        tables = tree.xpath('//table')
        if len(tables) < 2:
            return []
        for row in tables[1].xpath('.//tr'):
            cells = row.xpath('./td')
            if not cells:
                continue
            name = content(cells[0])
            if not re.match(r"^(Институт|Кафедра|Высшая школа)", name, re.I):
                continue
            if re.search(r"дополнительн|повышени[ея] квалификац|переподготов|научно-исследователь|филиал", name, re.I):
                continue
            if len(name) > 300:
                continue
            if PREVIOUS["normalized"](name) in GUU_EXCLUDED_UNITS:
                continue
            # Linked documents are regulations, not unit homepages.
            result.setdefault(PREVIOUS["normalized"](name), {"name": name, "url": None, **LEGACY["provenance"](meta), "sourceSection": section})
    return list(result.values())


def reviewed_fields(tree, meta, slug, prior):
    result = LEGACY["common_fields"](tree, meta, prior) if "/common" in meta["url"] else {}
    if slug == "mosgu" and "/grants/" in meta["url"] and "hostelInfo" not in prior:
        # Publish the source's own accommodation statement, not an inferred
        # availability flag or a promise that every applicant gets a place.
        for node in tree.xpath('//*[@itemprop="hostelInfo"]'):
            value = content(node)
            if value and len(value) < 600:
                result["hostelInfo"] = {"value": value, **LEGACY["provenance"](meta)}
                break
    return result


def snapshot_checked_at(manifest):
    """Offline generation never masquerades as a new source acquisition."""
    dates = [m["checkedAt"] for m in manifest if m.get("checkedAt")]
    return max(dates, key=datetime.fromisoformat) if dates else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collection-date", default=datetime.now(timezone(timedelta(hours=3))).date().isoformat())
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--refresh", action="store_true")
    options = parser.parse_args()
    datetime.strptime(options.collection_date, "%Y-%m-%d")
    if options.offline and options.refresh:
        parser.error("--offline and --refresh cannot be combined")
    LEGACY["OPTIONS"].refresh = options.refresh
    cache = options.cache_dir or ROOT / ("tmp/russia-research/moscow-enrichment-" + options.collection_date)
    prior = PREVIOUS["prior_profiles"](options.collection_date)
    universities = {u["slug"]: u for u in LEGACY["UNIVERSITIES"]}
    profiles, issues, manifest = [], [], []
    for slug, urls in SOURCES.items():
        fields, units, candidates = {}, {}, []
        known_units = {PREVIOUS["normalized"](f["name"]) for f in prior[slug].get("faculties", [])}
        known_rows = {PREVIOUS["identity"](r) for r in prior[slug]["offerings"]}
        for url in urls:
            folder = cache / slug
            folder.mkdir(parents=True, exist_ok=True)
            digest = hashlib.sha256(url.encode()).hexdigest()[:14]
            if options.offline and not (folder / (digest + ".meta.json")).exists():
                issues.append({"universitySlug": slug, "kind": "missing_snapshot", "sourceUrl": url})
                continue
            tree, meta = PREVIOUS["load_page"](url, folder, options.offline)
            manifest.append({"universitySlug": slug, **meta})
            if tree is None:
                continue
            expected, actual = LEGACY["host"](universities[slug]["website"]), LEGACY["host"](meta["url"])
            if actual != expected and not actual.endswith("." + expected):
                manifest[-1]["rejected"] = "unexpected_organization_domain"
                continue
            fields.update(reviewed_fields(tree, meta, slug, prior[slug]["fields"]))
            for unit in structural_units(tree, meta, slug):
                key = PREVIOUS["normalized"](unit["name"])
                if key not in known_units:
                    units.setdefault(key, unit)
            if slug == "mosgu" and "/education/eduaccred" in meta["url"]:
                candidates.extend(PREVIOUS["education_rows"](tree, meta, universities[slug]))
            if slug in ("gaugn", "gnesin") and "/education" in meta["url"]:
                rows, row_issues = div_education(tree, meta, slug)
                candidates.extend(rows)
                issues.extend(row_issues)
        collapsed, conflicts = PREVIOUS["collapse_rows"](candidates, slug)
        issues.extend(conflicts)
        offerings = [r for r in collapsed if PREVIOUS["identity"](r) not in known_rows]
        profiles.append({"universitySlug": slug, "fields": fields, "faculties": list(units.values()), "offerings": offerings})
        print(slug, "fields", len(fields), "units", len(units), "offerings", len(offerings), flush=True)
    by_request = {(m["universitySlug"], m["requestedUrl"]): m for m in manifest}
    for path in sorted(cache.glob('*/*.meta.json')):
        meta = json.loads(path.read_text(encoding="utf-8"))
        by_request.setdefault((path.parent.name, meta["requestedUrl"]), {"universitySlug": path.parent.name, **meta})
    manifest = list(by_request.values())
    for slug in PRIORITIES:
        issues.append({"universitySlug": slug, "kind": "priority_sources_unavailable", "note": "Fresh official-site requests did not produce a usable HTTP 200 snapshot. Existing facts and dates retained; missing data is not treated as absence."})
    issues.append({"universitySlug": "guu", "kind": "additional_education_structure_excluded",
                   "sourceUrl": SOURCES["guu"][0],
                   "excludedUnits": ["Высшая школа бизнеса и технологий ГУУ", "Кафедра «Управления бизнес-системами»", "Кафедра управления развитием бизнеса (Базовая кафедра Общероссийской общественной организации «Деловая Россия»)"],
                   "note": "The reviewed additional/business-education school and its two departments are outside this degree-structure batch; their absence is not a statement that the units do not exist."})
    summary = {"universitiesReviewed": len(SOURCES), "priorityUniversities": len(PRIORITIES),
               "researchUniversitiesAttempted": len({m["universitySlug"] for m in manifest}),
               "universitiesWithNewOfferings": sum(bool(p["offerings"]) for p in profiles),
               "newOfferings": sum(len(p["offerings"]) for p in profiles),
               "universitiesWithFaculties": sum(bool(p["faculties"]) for p in profiles),
               "faculties": sum(len(p["faculties"]) for p in profiles),
               "newFields": sum(len(p["fields"]) for p in profiles),
               "durationConflicts": sum(i["kind"] == "duration_conflict" for i in issues),
               "pagesRequested": len(manifest), "unsuccessfulSources": sum(m.get("httpStatus") != "200" or bool(m.get("exitCode")) or bool(m.get("rejected")) for m in manifest)}
    data = {"schemaVersion": 1, "collectionDate": options.collection_date, "checkedAt": snapshot_checked_at(manifest), "reviewGeneratedAt": LEGACY["now"](),
            "sourceYear": int(options.collection_date[:4]), "status": "incomplete", "scope": "Existing Moscow directory gaps; unreachable six priorities retained in the issue queue, four reachable official-source fallbacks reviewed",
            "note": "Partial structure and implemented higher-education listings only; no current intake year, exams, price, places, passing score or licensing inferred. Source UTC fetch dates and SHA256 are retained during offline parsing. Form-specific terms stay paired; unavailable forms and postgraduate/secondary/additional education are excluded. Literal levels and forms are preserved.",
            "profiles": profiles, "sourceManifest": manifest, "collectionIssues": issues, "summary": summary}
    dump(options.output or ROOT / ("data-sources/russia/moscow-enrichment-" + options.collection_date + ".json"), data)
    dump(options.report or ROOT / ("data-sources/russia/moscow-collection-report-" + options.collection_date + ".json"), {k: v for k, v in data.items() if k != "profiles"})
    print("COMPLETE", summary, flush=True)


if __name__ == "__main__":
    main()

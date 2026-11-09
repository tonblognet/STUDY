"""Replay a partial educational-listing gap batch from official HTTP snapshots.

The default is offline. ISU is deliberately limited to literal 2026 curriculum
profiles; a curriculum suffix is never promoted to an admissions year.
"""

import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import re
from urllib.parse import urljoin


ROOT = Path(__file__).resolve().parents[1]
BATCH = "2026-11-09"
WORK = ROOT / f"tmp/russia-research/continuation-education-{BATCH}"
OUT = ROOT / f"data-sources/russia/continuation-education-{BATCH}.json"
REPORT = ROOT / f"data-sources/russia/continuation-education-collection-report-{BATCH}.json"
RUNTIME_BASELINE = ROOT / "tmp/russia-before-nov09-continuation.json"


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


base = module("continuation_education_base", "collect-regional-oct25-education.py")
guard = base.guard
guard.BATCH = BATCH
clean = base.clean
dump = guard.dump
INDEXES = {
    "russia-83": "https://isu.ru/sveden/education/",
    "russia-341": "https://ystu.ru/sveden/education/",
    "russia-342": "https://www.uniyar.ac.ru/sveden/education/",
}
DETAILS = {
    "russia-83": [
        "https://isu.ru/sveden/addpages_single/edu_och_1/",
        "https://isu.ru/sveden/addpages_single/edu_och_zaoch/",
    ],
    "russia-341": ["https://ystu.ru/sveden/education/eduOp/"],
    "russia-342": ["https://www.uniyar.ac.ru/sveden/education/obr-prog.php"],
}
guard.OFFICIAL_HOSTS = {
    "russia-83": {"isu.ru"},
    "russia-341": {"ystu.ru"},
    "russia-342": {"uniyar.ac.ru"},
}
SCOPE = (
    "Частичная дельта образовательных перечней ИГУ, ЯГТУ и ЯрГУ. "
    "Только явно опубликованные строки бакалавриата/специалитета с кодами .03/.05. "
    "ИГУ ограничен профилями с буквальным суффиксом учебного плана 2026; "
    "суффикс сохранён в профиле и не является годом приёма. "
    "sourceYear=null, admissionsStatus=pending_review. "
    "Формы читаются из той же строки; сроки без отдельного подтверждения неизвестны. "
    "Поля, подразделения, конкурсные программы, ЕГЭ, баллы, цены, места, "
    "сроки подачи, лицензии и аккредитация не добавляются."
)


def freeze_baseline(work, runtime=RUNTIME_BASELINE):
    path = work / "baseline.json"
    if path.exists():
        value = json.loads(path.read_text(encoding="utf-8"))
    else:
        raw = runtime.read_bytes()
        data = json.loads(raw)
        profiles = {p["universitySlug"]: p for p in data["directoryDetails"]}
        universities = {u["slug"]: u for u in data["universities"]}
        value = {
            "runtimeSnapshot": runtime.relative_to(ROOT).as_posix() if runtime.is_relative_to(ROOT) else runtime.name,
            "runtimeSnapshotSha256": hashlib.sha256(raw).hexdigest(),
            "universities": {
                slug: {
                    "name": universities[slug]["name"],
                    "city": universities[slug]["city"],
                    "educationalListings": len(profiles[slug]["offerings"]),
                    "sourcedFields": len(profiles[slug]["fields"]),
                    "faculties": len(profiles[slug].get("faculties", [])),
                    "profileSha256": hashlib.sha256(json.dumps(profiles[slug], ensure_ascii=False, sort_keys=True).encode()).hexdigest(),
                }
                for slug in INDEXES
            },
        }
    rows = value.get("universities", {})
    if set(rows) != set(INDEXES) or any(p.get("educationalListings") != 0 for p in rows.values()):
        raise ValueError("Frozen targets must be existing universities with an educational-listing gap")
    if not re.fullmatch(r"[0-9a-f]{64}", value.get("runtimeSnapshotSha256", "")):
        raise ValueError("Frozen runtime baseline must retain its SHA-256")
    if not path.exists():
        dump(path, value)
    return value


def evidence(work, slug, url):
    meta, tree = guard.load_evidence(work, slug, url)
    visible = clean(" ".join(tree.xpath('//body//text()[not(ancestor::script) and not(ancestor::style)]')))
    if len(visible) < 500:
        raise ValueError("Insufficient official source content: " + url)
    return meta, tree


def association(slug, meta, index, url):
    """Require each reviewed detail URL to be an actual official index link."""
    links = [a for a in index.xpath('//a[@href]') if urljoin(meta["url"], a.get("href")) == url]
    if not links:
        raise ValueError("Detail URL is absent from its official education index: " + url)
    return {
        "universitySlug": slug,
        "url": url,
        "discoveredFrom": meta["url"],
        "publishedLabel": clean(links[0].text_content()),
        "xpath": index.getroottree().getpath(links[0]),
    }


def read_rows(slug, tree, meta, issues, exclusions):
    rows = []
    headings = tree.xpath('//h1')
    section = clean(headings[-1].text_content()) if headings else ""
    if not re.search(r"образовательн.*программ", section, re.I):
        raise ValueError("Unexpected educational-program page heading")
    if slug == "russia-83":
        section += " — профили с суффиксом учебного плана 2026; год приёма не установлен"
    tables = tree.xpath('//table[.//tr[@itemprop="eduOp"]]')
    if len(tables) != 1:
        raise ValueError("Expected one reviewed implemented-program table")
    table = tables[0]
    headers = clean(" ".join(table.xpath('.//th//text()')))
    if re.search(r"численност|трудоустройств|результат[ыа] при[её]ма", headers, re.I):
        raise ValueError("A statistics table cannot establish implemented programs")
    if not all(table.xpath('.//*[@itemprop=$prop]', prop=prop) for prop in ("eduCode", "eduName", "eduLevel", "eduForm", "eduProf")):
        raise ValueError("Reviewed program microdata columns changed")
    for row_index, row, cells in base.layout_rows(table):
        if not row.xpath('./td'):
            continue
        values, literal_cells, form_items = {}, {}, []
        for cell in cells:
            if cell is None:
                continue
            for node in [cell] + cell.xpath('.//*[@itemprop]'):
                prop = node.get("itemprop")
                if prop not in base.PROPS:
                    continue
                value = clean(" ".join(node.itertext()))
                literal_cells[prop] = value
                if prop == "eduForm" and node.xpath('./ul/li|./ol/li'):
                    form_items = [clean(" ".join(li.itertext())) for li in node.xpath('./ul/li|./ol/li')]
                    if value != " ".join(form_items):
                        raise ValueError("Form list contains text outside its explicit items")
                    value = ", ".join(form_items)
                if prop in values and value != values[prop]:
                    raise ValueError("Conflicting microdata values inside one program row")
                values[prop] = value
        locator = {
            "sourceUrl": meta["url"],
            "xpath": tree.getroottree().getpath(row),
            "rowIndex": row_index,
            "section": section,
            "literalCells": literal_cells,
            **({"publishedFormItems": form_items} if form_items else {}),
        }
        code = values.get("eduCode", "")
        if not re.fullmatch(r"\d{2}\.(?:03|05)\.\d{2}", code):
            if re.fullmatch(r"\d{2}\.\d{2}\.\d{2}", code):
                exclusions.append({"universitySlug": slug, "kind": "outside_bachelor_specialist_scope", **locator})
            continue
        if slug == "russia-83" and not re.search(r",\s*2026$", values.get("eduProf", "")):
            exclusions.append({"universitySlug": slug, "kind": "isu_other_curriculum_cohort", **locator})
            continue
        # None of these three dedicated eduOp inventories contains a branch
        # section. Explicit branch/campus references must still fail closed.
        if re.search(r"филиал|Балашов|Братск|Ангарск|Усть-Илимск", " ".join(values.values()), re.I):
            exclusions.append({"universitySlug": slug, "kind": "other_or_unclear_campus", **locator})
            continue
        item = base.fact(slug, values, meta, locator, issues, duration_header=headers)
        if item:
            rows.append((item, locator))
    return rows


def build(work, output, report, baseline):
    profiles, sources, associations, literal_rows, issues, exclusions = [], [], [], {}, [], []
    per_university = []
    for slug, index_url in INDEXES.items():
        index_meta, index = evidence(work, slug, index_url)
        sources.append(index_meta)
        rows = []
        for url in DETAILS[slug]:
            associations.append(association(slug, index_meta, index, url))
            meta, tree = evidence(work, slug, url)
            sources.append(meta)
            rows.extend(read_rows(slug, tree, meta, issues, exclusions))
        offerings, locators = base.deduplicate(rows, slug, issues)
        if not offerings:
            raise ValueError("Reviewed university has no usable program rows: " + slug)
        profiles.append({"universitySlug": slug, "fields": {}, "faculties": [], "offerings": offerings})
        literal_rows.update(locators)
        per_university.append({
            "universitySlug": slug,
            **baseline["universities"][slug],
            "newEducationalListings": len(offerings),
            "sourceRowsBeforeDeduplication": len(rows),
            "completeness": "partial",
        })
    dates = sorted(source["checkedAt"] for source in sources)
    stats = {
        "universitiesReviewed": len(profiles),
        "universitiesWithEducationalListings": len(profiles),
        "implementedOfferings": sum(len(p["offerings"]) for p in profiles),
        "fields": 0,
        "faculties": 0,
        "admissionPrograms": 0,
    }
    candidate = {
        "checkedAt": dates[-1],
        "sourceYear": None,
        "scope": SCOPE,
        "profiles": profiles,
        "sources": sources,
        "issues": issues,
        "stats": stats,
        "gapBaseline": {slug: ["educationalListings"] for slug in INDEXES},
    }
    dump(output, candidate)
    dump(report, {
        "generatedAt": dates[-1],
        "sourceCheckedAtRange": [dates[0], dates[-1]],
        "scope": SCOPE,
        "dataFile": OUT.name,
        "stats": stats,
        "perUniversity": per_university,
        "baseline": baseline,
        "sources": sources,
        "sourceAssociations": associations,
        "literalSourceRows": literal_rows,
        "editorialExclusions": issues,
        "scopeExclusions": exclusions,
        "scopeExclusionCounts": dict(Counter(row["kind"] for row in exclusions)),
        "limitations": [
            "Only three existing regional cards with no earlier educational listings are enriched. Existing fields and units are untouched.",
            "ISU is deliberately partial: only literal 2026 curriculum suffixes, only full-time and part-time on-campus inventory pages. Other cohorts, correspondence study and master's/postgraduate levels are excluded.",
            "Curriculum years and FГОС suffixes are preserved literally. sourceYear remains null; no ongoing or future admission campaign is inferred.",
            "These eduOp rows provide no independently scoped normative duration; it remains null. Program counts are directory rows, not admission competition groups.",
            "The general education page of Astrakhan State University supplied a DPO inventory; the alternative overview timed out. BGU and KGTU attempts failed timeout or TLS. No facts are inferred from those failures.",
            "SGU is deferred after slow official detail responses; its existing profile is preserved.",
        ],
        "cacheDirectory": work.relative_to(ROOT).as_posix(),
        "candidateSha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "reproduction": {
            "offline": "python -X utf8 scripts/collect-regional-nov09-continuation-education.py --output tmp/continuation-education-replay.json --report tmp/continuation-education-replay-report.json",
            "baseline": (work / "baseline.json").relative_to(ROOT).as_posix(),
            "note": "Default replay performs no network requests and preserves original retrieval dates and SHA-256. Raw receipts for deferred universities remain in the same ignored work directory.",
        },
    })
    print(json.dumps(stats, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collect", action="store_true")
    parser.add_argument("--cache-dir", type=Path, default=WORK)
    parser.add_argument("--output", type=Path, default=OUT)
    parser.add_argument("--report", type=Path, default=REPORT)
    args = parser.parse_args()
    baseline = freeze_baseline(args.cache_dir)
    if args.collect:
        for slug, index in INDEXES.items():
            guard.fetch(args.cache_dir, slug, index)
            meta, tree = evidence(args.cache_dir, slug, index)
            for url in DETAILS[slug]:
                association(slug, meta, tree, url)
                guard.fetch(args.cache_dir, slug, url)
    build(args.cache_dir, args.output, args.report, baseline)


if __name__ == "__main__":
    main()

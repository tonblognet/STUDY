"""Replay reviewed gap-only KGTU and Baikal SU educational inventories.

The default is offline. A university's implemented curricula are kept separate
from admission groups, and the published first-course scope is not an admission year.
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
WORK = ROOT / f"tmp/russia-research/followup-regional-education-{BATCH}"
OUT = ROOT / f"data-sources/russia/followup-regional-education-{BATCH}.json"
REPORT = ROOT / f"data-sources/russia/followup-regional-education-collection-report-{BATCH}.json"
RUNTIME = ROOT / "tmp/russia-before-nov09-followup.json"


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


education = module("followup_education_base", "collect-regional-oct25-education.py")
guard = education.guard
guard.BATCH = BATCH
guard.OFFICIAL_HOSTS = {"russia-1601": {"klgtu.ru"}, "russia-12": {"bgu.ru"}}
clean, dump = guard.clean, guard.dump
INDEXES = {
    "russia-1601": "https://klgtu.ru/sveden/education/",
    "russia-12": "https://bgu.ru/sveden/education/",
}
DETAILS = {
    "russia-1601": ["https://klgtu.ru/sveden/education/eduop"],
    "russia-12": [
        "https://bgu.ru/sveden/education/accred-bach.aspx",
        "https://bgu.ru/sveden/education/accred-spec.aspx",
    ],
}
SCOPE = (
    "Частичная дельта реализуемых образовательных программ КГТУ (Калининград) "
    "и Байкальского государственного университета (Иркутск), только коды .03/.05. "
    "Перечни не являются конкурсными группами: sourceYear=null, pending_review. "
    "В БГУ выбран только явно опубликованный раздел «1 курс»; год приёма из него не выводится. "
    "Каждая форма БГУ связана только со своим сроком в том же сегменте ячейки; "
    "общий срок для нескольких форм КГТУ не выведен. "
    "Не добавляются поля, подразделения, ЕГЭ, места, цены, проходные баллы, "
    "дедлайны, лицензии, аккредитация или гарантии поступления."
)


def freeze_baseline(work, runtime=RUNTIME):
    destination = work / "baseline.json"
    if destination.exists():
        frozen = json.loads(destination.read_text(encoding="utf-8"))
    else:
        raw = runtime.read_bytes()
        snapshot = json.loads(raw)
        profiles = {p["universitySlug"]: p for p in snapshot["directoryDetails"]}
        universities = {u["slug"]: u for u in snapshot["universities"]}
        frozen = {
            "runtimeSnapshot": runtime.relative_to(ROOT).as_posix() if runtime.is_relative_to(ROOT) else runtime.name,
            "runtimeSnapshotSha256": hashlib.sha256(raw).hexdigest(),
            "universities": {
                slug: {
                    "name": universities[slug]["name"], "city": universities[slug]["city"],
                    "educationalListings": len(profiles[slug]["offerings"]),
                    "profileSha256": hashlib.sha256(json.dumps(profiles[slug], ensure_ascii=False, sort_keys=True).encode()).hexdigest(),
                }
                for slug in INDEXES
            },
        }
    rows = frozen.get("universities", {})
    if set(rows) != set(INDEXES) or any(row.get("educationalListings") != 0 for row in rows.values()):
        raise ValueError("Targets must be existing university profiles with an educational-listing gap")
    if not re.fullmatch(r"[0-9a-f]{64}", frozen.get("runtimeSnapshotSha256", "")):
        raise ValueError("Invalid frozen runtime snapshot SHA-256")
    if not destination.exists():
        dump(destination, frozen)
    return frozen


def evidence(work, slug, url):
    return guard.load_evidence(work, slug, url)


def literal(node):
    return clean(" ".join(node.itertext()))


def one(nodes, description):
    if len(nodes) != 1:
        raise ValueError("Expected exactly one " + description)
    return nodes[0]


def association(slug, meta, index, url):
    links = [a for a in index.xpath('//a[@href]') if urljoin(meta["url"], a.get("href")) == url]
    if not links:
        raise ValueError("Detail source is not linked by the official education index")
    return {"universitySlug": slug, "url": url, "discoveredFrom": meta["url"],
            "publishedLabel": literal(links[0]), "xpath": index.getroottree().getpath(links[0])}


def forbidden_campus(value):
    return bool(re.search(r"филиал|Балашов|\bЧита\b|Усть-Илимск|Братск|\bСветл(?:ый|ого)\b|Полесск|Советск|Черняховск", value, re.I))


def kgtu_rows(tree, meta, issues, excluded):
    result = []
    for table_index, table in enumerate(tree.xpath('//table[.//tr[@itemprop="eduOp"]]')):
        heading = education.section(table)
        selected = heading in {"Программы бакалавриата", "Программы специалитета"}
        if not selected:
            excluded.append({"universitySlug": "russia-1601", "kind": "other_level_or_section", "section": heading,
                             "tableXPath": tree.getroottree().getpath(table), "rows": len(table.xpath('.//tr[@itemprop="eduOp"]'))})
            continue
        if forbidden_campus(heading):
            raise ValueError("Other-campus section cannot be attached to the main-city card")
        header = clean(" ".join(table.xpath('.//th//text()')))
        if re.search(r"численност|трудоустройств|результат[ыа] при[её]ма", header, re.I):
            raise ValueError("Statistics are not implemented educational programs")
        for row_index, row, cells in education.layout_rows(table):
            if not row.xpath('./td'):
                continue
            values, raw, forms = {}, {}, []
            for cell in cells:
                if cell is None:
                    continue
                for node in [cell] + cell.xpath('.//*[@itemprop]'):
                    key = node.get("itemprop")
                    if key not in education.PROPS:
                        continue
                    value = literal(node)
                    raw[key] = value
                    if key == "eduForm":
                        # These exact cells separate literal forms with <br>.
                        # A visually similar concatenated string is not repaired.
                        if node.xpath('./*[not(self::br)]'):
                            raise ValueError("KGTU form markup changed from explicit br-separated text")
                        forms = [clean(text) for text in node.xpath('./text()') if clean(text)]
                        if len(forms) > 1 and len(node.xpath('./br')) != len(forms) - 1:
                            raise ValueError("KGTU forms lack unambiguous published separators")
                        value = ", ".join(forms)
                    if key in values and values[key] != value:
                        raise ValueError("Conflicting microdata inside one implemented-program row")
                    values[key] = value
            locator = {"sourceUrl": meta["url"], "xpath": tree.getroottree().getpath(row),
                       "tableIndex": table_index, "rowIndex": row_index, "section": heading,
                       "literalCells": raw, "publishedFormItems": forms}
            if forbidden_campus(" ".join(raw.values())):
                excluded.append({"universitySlug": "russia-1601", "kind": "other_or_unclear_campus", **locator})
                continue
            item = education.fact("russia-1601", values, meta, locator, issues, duration_header=header)
            if item:
                result.append((item, locator))
    if not result:
        raise ValueError("KGTU reviewed bachelor inventory disappeared")
    return result


def bgu_form_segments(cell):
    """A form and duration can only be paired inside one explicit hr segment."""
    if clean(cell.text or ""):
        raise ValueError("Unscoped text outside the BGU form/duration segment")
    groups = [[]]
    for child in cell:
        if re.sub(r"[\s()]", "", child.tail or ""):
            raise ValueError("Unscoped BGU condition outside the form/duration microdata")
        if child.tag == "hr":
            groups.append([])
        else:
            if child.tag not in {"br", "small"} and child.get("itemprop") not in {"eduForm", "learningTerm"}:
                raise ValueError("Unexpected markup inside the BGU form/duration segment")
            groups[-1].append(child)
    result = []
    for group in groups:
        forms = [n for n in group if n.get("itemprop") == "eduForm"]
        terms = [n for n in group if n.get("itemprop") == "learningTerm"]
        if len(forms) != 1 or len(terms) != 1:
            raise ValueError("BGU form/duration association is ambiguous inside one hr segment")
        if group.index(forms[0]) >= group.index(terms[0]):
            raise ValueError("BGU duration precedes its form")
        conditions = [literal(n) for n in group if n.tag == "small"]
        result.append((forms[0], terms[0], conditions))
    return result


def bgu_rows(tree, meta, issues, excluded):
    main = one(tree.xpath('//*[@id="MainContent1"]'), "BGU educational content")
    level = literal(one(main.xpath('.//h3'), "BGU level heading"))
    if level not in {"Бакалавриат", "Специалитет"}:
        raise ValueError("Unexpected BGU selected program level")
    tab = one(main.xpath('.//*[@id="course-1-tab"]'), "first-course tab")
    if literal(tab) != "1 курс" or tab.get("href") != "#course-1":
        raise ValueError("BGU published cohort label changed")
    table = one(main.xpath('.//*[@id="course-1"]/table'), "first-course program table")
    header = clean(" ".join(table.xpath('.//th//text()')))
    if re.search(r"численност|трудоустройств|результат[ыа] при[её]ма", header, re.I):
        raise ValueError("Statistics cannot establish BGU implemented programs")
    if "Нормативный срок обучения" not in header:
        raise ValueError("BGU normative-duration column context changed")
    section = f"{level} — 1 курс; год приёма не установлен"
    if forbidden_campus(" ".join(main.xpath('./h1//text()|./h2//text()|./h3//text()'))):
        raise ValueError("Other-campus BGU educational content")
    for pane in main.xpath('.//div[starts-with(@id,"course-")][@id!="course-1"]'):
        excluded.append({"universitySlug": "russia-12", "kind": "other_published_course", "sourceUrl": meta["url"],
                         "sectionId": pane.get("id"), "rows": len(pane.xpath('.//tr[@itemprop="eduAccred"]')),
                         "xpath": tree.getroottree().getpath(pane)})
    result = []
    for row in table.xpath('.//tr[@itemprop="eduAccred"]'):
        raw = {key: literal(one(row.xpath('.//*[@itemprop=$key]', key=key), key))
               for key in ("eduCode", "eduName", "eduLevel", "eduProf")}
        if forbidden_campus(" ".join(raw.values())):
            excluded.append({"universitySlug": "russia-12", "kind": "other_or_unclear_campus", "sourceUrl": meta["url"],
                             "xpath": tree.getroottree().getpath(row), "literalCells": raw})
            continue
        cells = row.xpath('./td[.//*[@itemprop="eduForm"]]')
        cell = one(cells, "BGU form/duration cell")
        for form, term, conditions in bgu_form_segments(cell):
            values = {**raw, "eduForm": literal(form), "learningTerm": literal(term)}
            locator = {"sourceUrl": meta["url"], "xpath": tree.getroottree().getpath(row),
                       "section": section, "literalCells": values,
                       "publishedCourseLabel": literal(tab),
                       "formXPath": tree.getroottree().getpath(form),
                       "durationXPath": tree.getroottree().getpath(term)}
            if conditions:
                excluded.append({"universitySlug": "russia-12", "kind": "bgu_mode_condition_excluded",
                                 "publishedConditions": conditions, **locator})
                continue
            item = education.fact("russia-12", values, meta, locator, issues,
                                  duration_header="Форма обучения (Нормативный срок обучения)")
            if item:
                result.append((item, locator))
    if not result:
        raise ValueError("BGU reviewed first-course inventory disappeared")
    return result


def build(work, output, report, baseline):
    profiles, sources, associations, literal_rows, issues, excluded, counts = [], [], [], {}, [], [], []
    for slug, url in INDEXES.items():
        meta, index = evidence(work, slug, url)
        sources.append(meta)
        rows = []
        for detail in DETAILS[slug]:
            associations.append(association(slug, meta, index, detail))
            receipt, document = evidence(work, slug, detail)
            sources.append(receipt)
            rows.extend((kgtu_rows if slug == "russia-1601" else bgu_rows)(document, receipt, issues, excluded))
        offerings, locators = education.deduplicate(rows, slug, issues)
        profiles.append({"universitySlug": slug, "fields": {}, "faculties": [], "offerings": offerings})
        literal_rows.update(locators)
        counts.append({"universitySlug": slug, **baseline["universities"][slug],
                       "newEducationalListings": len(offerings), "sourceRowsBeforeDeduplication": len(rows), "completeness": "partial"})
    dates = sorted(receipt["checkedAt"] for receipt in sources)
    stats = {"universitiesReviewed": len(profiles), "universitiesWithEducationalListings": sum(bool(p["offerings"]) for p in profiles),
             "implementedOfferings": sum(len(p["offerings"]) for p in profiles), "fields": 0, "faculties": 0, "admissionPrograms": 0}
    candidate = {"checkedAt": dates[-1], "sourceYear": None, "scope": SCOPE, "profiles": profiles,
                 "sources": sources, "issues": issues, "stats": stats,
                 "gapBaseline": {slug: ["educationalListings"] for slug in INDEXES}}
    dump(output, candidate)
    attempts = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(work.glob('*/*.meta.json'))]
    dump(report, {"generatedAt": dates[-1], "scope": SCOPE, "sourceCheckedAtRange": [dates[0], dates[-1]],
                  "dataFile": OUT.name, "stats": stats, "perUniversity": counts, "baseline": baseline,
                  "sources": sources, "sourceAssociations": associations, "literalSourceRows": literal_rows,
                  "editorialExclusions": issues, "scopeExclusions": excluded,
                  "exclusionCounts": dict(Counter(row["kind"] for row in issues + excluded)), "sourceAttempts": attempts,
                  "campusReview": [
                      {"universitySlug": "russia-1601", "scope": "Only the university's own bachelor/specialist overview tables; no separate branch section. Exact table heading and row properties retained. Global header branch-navigation links do not assign those branches to program rows."},
                      {"universitySlug": "russia-12", "scope": "Only the first-course panels of the university's own bachelor/specialist tables; no separate branch section. Row-level branch/city markers are excluded."}],
                  "limitations": [
                      "General implemented-program inventories do not establish a current or future admissions campaign, admission conditions, licensing or accreditation. SourceYear remains null.",
                      "KGTU mixed specialist/master rows are excluded even with .05 codes. Its bachelor rows have no independent normative duration on the selected eduOp source; duration remains null.",
                      "BGU is limited to the explicitly labelled first-course section. Other course panels are excluded. Each mode and term is associated only within its own explicit hr-separated cell segment.",
                      "BGU mode segments with a separately printed educational-technology condition are excluded individually rather than silently reduced to plain study forms. Other modes of the same row retain their own literal terms.",
                      "SGU is deferred because campus attribution including Balashov requires separate review. No source failure implies absence of education.",
                      "PetrSU education URL redirected toward non-HTTPS and was rejected. Astrakhan SU and remaining cities are deferred. Existing fields, units and 185 admission programs are untouched."],
                  "cacheDirectory": work.relative_to(ROOT).as_posix(),
                  "candidateSha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                  "reproduction": {"offline": "python -X utf8 scripts/collect-regional-nov09-followup-education.py --output tmp/followup-education-replay.json --report tmp/followup-education-replay-report.json",
                                   "baseline": (work / "baseline.json").relative_to(ROOT).as_posix(),
                                   "note": "No --collect means no network. Original official bytes, SHA-256 and UTC retrieval dates are retained."}})
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
        for slug, url in INDEXES.items():
            guard.fetch(args.cache_dir, slug, url)
            meta, index = evidence(args.cache_dir, slug, url)
            for detail in DETAILS[slug]:
                association(slug, meta, index, detail)
                guard.fetch(args.cache_dir, slug, detail)
    build(args.cache_dir, args.output, args.report, baseline)


if __name__ == "__main__":
    main()

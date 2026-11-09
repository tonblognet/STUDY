"""Replay partial gap-only education inventories for UlSTU, UlSU and LSTU.

Default parsing is offline. Implemented education inventories and curriculum
cohorts do not establish an admissions campaign or a current admission right.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]
BATCH = "2026-11-09"
WORK = ROOT / f"tmp/russia-research/followup-central-education-{BATCH}"
OUT = ROOT / f"data-sources/russia/followup-central-education-{BATCH}.json"
REPORT = ROOT / f"data-sources/russia/followup-central-education-collection-report-{BATCH}.json"
BASELINE = ROOT / "tmp/russia-before-nov09-followup.json"
INDEXES = {
    "russia-305": "https://ulstu.ru/sveden/education/",
    "russia-306": "https://ulsu.ru/ru/sveden/education/",
    "russia-117": "https://www.stu.lipetsk.ru/sveden/education/",
}
DETAILS = {"russia-117": "https://www.stu.lipetsk.ru/sveden/education/edu_op/minobr/"}
NORMATIVE_SECTION = "Информация о реализуемых уровнях образования, о формах обучения, нормативных сроках обучения"
LSTU_SECTION = "Информация по неадаптированным образовательным программам"
CAMPUS_PATTERN = r"филиал|представительств|инзенск|новоспас|димитровград|дмитровград|данков|елец|балашов|камышин"
SCOPE = (
    "Частичные образовательные перечни УлГТУ, УлГУ и ЛГТУ из официальных страниц головных организаций. "
    "Только бакалавриат/специалитет с кодами .03/.05. У УлГТУ и УлГУ используется нормативная сводка; "
    "повторные таблицы учебных планов, статистика, СПО, магистратура, послевузовские и дополнительные уровни исключены. "
    "ЛГТУ ограничен строками с буквальным годом начала подготовки 2026, который не является подтверждением года приёма. "
    "sourceYear=null и pending_review. Срок сохраняется только при явных единицах и единственной форме той же строки; "
    "срок для нескольких форм неизвестен. Конкурсные программы, условия приёма, ЕГЭ, баллы, цены, места и лицензии не добавляются."
)


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


base = module("central_followup_base", "collect-regional-oct25-education.py")
guard = base.guard
guard.BATCH = BATCH
guard.OFFICIAL_HOSTS = {slug: {urlparse(url).hostname.removeprefix("www.")} for slug, url in INDEXES.items()}
clean = base.clean
dump = guard.dump


def freeze_baseline(work):
    path = work / "baseline.json"
    if path.exists():
        baseline = json.loads(path.read_text(encoding="utf-8"))
    elif REPORT.exists():
        baseline = json.loads(REPORT.read_text(encoding="utf-8"))["baseline"]
    else:
        raw = BASELINE.read_bytes()
        snapshot = json.loads(raw)
        profiles = {p["universitySlug"]: p for p in snapshot["directoryDetails"]}
        universities = {u["slug"]: u for u in snapshot["universities"]}
        baseline = {"runtimeSnapshotSha256": hashlib.sha256(raw).hexdigest(), "universities": {slug: {"name": universities[slug]["name"], "city": universities[slug]["city"], "educationalListings": len(profiles[slug]["offerings"]), "sourcedFields": len(profiles[slug]["fields"]), "faculties": len(profiles[slug].get("faculties", [])), "profileSha256": hashlib.sha256(json.dumps(profiles[slug], ensure_ascii=False, sort_keys=True).encode()).hexdigest()} for slug in INDEXES}}
    if set(baseline["universities"]) != set(INDEXES) or any(p["educationalListings"] for p in baseline["universities"].values()):
        raise ValueError("Frozen baseline must contain exactly the target existing cards with no previous listings")
    if not path.exists():
        dump(path, baseline)
    return baseline


def evidence(work, slug, url):
    meta, tree = guard.load_evidence(work, slug, url)
    title = clean(" ".join(tree.xpath('//title/text()')))
    if re.search(r"404|not found", title, re.I) or len(clean(" ".join(tree.xpath('//body//text()[not(ancestor::script) and not(ancestor::style)]')))) < 500:
        raise ValueError("Official education source is a soft error or insufficient page")
    return meta, tree


def detail_association(slug, meta, tree, url):
    bases = tree.xpath('//base[@href]/@href')
    if len(bases) > 1:
        raise ValueError("Ambiguous HTML base URL")
    effective = urljoin(meta["url"], bases[0]) if bases else meta["url"]
    guard.validate_source_url(slug, effective)
    links = [a for a in tree.xpath('//a[@href]') if urljoin(effective, a.get("href")) == url]
    if len(links) != 1:
        raise ValueError("Education detail is not one explicit index link")
    link = links[0]
    return {"universitySlug": slug, "sourceUrl": meta["url"], "sourceSha256": meta["sourceSha256"], "checkedAt": meta["checkedAt"], "htmlBaseUrl": effective, "rawHref": link.get("href"), "url": url, "label": clean(link.text_content()), "xpath": tree.getroottree().getpath(link)}


def form_value(node):
    literal = clean(" ".join(node.itertext()))
    items = [clean(" ".join(item.itertext())) for item in node.xpath('./ul/li|./ol/li')]
    if items:
        if literal != " ".join(items):
            raise ValueError("Form list has unscoped extra text")
        return ", ".join(items), literal, items
    # A semicolon is an explicit list delimiter in the UlSU source. Retain its
    # literal form in evidence; do not split one source row into invented rows.
    if ";" in literal:
        values = [clean(value) for value in literal.split(";")]
        if not all(re.fullmatch(r"очная|очно-заочная|заочная", value, re.I) for value in values):
            raise ValueError("Unrecognized semicolon-delimited form")
        return ", ".join(values), literal, values
    return literal, literal, []


def selected_table(slug, tree):
    prop = "eduOp" if slug == "russia-117" else "eduAccred"
    tables = tree.xpath('//table[.//tr[@itemprop=$prop]]', prop=prop)
    if len(tables) != 1:
        raise ValueError("Expected one exact normative or unadapted inventory table")
    table = tables[0]
    caption = clean(" ".join(table.xpath('./caption//text()')))
    preceding = table.xpath('preceding::*[self::h1 or self::h2 or self::h3 or self::h4][1]')
    heading = clean(preceding[0].text_content()) if preceding else ""
    expected = LSTU_SECTION if slug == "russia-117" else NORMATIVE_SECTION
    if expected not in (caption, heading):
        raise ValueError("Selected table is not in its reviewed implementation section")
    # Inspect surrounding semantic section headings, rather than assigning a
    # campus from a program title alone. These three inventories are not nested
    # beneath a branch-specific heading or section.
    section_headings = [clean(n.text_content()) for n in table.xpath('ancestor::*[self::section or self::article]/*[self::h1 or self::h2 or self::h3 or self::h4]')]
    unmarked_rows = [{"rowXPath": tree.getroottree().getpath(row), "literalText": clean(" ".join(row.itertext()))} for row in table.xpath('./tr|./thead/tr|./tbody/tr|./tfoot/tr') if row.get("itemprop") not in {"eduAccred", "eduOp"}]
    if any(re.search(CAMPUS_PATTERN, value, re.I) for value in [caption, heading] + section_headings + [row["literalText"] for row in unmarked_rows]):
        raise ValueError("Selected inventory has an other-campus section")
    header_nodes = table.xpath('./thead/tr[1]/*') or table.xpath('./tr[1]/*|./tbody/tr[1]/*')
    headers = [clean(n.text_content()) for n in header_nodes]
    if slug == "russia-117":
        if len(headers) != 15 or headers[0] != "Год начала подготовки" or headers[5] != "Реализуемые формы обучения":
            raise ValueError("LSTU cohort/form columns changed")
    elif len(headers) != 8 or not any("Нормативный срок обучения" == value for value in headers):
        raise ValueError("Normative inventory duration columns changed")
    ancestors = [{"tag": node.tag, "id": node.get("id"), "class": node.get("class")} for node in table.iterancestors()]
    return table, {"tableXPath": tree.getroottree().getpath(table), "section": expected, "heading": heading, "caption": caption, "columnHeaders": headers, "surroundingSectionHeadings": section_headings, "unmarkedRows": unmarked_rows, "ancestorContainers": ancestors, "campusReview": "Официальная страница головной организации. Точная таблица реализации не находится под филиальным заголовком; внутри неё нет территориальных подзаголовков или отдельных филиальных блоков, только шапка и собственные маркированные строки. Проверены Новоспасское/Инзенский/Димитровград и остальные явные территориальные маркеры. У УлГУ вне выбранной таблицы слово «филиал» встречается в перечнях музеев-партнёров практики, а не в филиальном подразделе таблицы. Явные филиальные/территориальные строки исключаются. Перечень частичный, условия приёма не подтверждены."}


def read_rows(slug, tree, meta, issues, exclusions):
    table, scope = selected_table(slug, tree)
    rows = []
    for index, row, cells in base.layout_rows(table):
        if row.get("itemprop") != ("eduOp" if slug == "russia-117" else "eduAccred"):
            continue
        values, literal, props_xpaths = {}, {}, {}
        published_form_items = []
        for cell in cells:
            if cell is None:
                continue
            for node in [cell] + cell.xpath('.//*[@itemprop]'):
                prop = node.get("itemprop")
                if prop not in base.PROPS:
                    continue
                value = clean(" ".join(node.itertext()))
                literal[prop] = value
                props_xpaths[prop] = tree.getroottree().getpath(node)
                if prop == "eduForm":
                    value, _, published_form_items = form_value(node)
                if prop in values and values[prop] != value:
                    raise ValueError("Conflicting property in source row")
                values[prop] = value
        locator = {"sourceUrl": meta["url"], "xpath": tree.getroottree().getpath(row), "rowXPath": tree.getroottree().getpath(row), "rowIndex": index, "section": scope["section"], "tableXPath": scope["tableXPath"], "literalCells": literal, "propertyXPaths": props_xpaths}
        if published_form_items:
            locator["publishedFormItems"] = published_form_items
        if slug == "russia-117":
            cohort = clean(cells[0].text_content())
            locator["publishedStartOfStudy"] = cohort
            if cohort != "2026":
                exclusions.append({"universitySlug": slug, "kind": "other_start_of_study_cohort", **locator})
                continue
            locator["section"] += " — год начала подготовки 2026; год приёма не установлен"
        code = values.get("eduCode", "")
        if not re.fullmatch(r"\d{2}\.(03|05)\.\d{2}", code):
            exclusions.append({"universitySlug": slug, "kind": "outside_bachelor_specialist_scope", **locator})
            continue
        campus = " ".join([values.get(key, "") for key in ("eduName", "eduProf", "eduLevel")])
        # The exact table/section was reviewed above; scan the row's own nearby
        # campus labels too, including cells outside the principal name fields.
        campus += " " + clean(" ".join(row.xpath('./td[@itemprop="unit" or @itemprop="campus"]//text()')))
        if re.search(CAMPUS_PATTERN, campus, re.I):
            exclusions.append({"universitySlug": slug, "kind": "other_or_unclear_campus", **locator})
            continue
        item = base.fact(slug, values, meta, locator, issues, duration_header=" ".join(scope["columnHeaders"]))
        if item:
            if item["duration"] and re.search(r"\d\s+[,.]\s*\d|\d[,.]\s+\d", item["duration"]):
                issues.append({"universitySlug": slug, "kind": "malformed_decimal_duration", "offeringId": item["id"], "publishedValue": item["duration"], "sourceUrl": meta["url"], "checkedAt": meta["checkedAt"], "sourceSha256": meta["sourceSha256"], **locator, "note": "Разделённая пробелом десятичная запись в исходной строке не исправляется предположением; duration=null."})
                item["duration"] = None
            locator["durationRelation"] = {"publishedValue": literal.get("learningTerm") or literal.get("eduNorm") or literal.get("eduSrok"), "publishedForm": literal.get("eduForm"), "result": item["duration"], "review": "Одна и та же строка и колонка нормативного срока; несколько форм или неоднозначные единицы оставляют duration=null." if slug != "russia-117" else "В таблице ЛГТУ нет колонки нормативного срока; duration=null."}
            rows.append((item, locator))
    return rows, scope


def build(work, output, report_path):
    baseline = freeze_baseline(work)
    profiles, used_sources, source_associations, table_scopes, issues, exclusions, literal_rows, university_stats = [], [], [], [], [], [], {}, []
    for slug, index_url in INDEXES.items():
        meta, tree = evidence(work, slug, index_url)
        used_sources.append(meta)
        if slug in DETAILS:
            detail_url = DETAILS[slug]
            source_associations.append(detail_association(slug, meta, tree, detail_url))
            meta, tree = evidence(work, slug, detail_url)
            used_sources.append(meta)
        rows, scope = read_rows(slug, tree, meta, issues, exclusions)
        table_scopes.append({"universitySlug": slug, "sourceUrl": meta["url"], "sourceSha256": meta["sourceSha256"], "checkedAt": meta["checkedAt"], **scope})
        offerings, locators = base.deduplicate(rows, slug, issues)
        if not offerings:
            raise ValueError("Selected card has no supported educational listings")
        profiles.append({"universitySlug": slug, "fields": {}, "faculties": [], "offerings": offerings})
        literal_rows.update(locators)
        university_stats.append({"universitySlug": slug, **baseline["universities"][slug], "implementedOfferings": len(offerings), "literalRowsBeforeDeduplication": len(rows), "withDuration": sum(o["duration"] is not None for o in offerings), "unknownDuration": sum(o["duration"] is None for o in offerings), "completeness": "partial"})
    receipts = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(work.glob('*/*.meta.json'))]
    stats = {"universitiesReviewed": len(profiles), "implementedOfferings": sum(len(p["offerings"]) for p in profiles), "fields": 0, "faculties": 0, "admissionPrograms": 0}
    dates = sorted(s["checkedAt"] for s in used_sources)
    payload = {"checkedAt": dates[-1], "sourceYear": None, "scope": SCOPE, "profiles": profiles, "sources": used_sources, "issues": issues, "stats": stats, "gapBaseline": {slug: ["educationalListings"] for slug in INDEXES}}
    dump(output, payload)
    dump(report_path, {"batchDate": BATCH, "checkedAtRange": [dates[0], dates[-1]], "scope": SCOPE, "stats": stats, "perUniversity": university_stats, "baseline": baseline, "sources": used_sources, "discoveryReceipts": receipts, "sourceAssociations": source_associations, "tableScopes": table_scopes, "literalSourceRows": literal_rows, "editorialIssues": issues, "scopeExclusions": exclusions, "scopeExclusionCounts": dict(Counter(e["kind"] for e in exclusions)), "cacheDirectory": work.relative_to(ROOT).as_posix(), "candidateSha256": hashlib.sha256(output.read_bytes()).hexdigest(), "limitations": ["Перечни частичные; строка реализации не подтверждает текущий или будущий приём, лицензию, аккредитацию, места или конкурсную группу.", "ЛГТУ: год начала подготовки 2026 сохранён в sourceSection и буквальном locator, не в sourceYear. Остальные контингенты и адаптированная таблица не включены.", "УлГТУ и УлГУ: нормативная сводка не объединяется с повторными таблицами учебных планов и не представляет полноту всех образовательных записей.", "ВолГУ: образование и прямо связанная страница доступны, но нестандартные карточки без таблицы microdata требуют отдельного сборщика; в эту партию не включены."], "reproduction": {"offline": "python -X utf8 scripts/collect-central-nov09-followup-education.py --output tmp/followup-central-education-replay.json --report tmp/followup-central-education-replay-report.json", "note": "Сеть при offline replay не используется; исходные байты и даты не обновляются."}})
    print(json.dumps(stats, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collect", action="store_true")
    parser.add_argument("--work", type=Path, default=WORK)
    parser.add_argument("--output", type=Path, default=OUT)
    parser.add_argument("--report", type=Path, default=REPORT)
    args = parser.parse_args()
    freeze_baseline(args.work)
    if args.collect:
        if datetime.now(timezone.utc).date().isoformat() != BATCH:
            raise ValueError("Fresh HTTP evidence must match the actual batch UTC date")
        for slug, url in INDEXES.items():
            guard.fetch(args.work, slug, url)
            meta, tree = evidence(args.work, slug, url)
            if slug in DETAILS:
                detail_association(slug, meta, tree, DETAILS[slug])
                guard.fetch(args.work, slug, DETAILS[slug])
    build(args.work, args.output, args.report)


if __name__ == "__main__":
    main()

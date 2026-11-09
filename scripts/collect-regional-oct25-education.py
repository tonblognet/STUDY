"""Gap-only implemented HE listings, frozen on 25 October 2026.

This isolated collector never changes existing fields/units or admission facts.
Raw responses and the frozen baseline stay in ignored tmp/russia-research.
"""

import argparse
import concurrent.futures
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import urljoin, urlparse


ROOT = Path(__file__).resolve().parents[1]
BATCH = "2026-10-25"
WORK = ROOT / f"tmp/russia-research/regional-education-enrichment-{BATCH}"
OUT = ROOT / f"data-sources/russia/regional-education-enrichment-{BATCH}.json"
REPORT = ROOT / f"data-sources/russia/regional-education-collection-report-{BATCH}.json"


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


shared = module("regional", "collect-regional-enrichment.py")
guard = module("contacts_guard", "collect-contacts-enrichment.py")
TARGETS = {
    "russia-4": ["https://www.asu.ru/sveden/education/programs/"],
    "russia-111": ["https://kuzstu.ru/sveden/education/", "https://kuzstu.ru/sveden/education/o-realizuemikh-obrazovatelnikh-programmakh-vissheg/"],
    "russia-183": ["https://omgtu.ru/sveden/education/", "https://omgtu.ru/sveden/education/tablitsa-2-2-obrazovanie-informatsiya-po-obrazovatelnym-programmam-bakalvriat-spetsialitet-magistrat/"],
    "russia-197": ["https://pstu.ru/sveden/education/"],
    "russia-302": ["https://sveden.utmn.ru/sveden/education/", "https://sveden.utmn.ru/sveden/education/eduaccred/"],
    "russia-330": ["https://www.chuvsu.ru/sveden/education/", "https://www.chuvsu.ru/sveden/education/eduaccred/"],
}
guard.OFFICIAL_HOSTS = {slug: {urlparse(url).hostname.removeprefix("www.") for url in urls} for slug, urls in TARGETS.items()}
guard.BATCH = BATCH
clean = shared.clean
dump = shared.dump
PROPS = ("eduCode", "eduName", "eduProf", "eduLevel", "eduForm", "eduNorm", "eduSrok", "learningTerm")
MODES = ("Очная", "Очно-заочная", "Заочная")


def provenance(meta):
    return {"sourceUrl": meta["url"], "sourceYear": None, "checkedAt": meta["checkedAt"], "sourceSha256": meta["sourceSha256"]}


def layout_rows(table):
    """Expand actual cell spans, keeping each cell's literal text and markup."""
    carried = {}
    for index, row in enumerate(table.xpath("./tr|./thead/tr|./tbody/tr|./tfoot/tr")):
        slots = {column: cell for column, (cell, _) in carried.items()}
        carried = {column: (cell, remaining - 1) for column, (cell, remaining) in carried.items() if remaining > 1}
        column = 0
        for cell in row.xpath("./th|./td"):
            while column in slots:
                column += 1
            span = int(cell.get("colspan", "1"))
            for offset in range(span):
                slots[column + offset] = cell
                rows = int(cell.get("rowspan", "1"))
                if rows > 1:
                    carried[column + offset] = (cell, rows - 1)
            column += span
        yield index, row, [slots.get(i) for i in range(max(slots, default=-1) + 1)]


def section(table):
    headings = table.xpath('preceding::*[self::h1 or self::h2 or self::h3 or self::h4][1]')
    return clean(headings[0].text_content()) if headings else ""


def cell_text(cell):
    return clean(cell.text_content()) if cell is not None else ""


def category(code, level):
    """The code cannot resolve an ambiguous published specialist/master level."""
    if re.search(r"магистр", level, re.I):
        return None
    if re.search(r"среднее|аспиран|высшей квалификац|ординат|дополнительн|переподготов|повышение", level, re.I):
        return None
    if ".03." in code and re.search(r"бакалавр|базовое высшее", level, re.I) and not re.search(r"специалитет|специалист", level, re.I):
        return "bachelor_or_basic"
    if ".05." in code and re.search(r"специалитет|специалист|базовое высшее", level, re.I) and not re.search(r"бакалавр", level, re.I):
        return "specialist_or_basic"
    return None


def fact(slug, values, meta, locator, issues, raw_duration=None, duration_header=""):
    code, title, profile, level, forms = [clean(values.get(key) or "") for key in ("eduCode", "eduName", "eduProf", "eduLevel", "eduForm")]
    if not re.fullmatch(r"\d{2}\.(03|05)\.\d{2}", code):
        return None
    if not title or not level or not forms or "�" in " ".join([title, profile, level, forms]) or len(title) > 450:
        return None
    if re.search(r"филиал|Ишим|Тобольск|Алатыр|Канаш|Бийск|Белокурих|Рубцовск|Славгород", " ".join([title, profile, locator.get("section", ""), values.get("unit", "")]), re.I):
        issues.append({"universitySlug": slug, "kind": "offering_other_campus_excluded", "code": code, "title": title, "profile": profile or None, **provenance(meta), **locator})
        return None
    if not category(code, level):
        kind = "source_level_conflict" if re.search(r"магистр", level, re.I) and re.search(r"специалитет|специалист", level, re.I) else "offering_ambiguous_level_excluded"
        issues.append({"universitySlug": slug, "kind": kind, "code": code, "title": title, "profile": profile or None, "level": level, "forms": forms, **provenance(meta), **locator, "note": "Неоднозначный или противоречащий коду уровень не разрешается по самому коду; строка исключена."})
        return None
    if not re.fullmatch(r"(?:очная|очно-заочная|заочная)(?:\s*,\s*(?:очная|очно-заочная|заочная))*", forms, re.I):
        issues.append({"universitySlug": slug, "kind": "offering_form_unrecognized_excluded", "code": code, "title": title, "profile": profile or None, "level": level, "forms": forms, **provenance(meta), **locator, "note": "Форма не исправляется по похожему написанию; строка оставлена на уточнение."})
        return None
    duration = raw_duration or values.get("eduNorm") or values.get("eduSrok") or values.get("learningTerm") or None
    duration_issue = None
    if duration and not re.search(r"год|лет|месяц|недел|дн(?:я|ей)|час", duration, re.I):
        duration_issue = "offering_duration_without_units"
    mode_count = sum(bool(re.search(pattern, forms, re.I)) for pattern in [r"(?<![-\w])очная(?![-\w])", r"очно-заочная", r"(?<![-\w])заочная(?![-\w])"])
    if duration and mode_count > 1:
        duration_issue = "offering_duration_multiple_forms"
    if duration and re.search(r"по очной форме|для очной формы", duration_header, re.I) and forms.casefold() != "очная":
        duration_issue = "offering_duration_other_form_column"
    identity = "|".join([code, title, profile, level, forms])
    result = {"id": slug + "-official-" + hashlib.sha256(identity.encode()).hexdigest()[:16], "code": code, "title": title, "profile": profile or None, "level": level, "forms": forms, "duration": None if duration_issue else duration, "admissionsStatus": "pending_review", **provenance(meta)}
    if locator.get("section"):
        result["sourceSection"] = locator["section"]
    if duration_issue:
        issues.append({"universitySlug": slug, "kind": duration_issue, "offeringId": result["id"], "publishedValue": duration, "publishedColumn": duration_header, **provenance(meta), **locator, "note": "Срок не выведен из числа без единиц или из неоднозначной связи формы и колонки; duration=null."})
    return result


def microdata_rows(slug, document, meta, issues):
    result = []
    for table_index, table in enumerate(document.xpath("//table")):
        if not table.xpath('.//tr[@itemprop="eduAccred"][.//*[@itemprop="eduForm"]]'):
            continue
        header = clean(" ".join(table.xpath(".//th//text()")))
        if re.search(r"численност|трудоустройств|результат[ыа] при[её]ма", header, re.I):
            continue
        heading = section(table)
        for row_index, row, cells in layout_rows(table):
            values = {}
            for cell in cells:
                if cell is None:
                    continue
                nodes = [cell] + cell.xpath(".//*[@itemprop]")
                for node in nodes:
                    prop = node.get("itemprop")
                    if prop in PROPS:
                        values[prop] = cell_text(node)
            locator = {"tableIndex": table_index, "rowIndex": row_index, "section": heading, "literalCells": {key: values.get(key) for key in PROPS if key in values}}
            item = fact(slug, values, meta, locator, issues, duration_header=header)
            if item:
                result.append((item, locator))
    return result


def pstu_rows(document, meta, issues):
    result = []
    for table_index, table in enumerate(document.xpath("//table")):
        caption = clean(" ".join(table.xpath("./caption//text()")))
        if caption != "Бакалавриат, специалитет, магистратура":
            continue
        mode_headers = [cell_text(n) for n in table.xpath('.//th[@itemprop="eduForm"]')]
        if mode_headers != [mode + " форма обучения" for mode in MODES]:
            raise ValueError("PNIPU overview mode columns changed")
        for row_index, row, cells in layout_rows(table):
            if len(cells) != 7 or not row.xpath('./td[@itemprop="eduCode"]'):
                continue
            values = {key: cell_text(cells[index]) for index, key in enumerate(["eduCode", "eduName", "eduLevel"])}
            if not re.fullmatch(r"\d{2}\.(03|05)\.\d{2}", values["eduCode"]):
                continue
            for offset, mode in enumerate(MODES):
                duration = cell_text(cells[3 + offset])
                if duration in {"", "-", "—", "Нет", "нет"}:
                    continue
                if not re.fullmatch(r"\d+(?:[.,]\d+)?(?:\s+(?:год[а]?|лет|месяц(?:а|ев)?)(?:\s+\d+\s+месяц(?:а|ев)?)?)?", duration):
                    issues.append({"universitySlug": "russia-197", "kind": "offering_mode_column_uncertain", "code": values["eduCode"], "title": values["eduName"], "value": duration, "column": mode_headers[offset], **provenance(meta)})
                    continue
                values["eduForm"] = mode
                locator = {"tableIndex": table_index, "rowIndex": row_index, "section": caption, "literalCells": [cell_text(cell) for cell in cells], "formColumnIndex": 3 + offset}
                item = fact("russia-197", values, meta, locator, issues, raw_duration=duration, duration_header=mode_headers[offset])
                if item:
                    result.append((item, locator))
    return result


def omgtu_rows(document, meta, issues):
    result = []
    tables = document.xpath('//table[contains(@class,"table-bordered")]')
    if len(tables) != 1:
        raise ValueError("OmGTU generated overview layout changed")
    table = tables[0]
    headers = [cell_text(cell) for cell in table.xpath("./thead/tr/th")]
    if len(headers) != 14 or headers[:5] != ["Код", "Наименования специальности, направления подготовки", "Уровень образования", "Образовательная программа, направленность, профиль", "Реализуемые формы обучения"] or headers[12] != "Нормативный срок обучения":
        raise ValueError("OmGTU generated overview columns changed")
    for row_index, row, cells in layout_rows(table):
        if not row.xpath("./td") or len(cells) != 14:
            continue
        values = {key: cell_text(cells[index]) for index, key in enumerate(["eduCode", "eduName", "eduLevel", "eduProf", "eduForm"])}
        locator = {"tableIndex": 0, "rowIndex": row_index, "section": "Таблица 1.2 — реализуемые образовательные программы", "literalCells": {key: values[key] for key in values}, "durationCell": cell_text(cells[12])}
        item = fact("russia-183", values, meta, locator, issues, raw_duration=cell_text(cells[12]), duration_header=headers[12])
        if item:
            result.append((item, locator))
    return result


def asu_links(document, base):
    """Only bachelor/specialist detail links explicitly listed by the university."""
    return sorted({urljoin(base, anchor.get("href")) for block in document.xpath('//*[@data-tab="edulevels-bakalavriat" or @data-tab="edulevels-spetsialitet"]') for anchor in block.xpath('.//a[contains(@href,"/sveden/education/programs/")]')})


def asu_rows(document, meta, issues):
    rows = document.xpath('//table[contains(@class,"table_light")][.//td[normalize-space(.)="Уровень подготовки"]]')
    if len(rows) != 1:
        raise ValueError("AltGU program overview layout changed")
    heading = rows[0].xpath('preceding::h2[1]')
    match = re.fullmatch(r"(\d{2}\.(?:03|05)\.\d{2})\.\s*(.+)", cell_text(heading[0])) if heading else None
    if not match:
        raise ValueError("AltGU program heading has no single eligible code/title")
    raw = {cell_text(cells[0]): cell_text(cells[1]) for row in rows[0].xpath("./tr|./tbody/tr") if len(cells := row.xpath("./td")) == 2}
    values = {"eduCode": match[1], "eduName": match[2], "eduProf": raw.get("Профиль") or raw.get("Специализация"), "eduLevel": raw.get("Уровень подготовки"), "eduForm": raw.get("Формы обучения"), "unit": raw.get("Учебное подразделение", "")}
    locator = {"section": "Направления подготовки — сведения о программе", "literalHeading": cell_text(heading[0]), "literalCells": raw}
    item = fact("russia-4", values, meta, locator, issues)
    return [(item, locator)] if item else []


def deduplicate(rows, slug, issues):
    """Exclude level conflicts before collapse; never choose a convenient level."""
    groups, kept, evidence_rows = {}, {}, {}
    for item, locator in rows:
        key = tuple(clean(item.get(field) or "").casefold().replace("ё", "е") for field in ["code", "title", "profile", "forms"])
        groups.setdefault(key, []).append((item, locator))
    def key_for(item):
        return tuple(clean(item.get(field) or "").casefold().replace("ё", "е") for field in ["code", "title", "profile", "forms"])
    invalid = {key_for(issue) for issue in issues if issue.get("universitySlug") == slug and issue.get("kind") in {"offering_ambiguous_level_excluded", "source_level_conflict"}}
    for key, entries in groups.items():
        levels = {clean(item["level"]).casefold().replace("ё", "е") for item, _ in entries}
        if len(levels) > 1 or key in invalid:
            issues.append({"universitySlug": slug, "kind": "offering_level_conflict_excluded", "values": [{**item, "sourceRow": locator} for item, locator in entries], "note": "Одна идентичность имеет разные буквальные уровни; все её строки исключены до уточнения."})
            continue
        item = dict(entries[0][0])
        durations = {entry[0]["duration"] for entry in entries if entry[0]["duration"] is not None}
        if len(durations) > 1:
            item["duration"] = None
            issues.append({"universitySlug": slug, "kind": "offering_duration_conflict", "offeringId": item["id"], "values": sorted(durations), **{key: item[key] for key in ["sourceUrl", "sourceYear", "checkedAt", "sourceSha256"]}})
        kept[item["id"]] = item
        evidence_rows[item["id"]] = [locator for _, locator in entries]
    return list(kept.values()), evidence_rows


def discover(work):
    """Resolve secondary URLs from saved official markup, never guesses."""
    discovered = {slug: [] for slug in TARGETS}
    index = TARGETS["russia-4"][0]
    _, document = evidence(work, "russia-4", index)
    for url in asu_links(document, index):
        discovered["russia-4"].append({"url": url, "discoveredFrom": index, "context": "Explicit bachelor/specialist program detail link in data-tab HE index"})
    overview = TARGETS["russia-183"][-1]
    _, document = evidence(work, "russia-183", overview)
    scripts = "\n".join(document.xpath('//script[not(@src)]/text()'))
    if re.search(r'\$\("#generate-table"\)\.load\("generate_table\.php"\)', scripts):
        discovered["russia-183"].append({"url": urljoin(overview, "generate_table.php"), "discoveredFrom": overview, "context": 'Official inline script: $("#generate-table").load("generate_table.php")'})
    return discovered


def collect_details(work, discovered, refresh=False):
    # Rate limiting ends detail collection for this university immediately.
    for slug, links in discovered.items():
        for link in links:
            result = fetch(work, slug, link["url"], refresh)
            if result.get("httpStatus") == "429":
                print("RATE LIMITED; stopped detail collection for " + slug, flush=True)
                break


def excluded_scope_rows(document, meta, slug):
    """Audit exact overview rows outside the intentionally selected .03/.05 scope."""
    result = []
    for table_index, table in enumerate(document.xpath("//table")):
        if slug == "russia-183":
            selected = meta["url"].endswith("generate_table.php")
        elif slug == "russia-197":
            selected = clean(" ".join(table.xpath("./caption//text()"))) == "Бакалавриат, специалитет, магистратура"
        else:
            selected = bool(table.xpath('.//tr[@itemprop="eduAccred"][.//*[@itemprop="eduForm"]]'))
        if not selected:
            continue
        for row_index, row, cells in layout_rows(table):
            if not row.xpath("./td"):
                continue
            if slug == "russia-183" and len(cells) == 14:
                code, title, level = [cell_text(cell) for cell in cells[:3]]
            else:
                values = {cell.get("itemprop"): cell_text(cell) for cell in cells if cell is not None and cell.get("itemprop")}
                code, title, level = [values.get(key, "") for key in ["eduCode", "eduName", "eduLevel"]]
            if not code or re.fullmatch(r"\d{2}\.(03|05)\.\d{2}", code) or not re.search(r"\d", code):
                continue
            result.append({"universitySlug": slug, "kind": "code_or_level_outside_selected_scope", "code": code, "title": title, "level": level, "tableIndex": table_index, "rowIndex": row_index, **provenance(meta)})
    return result


def build(args):
    frozen = baseline(args.cache_dir)
    discovered = discover(args.cache_dir)
    profiles, sources, issues, all_evidence, per_university, scope_exclusions = [], [], [], {}, [], []
    for slug in TARGETS:
        rows = []
        urls = list(dict.fromkeys(TARGETS[slug] + [link["url"] for link in discovered[slug]]))
        attempts = []
        for url in urls:
            body, metadata = paths(args.cache_dir, slug, url)
            if not metadata.exists():
                attempts.append({"universitySlug": slug, "requestedUrl": url, "httpStatus": "not_fetched", "checkedAt": None, "note": "Collection stopped or URL not fetched; no fact asserted."})
                continue
            source = json.loads(metadata.read_text(encoding="utf-8"))
            attempts.append(source)
            if source.get("error") or str(source.get("httpStatus")) != "200" or source.get("exitCode") != 0:
                continue
            meta, document = evidence(args.cache_dir, slug, url)
            source["snapshotPath"] = body.relative_to(ROOT).as_posix()
            source["metadataPath"] = metadata.relative_to(ROOT).as_posix()
            header = body.with_suffix(".headers.txt")
            if header.exists():
                source["headersPath"] = header.relative_to(ROOT).as_posix()
                source["headersSha256"] = hashlib.sha256(header.read_bytes()).hexdigest()
                content_types = re.findall(r"^content-type:\s*(.+)$", header.read_text(encoding="iso-8859-1"), re.I | re.M)
                source["responseContentType"] = content_types[-1].strip() if content_types else None
            scope_exclusions.extend(excluded_scope_rows(document, meta, slug))
            if slug == "russia-4" and url != TARGETS[slug][0]:
                parsed = asu_rows(document, meta, issues)
            elif slug == "russia-183" and url.endswith("generate_table.php"):
                parsed = omgtu_rows(document, meta, issues)
            elif slug == "russia-197":
                parsed = pstu_rows(document, meta, issues)
            elif slug in {"russia-111", "russia-302", "russia-330"}:
                parsed = microdata_rows(slug, document, meta, issues)
            else:
                parsed = []
            rows.extend(parsed)
        offerings, row_evidence = deduplicate(rows, slug, issues)
        profiles.append({"universitySlug": slug, "fields": {}, "faculties": [], "offerings": offerings})
        all_evidence.update(row_evidence)
        sources.extend(attempts)
        per_university.append({"universitySlug": slug, "name": frozen["universities"][slug]["name"], "city": frozen["universities"][slug]["city"], "implementedOfferings": len(offerings), "parsedRowsBeforeDeduplication": len(rows), "sourceAttempts": len(attempts), "successfulSources": sum(str(source.get("httpStatus")) == "200" and not source.get("error") for source in attempts), "sourceContext": "Реализуемые программы, не сведения о численности, трудоустройстве, результатах приёма или конкурсных группах.", "completeness": "partial", "remaining": "Подтверждение конкурсных программ и условий приёма не выполнено. Перечень ограничен бакалавриатом/специалитетом и базовым высшим образованием с кодами .03/.05; другие уровни не собирались."})
    dates = sorted(source["checkedAt"] for source in sources if source.get("checkedAt"))
    stats = {"universitiesReviewed": len(TARGETS), "universitiesWithCurrentFields": 0, "universitiesWithFaculties": 0, "fields": 0, "faculties": 0, "implementedOfferings": sum(len(profile["offerings"]) for profile in profiles), "universitiesWithEducationalListings": sum(bool(profile["offerings"]) for profile in profiles), "admissionPrograms": 0}
    data = {"checkedAt": dates[-1], "sourceYear": None, "scope": "Дельта образовательных перечней шести существующих региональных карточек по официальным снимкам 25 октября 2026. Поля и подразделения прежних партий не меняются. Только реализуемые программы: sourceYear=null, pending_review; условия приёма, ЕГЭ, цены, баллы, места и сроки приёма не выведены. Перечни частичные; отсутствие записи не означает отсутствия обучения. Суффиксы контингентов в профилях сохраняются буквально и не трактуются как год приёма. У ПНИПУ буквальное название программы сохранено как title, отдельный профиль не выведен; формы связаны с колонками той же строки, числовые сроки без единиц остаются неизвестными.", "profiles": profiles, "sources": sources, "issues": issues, "alreadyCoveredExcluded": [], "stats": stats, "gapBaseline": frozen["gapBaseline"]}
    dump(args.output, data)
    report = {"generatedAt": dates[-1], "sourceCheckedAtRange": [dates[0], dates[-1]], "scope": "Gap-only source review of implemented HE listings; only .03/.05 codes. Master's .04 listings intentionally remain a gap. No admissions programs or existing fields/units changed.", "dataFile": OUT.name, "stats": stats, "perUniversity": per_university, "baselineCoverage": frozen, "sourceAttempts": sources, "sourceAssociations": discovered, "literalSourceRows": all_evidence, "editorialExclusions": issues, "scopeExclusions": scope_exclusions, "limitations": ["AltGU source returned HTTP 429 for many detail URLs; only complete successful detail snapshots were used. Unfetched/unsuccessful URLs add no facts.", "PNIPU overview lists program titles without an independent direction/profile split. Preserve its exact title; profile=null. A mode exists only where its own duration column has a value. Numbers without units do not establish a duration.", "Literal cohort/standard suffixes in HE overview profiles are retained as source scope, never promoted to an admissions year.", "Mixed specialist/master levels are excluded even for .05 codes; a code cannot resolve the ambiguity.", "SPO, master's .04, postgraduate, additional education and other-campus scope are excluded. No current admission, license or accreditation status is asserted."], "reproduction": {"network": "python -X utf8 scripts/collect-regional-oct25-education.py --collect", "offline": "python -X utf8 scripts/collect-regional-oct25-education.py --output tmp/russia-research/regional-education-enrichment-2026-10-25/replay.json --report tmp/russia-research/regional-education-enrichment-2026-10-25/replay-report.json", "baseline": (args.cache_dir / "baseline.json").relative_to(ROOT).as_posix(), "note": "Without --collect this command performs no network requests. Frozen raw responses retain actual retrieval dates. Replay output/report must use tmp paths to preserve the candidate."}, "cacheDirectory": args.cache_dir.relative_to(ROOT).as_posix(), "candidateSha256": hashlib.sha256(args.output.read_bytes()).hexdigest()}
    dump(args.report, report)
    print(json.dumps(stats, ensure_ascii=False), flush=True)


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def paths(work, slug, url):
    stem = work / slug / hashlib.sha256(url.encode()).hexdigest()[:16]
    return stem.with_suffix(".html"), stem.with_suffix(".meta.json")


def fetch(work, slug, requested, refresh=False):
    """Use Windows trust store; validate every bounded redirect before sending."""
    body, metadata = paths(work, slug, requested)
    if metadata.exists() and not refresh:
        return json.loads(metadata.read_text(encoding="utf-8"))
    body.parent.mkdir(parents=True, exist_ok=True)
    record = {"universitySlug": slug, "requestedUrl": requested, "sourceKind": "official_university_page"}
    url, seen, hops = requested, set(), []
    try:
        for hop in range(6):
            guard.validate_source_url(slug, url)
            guard.require_public_resolution(url)
            if url in seen:
                raise ValueError("Source redirect loop")
            seen.add(url)
            headers = body.with_suffix(".headers.txt")
            run = subprocess.run([
                "curl.exe", "-sS", "--max-time", "150", "--connect-timeout", "10",
                "--proto", "=https", "-A", "Postupai-source-verification/1.0",
                "-D", str(headers), "-o", str(body), "-w", "%{http_code}", url,
            ], capture_output=True, timeout=155)
            status = run.stdout.decode("ascii", errors="replace").strip()
            record.update({"url": url, "httpStatus": status, "exitCode": run.returncode, "checkedAt": now()})
            header_text = headers.read_text(encoding="iso-8859-1") if headers.exists() else ""
            hops.append({"url": url, "httpStatus": status})
            record["redirects"] = hops
            if run.returncode:
                raise ValueError(clean(run.stderr.decode("utf-8", errors="replace"))[:400])
            if status in {"301", "302", "303", "307", "308"}:
                locations = re.findall(r"^location:\s*(.+)$", header_text, re.I | re.M)
                if not locations or hop == 5:
                    raise ValueError("Redirect lacks location or exceeds limit")
                url = urljoin(url, locations[-1].strip())
                guard.validate_source_url(slug, url)
                continue
            if status != "200":
                raise ValueError("HTTP " + status)
            raw = body.read_bytes()
            content_types = re.findall(r"^content-type:\s*(.+)$", header_text, re.I | re.M)
            if content_types:
                record["contentType"] = content_types[-1].strip()
            record.update({"body": body.relative_to(work).as_posix(), "sourceSha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)})
            load_document(raw, record.get("contentType", ""))
            break
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        record.update({"error": str(error), "checkedAt": now()})
    dump(metadata, record)
    return record


def load_document(raw, content_type=""):
    charset = re.search(r"charset\s*=\s*([\w-]+)", content_type, re.I)
    document = shared.html.fromstring(raw.decode(charset.group(1), errors="strict")) if charset else shared.tree(raw)
    visible = clean(" ".join(document.xpath('//body//text()[not(ancestor::script) and not(ancestor::style)]')))
    if len(visible) < 180 or re.search(r"checking your browser|ddos.guard|just a moment|подтвердите.{0,25}человек|доступ.{0,15}ограничен", visible[:2500], re.I):
        raise ValueError("Empty source or access challenge")
    return document


def evidence(work, slug, url):
    body, meta_path = paths(work, slug, url)
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    guard.validate_source_metadata(meta, slug, url)
    raw = body.read_bytes()
    if hashlib.sha256(raw).hexdigest() != meta["sourceSha256"]:
        raise ValueError("Raw source SHA-256 mismatch")
    header = body.with_suffix(".headers.txt")
    content_type = meta.get("contentType", "")
    if not content_type and header.exists():
        values = re.findall(r"^content-type:\s*(.+)$", header.read_text(encoding="iso-8859-1"), re.I | re.M)
        content_type = values[-1].strip() if values else ""
    return meta, load_document(raw, content_type)


def baseline(work):
    path = work / "baseline.json"
    if path.exists():
        value = json.loads(path.read_text(encoding="utf-8"))
        if set(value.get("universities", {})) != set(TARGETS) or set(value.get("gapBaseline", {})) != set(TARGETS) or any("educationalListings" not in missing for missing in value["gapBaseline"].values()):
            raise ValueError("Invalid frozen EDU gap baseline")
        return value
    coverage = json.loads((ROOT / "data-sources/russia/coverage.json").read_text(encoding="utf-8"))
    rows = {r["slug"]: r for r in coverage["universities"] if r["slug"] in TARGETS}
    if set(rows) != set(TARGETS) or any(row["educationalListings"] != 0 for row in rows.values()):
        raise ValueError("Target baseline must contain six existing cards with zero EDU listings")
    value = {"generatedAt": now(), "coverageGeneratedAt": coverage["generatedAt"], "gapBaseline": {slug: row["missing"] for slug, row in rows.items()}, "universities": rows}
    dump(path, value)
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collect", action="store_true")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--cache-dir", type=Path, default=WORK)
    parser.add_argument("--output", type=Path, default=OUT)
    parser.add_argument("--report", type=Path, default=REPORT)
    parser.add_argument("--fetch-only", action="store_true")
    args = parser.parse_args()
    baseline(args.cache_dir)
    if args.refresh and not args.collect:
        parser.error("--refresh requires --collect")
    if args.collect:
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            futures = [pool.submit(fetch, args.cache_dir, slug, url, args.refresh) for slug, urls in TARGETS.items() for url in urls]
            for result in concurrent.futures.as_completed(futures):
                meta = result.result()
                print(json.dumps({k: meta.get(k) for k in ["universitySlug", "url", "httpStatus", "bytes", "error"]}, ensure_ascii=False), flush=True)
        if not args.fetch_only:
            collect_details(args.cache_dir, discover(args.cache_dir), args.refresh)
    if not args.fetch_only:
        build(args)


if __name__ == "__main__":
    main()

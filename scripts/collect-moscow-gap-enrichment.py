"""Replay the manually reviewed 20 October Moscow gap batch from official bodies.

The dated cache contains failed priority attempts as well as usable snapshots.
Only the four reviewed organizations below can contribute facts. No intake,
exam, funding, price, accreditation or dormitory availability is inferred.
"""
import argparse
import hashlib
import json
import re
import runpy
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PREVIOUS = runpy.run_path(str(ROOT / "scripts/collect-moscow-targeted-enrichment.py"))
LEGACY = PREVIOUS["LEGACY"]
CLEAN = LEGACY["clean"]
SOURCES = {
    "mfua": ["https://www.mfua.ru/sveden/education/eduaccred", "https://www.mfua.ru/sveden/struct/"],
    "pushkin": ["https://www.pushkin.institute/sveden/education/", "https://www.pushkin.institute/sveden/struct/", "https://www.pushkin.institute/abitur/", "https://www.pushkin.institute/institut/dormitory/"],
    "moscow-110266": ["https://imeit.ru/sveden/education/eduaccred/"],
    "guu": ["http://guu.ru/sveden/education/"],
}
REVIEWED_TABLES = {"mfua": (1, 2, 3), "pushkin": (0,), "moscow-110266": (0,)}
PRIORITIES = ["mgu", "mai", "mipt", "mephi", "mpei", "rudn"]
PREVIOUS["REVIEWED_EDUCATION_TABLES"].update(REVIEWED_TABLES)
HOSTEL_TEXT = "Пятиместный блок состоит из двух комнат (двухместной и трёхместной) и санузла. Двухместный блок состоит из одной комнаты и санузла."
PUSHKIN_UNCONFIRMED_HE_UNIT = "Кафедра интенсивного обучения русскому языку как иностранному"


def text(node):
    return CLEAN(" ".join(node.itertext()))


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def guu_rows(tree, meta):
    """A heading and vertical two-column table are one program, never statistics."""
    rows, evidence, issues = [], [], []
    for index, table in enumerate(tree.xpath('//table')):
        fields = {}
        for line in table.xpath('.//tr'):
            cells = line.xpath('./td|./th')
            if len(cells) == 2:
                fields.setdefault(text(cells[0]), text(cells[1]))
        code = fields.get("Код направления", "")
        if not code:
            continue
        if not re.fullmatch(r"\d{2}\.(?:03|04|05)\.\d{2}", code):
            issues.append({"universitySlug": "guu", "kind": "mixed_or_unsupported_direction_codes", "tableIndex": index, "publishedCode": code, "sourceUrl": meta["url"]})
            continue
        wraps = table.xpath('ancestor::div[contains(concat(" ",normalize-space(@class)," ")," toggle-wrap ")][1]')
        headings = wraps[0].xpath('./div[contains(concat(" ",normalize-space(@class)," ")," toggle ")]/h4') if wraps else []
        heading = text(headings[0]) if len(headings) == 1 else ""
        profile = heading[len(code):].strip() if heading.startswith(code + " ") else ""
        title, level, forms = [fields.get(key, "") for key in ["Направление", "Уровень образования", "Форма обучения"]]
        if not profile or not title or not re.fullmatch(r"Бакалавриат|Магистратура|Специалитет", level, re.I) or not re.search(r"очн|заочн", forms, re.I):
            issues.append({"universitySlug": "guu", "kind": "unreviewed_program_block", "tableIndex": index, "heading": heading, "sourceUrl": meta["url"]})
            continue
        duration = fields.get("Нормативный срок обучения") or fields.get("Нормативны й срок обучения")
        if len(PREVIOUS["form_set"](forms)) > 1:
            duration = None
            issues.append({"universitySlug": "guu", "kind": "unpaired_multiple_forms", "tableIndex": index, "forms": forms, "sourceUrl": meta["url"]})
        row = {"code": code, "title": title, "profile": profile, "level": level, "forms": forms,
               "duration": duration or None, "admissionsStatus": "pending_review", **LEGACY["provenance"](meta), "sourceYear": None}
        rows.append(row)
        evidence.append({"tableIndex": index, "heading": heading, "code": code, "title": title, "profile": profile,
                         "level": level, "forms": forms, "duration": duration or None})
    return rows, evidence, issues


def units(tree, meta, slug, issues=None):
    result = []
    tables = tree.xpath('//table')
    if slug == "mfua" and len(tables) > 3:
        # Table 2 includes colleges, school and DPO; only its IT institute is
        # higher education (already present). Table 3 lists degree departments.
        for row in tables[3].xpath('.//tr'):
            cells = row.xpath('./td')
            if len(cells) > 1:
                name = text(cells[1])
                if name.startswith("Кафедра "):
                    result.append({"name": name, "url": None, **LEGACY["provenance"](meta), "sourceSection": "Кафедры; таблица 3 структуры организации"})
    elif slug == "pushkin" and len(tables) > 1:
        # The source's educational-management table is hierarchical. The
        # preparatory faculty and its two departments are outside this batch.
        preparatory = False
        for row in tables[1].xpath('.//tr'):
            nodes = row.xpath('.//*[@itemprop="name"]')
            name = text(nodes[0]) if nodes else ""
            if name == "Подготовительный факультет":
                preparatory = True
            if not preparatory and re.match(r"^(Филологический факультет|Факультет |Кафедра )", name):
                if name == PUSHKIN_UNCONFIRMED_HE_UNIT:
                    if issues is not None:
                        issues.append({"universitySlug": slug, "kind": "academic_unit_scope_unresolved", "name": name, **LEGACY["provenance"](meta), "scopeReviewUrl": "https://www.pushkin.institute/superior_education/obuchenie_rki/", "note": "Структура подтверждает название кафедры, но её опубликованное описание относится к краткосрочным курсам русского языка. Самостоятельное участие в программах высшего образования в этой партии не подтверждено; подразделение исключено до отдельной проверки, его отсутствие не утверждается."})
                    continue
                result.append({"name": name, "url": None, **LEGACY["provenance"](meta), "sourceSection": "Управление образовательной деятельности; таблица 1 структуры организации"})
    return result


def reviewed_fields(tree, meta, slug, prior):
    visible = CLEAN(" ".join(tree.xpath('//body//text()[not(ancestor::script) and not(ancestor::style)]')))
    candidates = {}
    if slug == "pushkin" and "/abitur/" in meta["url"]:
        candidates = {"admissionsEmail": "abiturient@pushkin.institute"}
    if slug == "pushkin" and "/dormitory/" in meta["url"]:
        candidates = {"hostelInfo": HOSTEL_TEXT}
    if slug == "mfua" and "/struct/" in meta["url"]:
        # The commission row supplies two literal numbers, rather than a
        # generic footer. Its cross-domain personal email is left unimported.
        for row in tree.xpath('//table//tr'):
            row_text = text(row)
            if "Приемная комиссия" in row_text and "+7 (499) 979-00-99, (495) 221-10-01" in row_text:
                candidates = {"admissionsPhone": "+7 (499) 979-00-99, (495) 221-10-01"}
    return {key: {"value": value, **LEGACY["provenance"](meta)} for key, value in candidates.items()
            if key not in prior and value in visible}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collection-date", default="2026-10-20")
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--offline", action="store_true")
    options = parser.parse_args()
    datetime.strptime(options.collection_date, "%Y-%m-%d")
    cache = options.cache_dir or ROOT / ("tmp/russia-research/moscow-enrichment-" + options.collection_date)
    prior = PREVIOUS["prior_profiles"](options.collection_date)
    university_map = {u["slug"]: u for u in LEGACY["UNIVERSITIES"]}
    profiles, issues, reviewed = [], [], []
    for slug, urls in SOURCES.items():
        fields, faculties, candidates = {}, {}, []
        known_units = {PREVIOUS["normalized"](f["name"]) for f in prior[slug].get("faculties", [])}
        known_rows = {PREVIOUS["identity"](r) for r in prior[slug]["offerings"]}
        for url in urls:
            folder = cache / slug
            folder.mkdir(parents=True, exist_ok=True)
            tree, meta = PREVIOUS["load_page"](url, folder, options.offline)
            if tree is None:
                issues.append({"universitySlug": slug, "kind": "reviewed_source_unavailable", "sourceUrl": url})
                continue
            expected, actual = LEGACY["host"](university_map[slug]["website"]), LEGACY["host"](meta["url"])
            if actual != expected and not actual.endswith("." + expected):
                issues.append({"universitySlug": slug, "kind": "unexpected_organization_domain", "sourceUrl": meta["url"]})
                continue
            fields.update(reviewed_fields(tree, meta, slug, prior[slug]["fields"]))
            if "/struct/" in meta["url"]:
                for unit in units(tree, meta, slug, issues):
                    key = PREVIOUS["normalized"](unit["name"])
                    if key not in known_units:
                        faculties.setdefault(key, unit)
            if "/education/" in meta["url"]:
                if slug == "guu":
                    rows, evidence, source_issues = guu_rows(tree, meta)
                    issues.extend(source_issues)
                    reviewed.append({"universitySlug": slug, "sourceUrl": meta["url"], "verticalProgramBlocks": evidence})
                else:
                    rows = PREVIOUS["education_rows"](tree, meta, university_map[slug])
                    for row in rows:
                        if row.get("duration") and re.fullmatch(r"\d+(?:[.,]\d+)?", row["duration"]):
                            issues.append({"universitySlug": slug, "kind": "duration_missing_unit", "code": row["code"], "profile": row["profile"], "forms": row["forms"], "publishedDuration": row["duration"], "sourceUrl": meta["url"], "note": "A bare number does not establish years or months; duration remains unknown."})
                            row["duration"] = None
                    reviewed.append({"universitySlug": slug, "sourceUrl": meta["url"], "reviewedEducationTableIndexes": list(REVIEWED_TABLES[slug]), "excluded": "Other tables: secondary, additional, postgraduate education, statistics or duplicate OP descriptions"})
                candidates.extend(rows)
        collapsed, conflicts = PREVIOUS["collapse_rows"](candidates, slug)
        issues.extend(conflicts)
        offerings = [r for r in collapsed if PREVIOUS["identity"](r) not in known_rows]
        profiles.append({"universitySlug": slug, "fields": fields, "faculties": list(faculties.values()), "offerings": offerings})
        print(slug, "fields", len(fields), "units", len(faculties), "offerings", len(offerings), flush=True)
    manifest = []
    for path in sorted(cache.glob('*/*.meta.json')):
        meta = json.loads(path.read_text(encoding="utf-8"))
        body = path.with_name(path.name.replace(".meta.json", ".html"))
        if body.exists() and meta.get("sourceSha256") != hashlib.sha256(body.read_bytes()).hexdigest():
            raise ValueError("Snapshot SHA-256 mismatch: " + str(path))
        # The legacy fetcher rejects protective HTTP-200 pages in memory;
        # persist that assessment in the dated manifest as well.
        if meta.get("httpStatus") == "200" and not meta.get("exitCode") and body.exists():
            tree = LEGACY["read_tree"](body.read_bytes())
            visible = CLEAN(" ".join(tree.xpath('//body//text()[not(ancestor::script) and not(ancestor::style)]')))
            if len(visible) < 180 or re.search(r"checking your browser|ddos.guard|just a moment|доступ.{0,15}ограничен|подтвердите.{0,15}человек", visible[:2000], re.I):
                meta["rejected"] = "empty_or_access_challenge"
        manifest.append({"universitySlug": path.parent.name, **meta})
    for slug in PRIORITIES:
        attempts = [m for m in manifest if m["universitySlug"] == slug]
        issues.append({"universitySlug": slug, "kind": "priority_sources_unavailable", "attempts": len(attempts), "note": "No usable authenticated HTTP-200 content obtained; protective pages, TLS errors and timeouts do not prove missing education or institution closure."})
    issues.append({"universitySlug": "mfua", "kind": "cross_domain_commission_email_not_imported", "sourceUrl": SOURCES["mfua"][1], "note": "The commission row contains a personal masi.ru address. It is retained in the raw source, not promoted to the university admissions-email field."})
    summary = {"universitiesReviewed": len(profiles), "universitiesWithNewOfferings": sum(bool(p["offerings"]) for p in profiles), "newOfferings": sum(len(p["offerings"]) for p in profiles), "universitiesWithFaculties": sum(bool(p["faculties"]) for p in profiles), "faculties": sum(len(p["faculties"]) for p in profiles), "newFields": sum(len(p["fields"]) for p in profiles), "pagesRequested": len(manifest), "researchUniversitiesAttempted": len({m["universitySlug"] for m in manifest}), "unsuccessfulSources": sum(m.get("httpStatus") != "200" or bool(m.get("exitCode")) or bool(m.get("rejected")) for m in manifest)}
    source_dates = [m["checkedAt"] for m in manifest if m.get("checkedAt")]
    data = {"schemaVersion": 1, "collectionDate": options.collection_date, "checkedAt": max(source_dates, key=datetime.fromisoformat) if source_dates else None, "reviewGeneratedAt": datetime.now(timezone.utc).isoformat(), "sourceYear": int(options.collection_date[:4]), "status": "incomplete", "scope": "Four existing Moscow gaps, plus recorded failed attempts at the six named priority universities", "note": "Implemented higher-education listings only; sourceYear=null and pending_review for all new listings. Current intake, exams, places, prices, scores and licensing are not established. The two mixed-code GUU blocks, postgraduate tables, statistics, MFUA colleges/DPO, Pushkin preparatory faculty and intensive-Russian department with unconfirmed HE scope are excluded. Teaching departments are not counts of independent faculties. Hostel text describes rooms, not an availability guarantee.", "profiles": profiles, "sourceManifest": manifest, "reviewedSourceSections": reviewed, "collectionIssues": issues, "summary": summary}
    dump(options.output or ROOT / ("data-sources/russia/moscow-enrichment-" + options.collection_date + ".json"), data)
    dump(options.report or ROOT / ("data-sources/russia/moscow-collection-report-" + options.collection_date + ".json"), {k: v for k, v in data.items() if k != "profiles"})
    print("COMPLETE", summary, flush=True)


if __name__ == "__main__":
    main()

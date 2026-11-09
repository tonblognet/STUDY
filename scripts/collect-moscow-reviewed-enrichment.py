"""Collect/replay the scoped 22 October Moscow gap batch from official bodies.

Only reviewed tables/units below can contribute facts. Raw snapshots and their
original acquisition times are preserved; no current intake is inferred.
"""
import argparse
import hashlib
import json
import re
import runpy
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HELPERS = runpy.run_path(str(ROOT / "scripts/collect-moscow-targeted-enrichment.py"))
LEGACY = HELPERS["LEGACY"]
CLEAN = LEGACY["clean"]
SOURCES = {
    "mgppu": ["https://mgppu.ru/sveden/education", "https://mgppu.ru/sveden/struct", "https://mgppu.ru/sveden/common"],
    "mirea": ["https://www.mirea.ru/sveden/education/eduaccred", "https://www.mirea.ru/sveden/struct/", "https://www.mirea.ru/sveden/common/"],
    "mtuci": ["https://mtuci.ru/sveden/education/", "https://mtuci.ru/sveden/struct/", "https://mtuci.ru/sveden/common/"],
    "rsuh": ["https://www.rsuh.ru/sveden/education/", "https://www.rsuh.ru/sveden/struct/"],
    "mipt": ["https://mipt.ru/sveden/struct/", "https://mipt.ru/sveden/common/"],
    "mephi": ["https://mephi.ru/node/18496"],
    "rudn": ["https://www.rudn.ru/sveden/struct/"],
    "mpei": ["https://mpei.ru/sveden/struct/"],
}
# These receipts corroborate the HE role of already selected units. They belong
# only to the review report, keeping the frozen 740-row candidate unchanged.
SUPPLEMENTARY_SCOPE_SOURCES = {
    "https://mephi.ru/about/cae/igpt/aim": {
        "unitName": "Институт общей профессиональной подготовки",
        "sourceYear": None,
        "evidenceSnippets": ["обеспечение высококачественной (фундаментальной) базовой подготовки студентов бакалавриата и специалитета;"],
        "association": "The institute provides foundational bachelor/specialist teaching; it is not merely a preparatory or additional-education unit.",
    },
    "https://admission.mephi.ru/admission/magistracy/education/programs": {
        "unitName": "Институт фундаментальных проблем социо-гуманитарных наук",
        "sourceYear": 2026,
        "evidenceSnippets": ["Институт фундаментальных проблем социо-гуманитарных наук", "Направление 44.04.02 Психолого-педагогическое образование", "Психология и педагогика в наукоемких и высокотехнологичных сферах"],
        "association": "The official master's-program list places direction 44.04.02 and the named profile immediately under this institute. This supports the unit's HE role; no program or intake fact is imported from this supplement.",
    },
}
# Zero-based source tables: implemented HE overview only, excluding statistical,
# secondary, additional and postgraduate tables and duplicate OP descriptions.
EDUCATION_TABLES = {"mgppu": (0,), "mirea": (1, 2, 3), "mtuci": (7,), "rsuh": (2, 3, 4)}
UNIT_TABLES = {"mgppu": 0, "mirea": 0, "rsuh": 2, "mipt": 1, "mephi": 0, "rudn": 0, "mpei": 3}
MIREA_UNITS = {
    "Институт информационных технологий",
    "Институт перспективных технологий и индустриального программирования",
    "Институт искусственного интеллекта",
    "Институт кибербезопасности и цифровых технологий",
    "Институт радиоэлектроники и информатики",
    "Институт технологий управления",
    "Институт тонких химических технологий им. М.В. Ломоносова",
}
MIPT_UNITS = {
    "Высшая школа программной инженерии МФТИ (ВШПИ)",
    "Высшая школа современной математики (ВШМ)",
    "Физтех-школа аэрокосмических технологий (ФАКТ)",
    "Физтех-школа биологической и медицинской физики (ФБМФ)",
    "Физтех-школа прикладной математики и информатики (ФПМИ)",
    "Физтех-школа радиотехники и компьютерных технологий (ФРКТ)",
    "Физтех-школа физики и исследований им. Ландау (ЛФИ)",
    "Физтех-школа электроники, фотоники и молекулярной физики (ФЭФМ)",
}
# Conservative subset of the official Faculties/Institutes table. Specialized
# medicine, research, Russian-language and supplementary units need separate HE
# scope review; their exclusion does not assert absence of degree teaching.
RUDN_UNITS = {
    "Аграрно-технологический институт", "Инженерная академия",
    "Институт внешнеэкономической безопасности и таможенного дела",
    "Институт иностранных языков", "Институт экологии", "Медицинский институт",
    "Факультет гуманитарных и социальных наук", "Факультет искусственного интеллекта",
    "Факультет физико-математических и естественных наук", "Филологический факультет",
    "Экономический факультет", "Юридический институт",
}
EXCLUDE = re.compile(r"дополнительн|повышени[ея] квалификац|переподготов|довузов|подготовитель|непрерывного медицинского|филиал", re.I)


def text(node):
    return CLEAN(" ".join(node.itertext()))


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def prop(node, name):
    found = node.xpath('.//*[@itemprop="' + name + '"]')
    return text(found[0]) if len(found) == 1 else ""


def education_rows(tree, meta, slug):
    """Each source row must itself carry every identity field, even with rowspan.

    MIREA repeats complete identity cells while retaining rowspan attributes.
    Never forward-fill a missing code/profile/form from an adjacent source row.
    """
    result, evidence, issues = [], [], []
    for table_index in EDUCATION_TABLES[slug]:
        table = tree.xpath('//table')[table_index]
        for row_index, element in enumerate(table.xpath('.//tr')):
            raw = {key: prop(element, key) for key in ["eduCode", "eduName", "eduProf", "eduLevel", "eduForm", "learningTerm"]}
            code = raw["eduCode"].rstrip(".")
            if not re.fullmatch(r"\d{2}\.(?:03|04|05)\.\d{2}", code):
                continue
            title, level, forms = [raw[key] for key in ["eduName", "eduLevel", "eduForm"]]
            if not all([title, level, forms]) or not re.search(r"бакалавр|магистр|специалитет|специалист", level, re.I) or EXCLUDE.search(level):
                issues.append({"universitySlug": slug, "kind": "incomplete_or_out_of_scope_education_row", "tableIndex": table_index, "rowIndex": row_index, "publishedFields": raw, "sourceUrl": meta["url"]})
                continue
            if not re.search(r"очн|заочн", forms, re.I) or re.search(r"не реализу|не предусмотрен", forms, re.I) or re.search(r"филиал|тараз|казахстан", title + " " + raw["eduProf"], re.I):
                continue
            if code == "46.03.01" and "культуролог" in title.casefold():
                issues.append({"universitySlug": slug, "kind": "source_code_title_conflict", "tableIndex": table_index, "rowIndex": row_index, "publishedFields": raw, "sourceUrl": meta["url"]})
                continue
            duration = raw["learningTerm"] or None
            if duration and not re.search(r"год|года|лет|месяц|мес\.?|\b[гл]\.", duration, re.I):
                issues.append({"universitySlug": slug, "kind": "duration_missing_unit", "tableIndex": table_index, "rowIndex": row_index, "publishedDuration": duration, "sourceUrl": meta["url"]})
                duration = None
            if len(HELPERS["form_set"](forms)) > 1:
                issues.append({"universitySlug": slug, "kind": "unpaired_multiple_forms", "tableIndex": table_index, "rowIndex": row_index, "forms": forms, "publishedDuration": duration, "sourceUrl": meta["url"]})
                duration = None
            item = {"code": code, "title": title, "profile": HELPERS["profile_name"](raw["eduProf"]), "level": level,
                    "forms": forms, "duration": duration, "admissionsStatus": "pending_review", **LEGACY["provenance"](meta), "sourceYear": None}
            result.append(item)
            evidence.append({"tableIndex": table_index, "rowIndex": row_index, "publishedFields": raw, "identity": HELPERS["identity"](item), "duration": duration})
    return result, evidence, issues


def explicit_he_levels(value):
    """Read degree labels from the source text, never from the program code."""
    return frozenset(name for name, pattern in [
        ("bachelor", r"бакалавр"),
        ("master", r"магистр"),
        ("specialist", r"специалист|специалитет"),
    ] if re.search(pattern, value, re.I))


def exclude_conflicting_levels(rows, evidence, slug):
    """Keep contradictory degree labels out before identity deduplication.

    Full/short labels for one degree are equivalent. Different explicit degree
    sets for the same code/title/profile/form remain a source conflict, with
    every original table row and its original acquisition receipt preserved.
    """
    grouped = {}
    for row, raw in zip(rows, evidence, strict=True):
        key = (row["code"], HELPERS["normalized"](row["title"]),
               HELPERS["normalized"](HELPERS["profile_name"](row.get("profile"))),
               HELPERS["form_identity"](row["forms"]))
        grouped.setdefault(key, []).append((row, raw))
    kept, issues = [], []
    for members in grouped.values():
        levels = {explicit_he_levels(row["level"]) for row, _ in members}
        if len(levels) <= 1:
            kept.extend(row for row, _ in members)
            continue
        first = members[0][0]
        issues.append({"universitySlug": slug, "kind": "source_level_conflict",
                       **{field: first.get(field) for field in ["code", "title", "profile", "forms"]},
                       "publishedLevels": sorted({row["level"] for row, _ in members}),
                       "sourceRows": [{**raw, **{field: row[field] for field in ["sourceUrl", "sourceYear", "checkedAt", "sourceSha256"]}} for row, raw in members],
                       **{field: first[field] for field in ["sourceUrl", "sourceYear", "checkedAt", "sourceSha256"]},
                       "note": "The same program/profile/form publishes contradictory explicit degree levels. All rows of this ambiguous identity are excluded before collapse; no level is inferred from its code."})
    return kept, issues


def selected_unit(slug, name):
    if EXCLUDE.search(name):
        return False
    if slug == "mgppu":
        return name.startswith("Факультет ")
    if slug == "mirea":
        return name in MIREA_UNITS
    if slug == "mipt":
        return name in MIPT_UNITS
    if slug == "rudn":
        return name in RUDN_UNITS
    if slug == "mpei":
        return "институт" in name.casefold() and not name.startswith("Военно")
    if slug == "mephi":
        return bool(re.match(r"^(Институт|Инженерно-физический институт|Факультет)", name)) and "иностранных учащихся" not in name.casefold()
    if slug == "rsuh":
        return bool(re.match(r"^(Институт |Историко-архивный институт|Историко-филологический факультет|Исторический факультет|Социологический факультет|Факультет |Философский факультет|Экономический факультет|Юридический факультет)", name))
    return False


def structural_units(tree, meta, slug):
    result, evidence = {}, []
    if slug == "mtuci":
        elements = tree.xpath('//*[@itemprop="structOrgUprav"]')
    else:
        elements = tree.xpath('//table')[UNIT_TABLES[slug]].xpath('.//tr')
    for index, row in enumerate(elements):
        name, address = prop(row, "name"), prop(row, "addressStr")
        if slug == "mephi":
            cells = row.xpath('./td|./th')
            if len(cells) < 7:
                continue
            name, address = text(cells[0]), text(cells[3])
        allowed = name.startswith("Факультет ") if slug == "mtuci" else selected_unit(slug, name)
        if not allowed:
            continue
        city = "Долгопрудный" if slug == "mipt" else "Москва"
        if city not in address:
            raise ValueError("Selected unit has no reviewed main-city address: " + slug + ": " + name + ": " + address)
        # Unit homepages are deliberately unknown: table links may be generic,
        # regulations, cross-domain sites, or malformed addresses.
        item = {"name": name, "url": None, **LEGACY["provenance"](meta), "sourceSection": "Факультеты/институты с проверенным адресом; " + ("карточки structOrgUprav" if slug == "mtuci" else "таблица " + str(UNIT_TABLES[slug]))}
        result.setdefault(HELPERS["normalized"](name), item)
        evidence.append({"rowIndex": index, "name": name, "publishedAddress": address, "scope": "Higher-education teaching unit at the named main-city address; additional/preparatory/research-only selections excluded"})
    return list(result.values()), evidence


def general_fields(tree, meta, prior, slug):
    result = {}
    for key in ["fullName", "shortName", "regDate", "address", "telephone", "email"]:
        if key in prior:
            continue
        nodes = tree.xpath('//*[@itemprop="' + key + '"]')
        if not nodes:
            continue
        value = text(nodes[0])
        if slug == "mtuci" and key in ("fullName", "shortName"):
            # itemprop tags annotate the label; its sibling contains the fact.
            value = text(nodes[0].getparent()).removeprefix(value).strip()
        if slug == "mipt" and key == "email":
            value = "info@mipt.ru" if "справочная: info@mipt.ru" in value else ""
        if key == "email" and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            continue
        if key == "regDate" and not re.search(r"(?:18|19|20)\d{2}", value):
            continue
        if value and len(value) <= 600:
            result[key] = {"value": value, **LEGACY["provenance"](meta)}
    return result


def supplementary_scope_evidence(cache):
    """Read the two frozen receipts without altering catalog facts or dates."""
    receipts = {}
    for path in sorted((cache / "mephi").glob('*.meta.json')):
        meta = json.loads(path.read_text(encoding="utf-8"))
        url = meta.get("requestedUrl")
        if url not in SUPPLEMENTARY_SCOPE_SOURCES:
            continue
        body = path.with_name(path.name.replace(".meta.json", ".html"))
        if meta.get("httpStatus") != "200" or meta.get("exitCode") or meta.get("rejected") or not body.exists():
            raise ValueError("Supplementary scope receipt is not usable HTTP 200: " + str(path))
        if hashlib.sha256(body.read_bytes()).hexdigest() != meta.get("sourceSha256"):
            raise ValueError("Supplementary scope receipt SHA mismatch: " + str(path))
        if LEGACY["host"](meta["url"]) not in ("mephi.ru", "admission.mephi.ru"):
            raise ValueError("Unexpected supplementary organization domain: " + meta["url"])
        expected = SUPPLEMENTARY_SCOPE_SOURCES[url]
        tree = LEGACY["read_tree"](body.read_bytes())
        visible = CLEAN(" ".join(tree.xpath('//body//text()[not(ancestor::script) and not(ancestor::style)]')))
        if any(snippet not in visible for snippet in expected["evidenceSnippets"]):
            raise ValueError("Supplementary scope evidence no longer matches: " + url)
        if "magistracy" in url:
            headings = [n for n in tree.xpath('//h3') if text(n) == expected["unitName"]]
            if len(headings) != 1:
                raise ValueError("Supplementary institute heading is ambiguous: " + url)
            siblings = list(headings[0].itersiblings())
            direction = next((n for n in siblings if n.tag == "p"), None)
            if direction is None or text(direction) != expected["evidenceSnippets"][1]:
                raise ValueError("Supplementary institute/direction association does not match: " + url)
        receipts[url] = {"universitySlug": "mephi", "unitName": expected["unitName"],
                         "purpose": "HE scope confirmation only; no new catalog fact", "sourceYear": expected["sourceYear"],
                         "evidenceSnippets": expected["evidenceSnippets"], "association": expected["association"],
                         "sourceReceipt": meta, "snapshotBody": str(body.relative_to(ROOT)).replace("\\", "/")}
    missing = set(SUPPLEMENTARY_SCOPE_SOURCES) - set(receipts)
    if missing:
        raise ValueError("Missing frozen supplementary scope receipts: " + ", ".join(sorted(missing)))
    return [receipts[url] for url in SUPPLEMENTARY_SCOPE_SOURCES]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collection-date", default="2026-10-22")
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
    prior = HELPERS["prior_profiles"](options.collection_date)
    universities = {u["slug"]: u for u in LEGACY["UNIVERSITIES"]}
    profiles, manifest, reviewed, issues = [], {}, [], []
    for slug, urls in SOURCES.items():
        fields, units, rows, row_evidence = {}, {}, [], []
        for url in urls:
            folder = cache / slug
            folder.mkdir(parents=True, exist_ok=True)
            tree, meta = HELPERS["load_page"](url, folder, options.offline)
            manifest[(slug, url)] = {"universitySlug": slug, **meta}
            if tree is None:
                issues.append({"universitySlug": slug, "kind": "reviewed_source_unavailable", "sourceUrl": url})
                continue
            expected, actual = LEGACY["host"](universities[slug]["website"]), LEGACY["host"](meta["url"])
            if actual != expected and not actual.endswith("." + expected):
                raise ValueError("Unexpected organization domain: " + meta["url"])
            if "/common" in meta["url"]:
                fields.update(general_fields(tree, meta, prior[slug]["fields"], slug))
            elif "/struct" in meta["url"] or slug == "mephi":
                found, evidence = structural_units(tree, meta, slug)
                known = {HELPERS["normalized"](f["name"]) for f in prior[slug].get("faculties", [])}
                units.update({HELPERS["normalized"](u["name"]): u for u in found if HELPERS["normalized"](u["name"]) not in known})
                reviewed.append({"universitySlug": slug, "sourceUrl": meta["url"], "academicUnits": evidence})
            elif "/education" in meta["url"]:
                found, evidence, row_issues = education_rows(tree, meta, slug)
                rows.extend(found)
                row_evidence.extend(evidence)
                issues.extend(row_issues)
                reviewed.append({"universitySlug": slug, "sourceUrl": meta["url"], "reviewedEducationTableIndexes": list(EDUCATION_TABLES[slug]), "educationalRows": evidence})
        rows, level_conflicts = exclude_conflicting_levels(rows, row_evidence, slug)
        issues.extend(level_conflicts)
        collapsed, conflicts = HELPERS["collapse_rows"](rows, slug)
        issues.extend(conflicts)
        known = {HELPERS["identity"](r) for r in prior[slug]["offerings"]}
        offerings = [r for r in collapsed if HELPERS["identity"](r) not in known]
        profiles.append({"universitySlug": slug, "fields": fields, "faculties": list(units.values()), "offerings": offerings})
        print(slug, "fields", len(fields), "units", len(units), "offerings", len(offerings), flush=True)
    # Keep discovery requests and failures in the report, without promoting a
    # successful-looking but unusable page into any catalog fact.
    for path in sorted(cache.glob('*/*.meta.json')):
        meta = json.loads(path.read_text(encoding="utf-8"))
        if meta.get("requestedUrl") in SUPPLEMENTARY_SCOPE_SOURCES:
            continue
        body = path.with_name(path.name.replace(".meta.json", ".html"))
        if body.exists() and meta.get("sourceSha256") != hashlib.sha256(body.read_bytes()).hexdigest():
            raise ValueError("Snapshot SHA-256 mismatch: " + str(path))
        if meta.get("httpStatus") == "200" and not meta.get("exitCode") and body.exists():
            tree = LEGACY["read_tree"](body.read_bytes())
            visible = CLEAN(" ".join(tree.xpath('//body//text()[not(ancestor::script) and not(ancestor::style)]')))
            if len(visible) < 180 or re.search(r"checking your browser|ddos.guard|just a moment|доступ.{0,15}ограничен|подтвердите.{0,15}человек", visible[:2000], re.I):
                meta["rejected"] = "empty_or_access_challenge"
        manifest.setdefault((path.parent.name, meta["requestedUrl"]), {"universitySlug": path.parent.name, **meta})
    manifest = sorted(manifest.values(), key=lambda m: (m["universitySlug"], m["requestedUrl"]))
    for slug in ("mgu", "mai"):
        issues.append({"universitySlug": slug, "kind": "priority_sources_unavailable", "note": "One fresh official request failed or returned an access challenge. No absence of teaching, intake or institution activity is inferred."})
    issues.extend([
        {"universitySlug": "mipt", "kind": "campus_scope_limited", "note": "Only eight reviewed main-campus teaching schools with Dolgoprudny addresses. Moscow-only, mixed-city, Zhukovsky, business/additional and research institutes are excluded. Education landing page carries no implemented HE overview rows; its research statistics are not programs."},
        {"universitySlug": "mpei", "kind": "scope_limited", "note": "Only the ten civil institutes in table 3 with Moscow addresses. The military institute, preparatory/DPO units, nested legacy duplicates and other-city branches are excluded; no military-center fact is inferred."},
        {"universitySlug": "rudn", "kind": "scope_limited", "note": "Conservative subset of twelve main Moscow HE units. Specialist/research/language-preparation and continuous-medical-education units need separate scope review; Sochi and Tashkent units excluded."},
        {"universitySlug": "mgppu", "kind": "scope_limited", "note": "Nine degree faculties only; experimental-psychology research institute and qualification faculty excluded."},
        {"universitySlug": "mirea", "kind": "scope_limited", "note": "Seven reviewed degree institutes. International/preparatory/additional and youth-policy units excluded. Literal mixed specialist/master level retained. Cohort suffixes are removed only for identity; all original rows are retained in evidence."},
    ])
    summary = {"universitiesReviewed": len(profiles), "universitiesWithNewOfferings": sum(bool(p["offerings"]) for p in profiles), "newOfferings": sum(len(p["offerings"]) for p in profiles), "universitiesWithFaculties": sum(bool(p["faculties"]) for p in profiles), "faculties": sum(len(p["faculties"]) for p in profiles), "newFields": sum(len(p["fields"]) for p in profiles), "pagesRequested": len(manifest), "researchUniversitiesAttempted": len({m["universitySlug"] for m in manifest}), "unsuccessfulSources": sum(m.get("httpStatus") != "200" or bool(m.get("exitCode")) or bool(m.get("rejected")) for m in manifest)}
    dates = [m["checkedAt"] for m in manifest if m.get("checkedAt")]
    data = {"schemaVersion": 1, "collectionDate": options.collection_date, "checkedAt": max(dates, key=datetime.fromisoformat) if dates else None, "sourceYear": int(options.collection_date[:4]), "status": "incomplete", "scope": "Eight existing Moscow-area gaps with reviewed HE tables and main-city structures", "note": "Implemented higher-education listings only: sourceYear=null and pending_review. No intake, exams, places, prices, scores, license status, accreditation or accommodation guarantee is inferred. Source acquisition times remain unchanged during offline replay.", "profiles": profiles, "sourceManifest": manifest, "reviewedSourceSections": reviewed, "collectionIssues": issues, "summary": summary}
    dump(options.output or ROOT / ("data-sources/russia/moscow-enrichment-" + options.collection_date + ".json"), data)
    report = {k: v for k, v in data.items() if k != "profiles"}
    report["supplementaryScopeEvidence"] = supplementary_scope_evidence(cache)
    report["supplementaryScopeSummary"] = {"usableHttp200Receipts": len(report["supplementaryScopeEvidence"]), "newCatalogFacts": 0,
                                            "note": "Report-only receipts, excluded from the frozen candidate's sourceManifest and 22-request summary. Original source acquisition dates are preserved."}
    dump(options.report or ROOT / ("data-sources/russia/moscow-collection-report-" + options.collection_date + ".json"), report)
    print("COMPLETE", summary, flush=True)


if __name__ == "__main__":
    main()

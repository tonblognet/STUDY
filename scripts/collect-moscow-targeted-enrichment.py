"""Focused Moscow batches: fetch exact official pages, then publish reviewed rows.

The existing collector's conservative parsers are reused without rewriting its
dated output. The explicit reviewed selector plan is kept here; raw HTTP bodies,
attempts, and candidate rows stay under ignored tmp/russia-research.
"""
import argparse
import concurrent.futures
import hashlib
import json
import re
import runpy
import unicodedata
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse, urljoin


ROOT = Path(__file__).resolve().parents[1]
LEGACY = runpy.run_path(str(ROOT / "scripts/collect-moscow-enrichment.py"))
CLEAN = LEGACY["clean"]
EDUCATION_SOURCES = {
    "mgpu": "https://www.mgpu.ru/sveden/education/",
    "sechenov": "https://www.sechenov.ru/sveden/education/program_languages/",
    "fa": "https://www.fa.ru/sveden/education/eduop/",
    "mospolytech": "https://mospolytech.ru/sveden/education/eduaccred",
    "misis": "https://misis.ru/sveden/education/eduaccred",
    "kosygin": "https://rguk.ru/sveden/education/eduaccred",
    "mgsu": "https://euis.mgsu.ru/sveden/education/eduaccred",
    "timacad": "https://www.timacad.ru/sveden/education/eduaccred",
    "inpsycho": "https://inpsycho.ru/sveden/education/eduaccred",
    "msal": "https://msal.ru/sveden/education/",
    "guppros": "https://eduprosvet.ru/sveden/education/eduaccred",
    "hse": "https://www.hse.ru/sveden/education/58898a2d-b686-41e5-afc2-4fc1b9d20bde/",
    "mgavm": "https://mgavm.ru/sveden/education/eduaccred",
    "rgust": "https://rgust.ru/sveden/education/eduaccred",
    "sportedu": "https://gtsolifk.ru/sveden/education/eduaccred",
    "pstgu": "https://pstgu.ru/sveden/education/eduaccred",
    "universal": "https://u.university/sveden/education/eduaccred",
    "masi": "https://masi.ru/sveden/education/eduaccred",
    "mpsu": "https://www.mpsu.ru/sveden/education/eduaccred",
}
CONTACT_SOURCES = {
    "mgpu": ("https://priem.mgpu.ru/", {"admissionsPhone": "+7 (495) 045-04-50", "admissionsEmail": "priem@mgpu.ru"}),
    "sechenov": ("https://www.sechenov.ru/admissions/", {"admissionsEmail": "pk@staff.sechenov.ru"}),
    "fa": ("https://www.fa.ru/for-applicants/", {"admissionsPhone": "+7 (495) 157-07-90; +7 (495) 157-07-97", "admissionsEmail": "priemka@fa.ru"}),
    "misis": ("https://misis.ru/applicants/contacts/", {"admissionsPhone": "+7 499 649-44-80", "admissionsEmail": "vopros@misis.ru"}),
    "msal": ("https://msal.ru/sveden/education/", {"admissionsEmail": "priem@msal.ru"}),
    "guppros": ("https://eduprosvet.ru/abiturientam/", {"admissionsEmail": "priemka@eduprosvet.ru"}),
    "hse": ("https://ba.hse.ru/", {"admissionsUrl": "https://ba.hse.ru/"}),
    "mgavm": ("https://mgavm.ru/abiturientam/", {"admissionsPhone": "8 (495) 414-11-25", "admissionsEmail": "priem_kom@mgavm.ru"}),
    "rgust": ("https://rgust.ru/postuplenie/", {"admissionsPhone": "+7(499)748-32-20", "admissionsEmail": "priem@rgust.ru"}),
    "pstgu": ("https://pstgu.ru/abitur/contact", {"admissionsPhone": "+7 (495) 114-50-85", "admissionsEmail": "priemkom@pstgu.ru"}),
    "universal": ("https://u.university/abitur/priem/", {"admissionsPhone": "8 (800) 777-85-35; 8 (495) 640-30-92", "admissionsEmail": "admission@u.university"}),
    "vgik": ("https://vgik.info/abiturient/higher/abiturientam.php", {"admissionsEmail": "pk@vgik.ru"}),
}
TARGETS = {slug: [url] for slug, url in EDUCATION_SOURCES.items()}
TARGETS["vgik"] = ["https://vgik.info/sveden/struct/faculties-institutes.php"]
for slug, (url, _) in CONTACT_SOURCES.items():
    if url not in TARGETS[slug]:
        TARGETS[slug].append(url)

# After candidate inspection, only these named structural rows are released.
# Exact names (including spelling) are still taken from the fetched source.
REVIEWED_UNITS = {"vgik": ["Режиссерский факультет", "Актерский факультет", "Операторский факультет", "Сценарно-киноведческий факультет", "Продюсерский факультет", "Факультет анимации и мультимедиа", "Художественный факультет"]}

# Zero-based tables manually checked against this batch's original HTML. These
# are implemented-program tables, never admissions/student/employment counts.
# Content-level checks below still reject secondary, additional and postgraduate
# rows within mixed tables. HSE has ten tables: only Moscow higher education.
REVIEWED_EDUCATION_TABLES = {
    "mgpu": (2,), "sechenov": (0,), "fa": (2, 3, 4),
    "mospolytech": (0,), "misis": (0, 1, 2, 3, 4),
    "kosygin": (2, 3, 4), "mgsu": (0, 1, 2),
    "timacad": (1, 2, 3), "inpsycho": (0, 1, 2), "msal": (2,),
    "guppros": (1, 2, 3), "hse": (0,), "mgavm": (2, 3, 4),
    "rgust": (1, 2), "sportedu": (1, 2), "pstgu": (1, 2, 3),
    "universal": (0,), "masi": (1, 2, 3), "mpsu": (0, 1, 2),
}


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def identity(row):
    return "|".join([row["code"], normalized(row["title"]), normalized(profile_name(row.get("profile"))), level_key(row), form_identity(row.get("forms"))])


def normalized(value):
    value = unicodedata.normalize("NFKC", CLEAN(str(value or ""))).casefold().replace("ё", "е")
    return CLEAN(re.sub(r'[«»"“”„]+', "", value).replace("—", "-").replace("–", "-"))


def profile_name(value):
    """Strip cohort annotations, keeping the actual sourced program name."""
    value = CLEAN(value or "")
    value = re.split(r"[.]?\s*Для студентов\b", value, maxsplit=1, flags=re.I)[0]
    value = re.sub(r"\s*\(\s*20\d{2}(?:\s*[,;/–-]\s*20\d{2})*\s*\)\s*$", "", value)
    renamed = re.fullmatch(r"до\s+01\s+сентября\s+2021\s*[–—-]\s*Юриспруденция\s+с\s+01\s+сентября\s+2021\s*[–—-]\s*(Право)", value, flags=re.I)
    if renamed:
        value = renamed.group(1)
    return value.rstrip(". ") or None


def level_key(row):
    level = normalized(row.get("level"))
    if "специализированное высшее" in level:
        return "specialized_higher"
    if "базовое высшее" in level:
        return "basic_higher"
    return row["code"].split(".")[1]


def form_set(value):
    text = normalized(value)
    found = re.findall(r"очно[ -]?заочн\w*|заочн\w*|очн\w*", text)
    return {"очно-заочная" if re.match(r"очно[ -]?заоч", f) else "заочная" if f.startswith("заоч") else "очная" for f in found} or {text}


def form_qualifier(value):
    """Keep eligibility/acceleration/weekend and distance-learning qualifiers."""
    text = re.sub(r"форм[аы] обучения", "", normalized(value))
    text = re.sub(r"очно[ -]?заочн\w*|заочн\w*|очн\w*", "", text)
    return CLEAN(re.sub(r"[\s,;/()]+", " ", text)).strip(" .:-")


def form_identity(value):
    forms = ",".join(sorted(form_set(value)))
    qualifier = form_qualifier(value)
    return forms + (" [" + qualifier + "]" if qualifier else "")


def msal_pairs(tree):
    """MSAL publishes one logical overview record as two consecutive rows."""
    result = deepcopy(tree)
    for table in result.xpath('//table[.//*[@itemprop="eduCode"]]'):
        rows = table.xpath('./tbody/tr|./tr')
        header = CLEAN(" ".join(" ".join(row.itertext()) for row in rows[:2])).lower()
        if not all(word in header for word in ["код", "уровень образования", "форма обучения", "срок обучения"]):
            continue
        for index, row in enumerate(rows[:-1]):
            if row.xpath('.//*[@itemprop="eduCode"]') and not row.xpath('.//*[@itemprop="eduName"]'):
                next_row = rows[index + 1]
                if not next_row.xpath('.//*[@itemprop="eduName"]') or next_row.xpath('.//*[@itemprop="eduCode"]'):
                    continue
                row.set("itemprop", "eduAccred")
                for child in list(next_row):
                    row.append(deepcopy(child))
    return result


def main_campus(tree, slug):
    if slug != "hse":
        return tree
    result = deepcopy(tree)
    tables = result.xpath('//table')
    if not tables:
        return None
    # The source labels the first block Москва / Высшее образование. Other
    # tables are regional campuses, lyceums, or additional education.
    previous = list(tables[0].getparent().itersiblings(preceding=True))[:4]
    labels = [CLEAN(" ".join(node.itertext())) for node in previous]
    if "Москва" not in labels or "Высшее образование" not in labels:
        return None
    for table in tables[1:]:
        table.getparent().remove(table)
    return result


def education_rows(tree, meta, university):
    scoped = main_campus(tree, university["slug"])
    if scoped is None:
        return []
    if university["slug"] == "msal":
        scoped = msal_pairs(scoped)
    tables = scoped.xpath('//table')
    reviewed = REVIEWED_EDUCATION_TABLES.get(university["slug"], ())
    if not reviewed or any(index >= len(tables) for index in reviewed):
        return []
    elements = [row for index in reviewed for row in tables[index].xpath('.//tr')]
    # Keep repeated source rows until duration consensus is checked. The older
    # parser intentionally deduplicates early and cannot detect that conflict.
    result = []
    relevant = {"eduCode", "eduName", "eduProf", "eduLevel", "eduForm", "eduNorm", "eduSrok", "learningTerm"}
    for element in elements:
        fields = {}
        nodes = element.xpath('.//*[@itemprop]')
        keys = {node.get("itemprop") for node in nodes}
        for node in nodes:
            key = node.get("itemprop")
            if key not in relevant or key in fields:
                continue
            isolated = deepcopy(node)
            for nested in isolated.xpath('.//*[@itemprop]'):
                if nested.get("itemprop") != key:
                    nested.drop_tree()
            value = CLEAN(" ".join(isolated.itertext()))
            if value:
                fields[key] = value
        code, title, level, forms = [fields.get(key, "") for key in ["eduCode", "eduName", "eduLevel", "eduForm"]]
        if not re.fullmatch(r"\d{2}\.(?:03|04|05)\.\d{2}", code):
            continue
        if not title or len(title) > 450 or "�" in title or not level or not forms:
            continue
        if re.search(r"филиал|тараз|республика казахстан", title + " " + fields.get("eduProf", ""), re.I):
            continue
        table = next(element.iterancestors("table"), None)
        context = element.get("itemprop", "") + " " + (table.get("itemprop", "") if table is not None else "")
        if re.search(r"edu(?:Priem|Perevod|Stud|Trud|Graduate|Fin|Chislen|Vypusk|Employment)|graduate|employment|eduNir", context, re.I):
            continue
        if any(re.search(r"edu(?:Priem|Perevod|Stud|Trud)|graduate|employment|number|resultNir|baseNir", key, re.I) for key in keys):
            continue
        header = CLEAN(" ".join(table.xpath('.//th//text()'))) if table is not None else ""
        if re.search(r"численност|число (?:студент|обучающ|выпускн)|трудоустройств|результат[ыа] при[её]ма", header, re.I):
            continue
        overview = bool(re.search(r"eduAccred\b", context, re.I) or keys.intersection({"eduPred", "eduPrac"}))
        if not overview and not re.search(r"eduOp\b", context, re.I) and not keys.intersection({"eduPlan", "educationPlan"}):
            continue
        if re.search(r"дополнительн|среднее профессиональн|аспирант|ординат|ассистент", level, re.I):
            continue
        if not re.search(r"бакалавр|магистр|специалитет|высшее", level, re.I) or not re.search(r"очн|заочн", forms, re.I):
            continue
        terms = element.xpath('.//*[@itemprop="learningTerm"]')
        duration = fields.get("eduNorm") or fields.get("eduSrok") or (fields.get("learningTerm") if len(terms) == 1 else None)
        result.append({"code": code, "title": title, "profile": profile_name(fields.get("eduProf")), "level": level,
                       "forms": forms, "duration": duration, "admissionsStatus": "pending_review",
                       **LEGACY["provenance"](meta), "sourceYear": None, "_priority": 0 if overview else 1})
    best = {}
    for row in result:
        best[row["code"]] = min(best.get(row["code"], 1), row["_priority"])
    selected = []
    for row in result:
        if row.pop("_priority") == best[row["code"]]:
            selected.append(row)
    return selected


def collapse_rows(rows, slug):
    groups = {}
    for row in rows:
        groups.setdefault(identity(row), []).append(row)
    result, issues = [], []
    for key, variants in groups.items():
        row = dict(variants[0])
        durations = {CLEAN(v["duration"]) for v in variants if v.get("duration")}
        if len(durations) > 1:
            row["duration"] = None
            issues.append({"universitySlug": slug, "kind": "duration_conflict", "code": row["code"], "profile": row["profile"], "forms": row["forms"], "publishedDurations": sorted(durations), "sourceUrl": row["sourceUrl"], "note": "Published rows disagree; no single duration is established."})
        elif any(not variant.get("duration") for variant in variants):
            row["duration"] = None
        row["id"] = slug + "-official-" + hashlib.sha256(key.encode()).hexdigest()[:16]
        result.append(row)
    # A union of forms is not another educational position when all the
    # individual forms are already represented for the same program and level.
    by_program = {}
    for row in result:
        key = "|".join(identity(row).split("|")[:-1])
        by_program.setdefault(key, []).append(row)
    filtered = []
    for variants in by_program.values():
        for row in variants:
            forms = form_set(row["forms"])
            narrower = [other for other in variants if form_set(other["forms"]) < forms
                        and form_qualifier(other["forms"]) == form_qualifier(row["forms"])]
            covered = set().union(*(form_set(other["forms"]) for other in narrower)) if narrower else set()
            if len(forms) > 1 and covered == forms:
                continue
            filtered.append(row)
    return filtered, issues


def reviewed_fields(slug, url, tree, meta, existing):
    source = CONTACT_SOURCES.get(slug)
    if not source or url != source[0]:
        return {}
    text = CLEAN(" ".join(tree.xpath('//body//text()[not(ancestor::script) and not(ancestor::style)]')))
    result = {}
    for key, value in source[1].items():
        if key in existing["fields"]:
            continue
        values = value.split("; ")
        if key == "admissionsUrl" or all(CLEAN(part) in text for part in values):
            result[key] = {"value": value, **LEGACY["provenance"](meta)}
    return result


def prior_profiles(collection_date="2026-10-10"):
    profiles = {p["universitySlug"]: p for p in json.loads((ROOT / "data-sources/moscow/profiles.json").read_text(encoding="utf-8"))["profiles"]}
    for path in sorted((ROOT / "data-sources/russia").glob("moscow-enrichment-*.json")):
        if path.name >= "moscow-enrichment-" + collection_date + ".json":
            continue
        for addition in json.loads(path.read_text(encoding="utf-8"))["profiles"]:
            base = profiles[addition["universitySlug"]]
            base["fields"].update({k: v for k, v in addition.get("fields", {}).items() if k not in base["fields"]})
            base.setdefault("faculties", []).extend(addition.get("faculties", []))
            base["offerings"].extend(addition.get("offerings", []))
    return profiles


def load_page(url, folder, offline=False):
    digest = hashlib.sha256(url.encode()).hexdigest()[:14]
    path, meta_path = folder / (digest + ".html"), folder / (digest + ".meta.json")
    if offline:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if meta.get("httpStatus") != "200" or meta.get("exitCode") or meta.get("rejected") or not path.exists():
            return None, meta
        document = LEGACY["read_tree"](path.read_bytes())
    else:
        document, meta = LEGACY["fetch"](url, folder)
    if document is not None and hashlib.sha256(path.read_bytes()).hexdigest() != meta.get("sourceSha256"):
        meta = {**meta, "rejected": "cached_snapshot_sha256_mismatch"}
        return None, meta
    return document, meta


def candidate_page(slug, url, folder, university, existing, offline=False):
    document, meta = load_page(url, folder, offline)
    result = {"meta": meta, "fields": {}, "faculties": [], "offerings": [], "links": []}
    if document is None:
        return result
    expected = LEGACY["host"](university["website"])
    actual = LEGACY["host"](meta["url"])
    if actual != expected and not actual.endswith("." + expected):
        result["meta"]["rejected"] = "unexpected_organization_domain"
        return result
    if "/common" in urlparse(meta["url"]).path:
        result["fields"] = LEGACY["common_fields"](document, meta, existing["fields"])
    result["fields"].update(reviewed_fields(slug, url, document, meta, existing))
    if "/struct" in urlparse(meta["url"]).path or "/structure" in urlparse(meta["url"]).path:
        result["faculties"] = LEGACY["faculties"](document, meta, university)
    if url == EDUCATION_SOURCES.get(slug):
        result["offerings"] = education_rows(document, meta, university)
        result["meta"] = {**meta, "reviewedEducationTableIndexes": list(REVIEWED_EDUCATION_TABLES[slug])}
    result["links"] = [{"name": label, "url": target} for label, target in LEGACY["links"](document, meta["url"])
                       if re.search(r"факультет|институт|структур|школа|поступ|при[её]мн|абитуриент|sveden|образовани", label + " " + target, re.I)]
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collection-date", default=datetime.now(timezone(timedelta(hours=3))).date().isoformat())
    parser.add_argument("--output", type=Path)
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--target", action="append", choices=list(TARGETS))
    options = parser.parse_args()
    datetime.strptime(options.collection_date, "%Y-%m-%d")
    if options.offline and options.refresh:
        parser.error("--offline and --refresh cannot be combined")
    LEGACY["OPTIONS"].refresh = options.refresh
    cache = options.cache_dir or ROOT / ("tmp/russia-research/moscow-targeted-" + options.collection_date)
    cache.mkdir(parents=True, exist_ok=True)
    universities = {u["slug"]: u for u in LEGACY["UNIVERSITIES"]}
    existing = prior_profiles(options.collection_date)
    targets = options.target or list(TARGETS)

    def review(slug):
        folder = cache / slug
        folder.mkdir(parents=True, exist_ok=True)
        pages = []
        for url in TARGETS[slug]:
            digest = hashlib.sha256(url.encode()).hexdigest()[:14]
            if options.offline and not (folder / (digest + ".meta.json")).exists():
                continue
            pages.append(candidate_page(slug, url, folder, universities[slug], existing[slug], options.offline))
        dump(folder / "candidates.json", pages)
        print(slug, "HTTP200", sum(p["meta"].get("httpStatus") == "200" for p in pages),
              "units", sum(len(p["faculties"]) for p in pages), "listings", sum(len(p["offerings"]) for p in pages), flush=True)
        return slug, pages

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = dict(pool.map(review, targets))
    profiles, manifest, issues = [], [], []
    candidate_count = 0
    for slug in targets:
        pages = results[slug]
        fields, units, candidate_rows = {}, {}, []
        prior_units = {CLEAN(f["name"]).casefold() for f in existing[slug].get("faculties", [])}
        prior_programs = {identity(o) for o in existing[slug]["offerings"]}
        approved = {CLEAN(name).casefold() for name in REVIEWED_UNITS.get(slug, [])}
        for page in pages:
            meta = page["meta"]
            manifest.append({"universitySlug": slug, **meta})
            for key, value in page["fields"].items():
                fields.setdefault(key, value)
            for unit in page["faculties"]:
                key = CLEAN(unit["name"]).casefold()
                if key in approved and key not in prior_units:
                    units.setdefault(key, unit)
            candidate_rows.extend(page["offerings"])
        candidate_count += len(candidate_rows)
        collapsed, conflicts = collapse_rows(candidate_rows, slug)
        issues.extend(conflicts)
        programs = [row for row in collapsed if identity(row) not in prior_programs]
        for kind, resolved, prior in [("faculties", units, prior_units), ("educationalListings", programs, prior_programs)]:
            if not resolved and not prior:
                issues.append({"universitySlug": slug, "kind": kind + "_unresolved", "note": "Новое содержательное дополнение не подтверждено в доступных источниках; прежние значения сохранены."})
        profiles.append({"universitySlug": slug, "fields": fields, "faculties": list(units.values()), "offerings": programs})
    # Preserve discovery attempts (including inaccessible initial prospects),
    # without turning their failures or their stale snapshots into facts.
    manifest_by_request = {(m["universitySlug"], m["requestedUrl"]): m for m in manifest}
    for meta_path in sorted(cache.glob('*/*.meta.json')):
        slug = meta_path.parent.name
        if slug == "alternate":
            continue
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        manifest_by_request.setdefault((slug, meta["requestedUrl"]), {"universitySlug": slug, **meta})
    manifest = list(manifest_by_request.values())
    data = {"schemaVersion": 1, "collectionDate": options.collection_date, "checkedAt": LEGACY["now"](),
            "sourceYear": int(options.collection_date[:4]), "status": "incomplete",
            "scope": "Targeted official-source enrichment of " + str(len(targets)) + " existing Moscow directory entries",
            "note": "Partial academic structure, admission-office contacts and implemented bachelor/specialist/master/basic/specialized higher-education listings. Postgraduate/residency/assistantship, secondary, additional education and statistics are excluded from this batch. Lists do not establish admission conditions, intake year, places, fees, exams or licensing. Cohort annotations are removed from names, conflicting durations are null. Collection date uses Moscow time; per-fact UTC timestamps preserve the actual fetch time.",
            "profiles": profiles, "sourceManifest": manifest, "collectionIssues": issues,
            "summary": {"universitiesAttempted": len(targets), "universitiesWithFaculties": sum(bool(p["faculties"]) for p in profiles),
                        "researchUniversitiesAttempted": len({source["universitySlug"] for source in manifest}),
                        "faculties": sum(len(p["faculties"]) for p in profiles), "newFields": sum(len(p["fields"]) for p in profiles),
                        "universitiesWithNewOfferings": sum(bool(p["offerings"]) for p in profiles),
                        "newOfferings": sum(len(p["offerings"]) for p in profiles), "educationalCandidateRows": candidate_count,
                        "durationConflicts": len([issue for issue in issues if issue["kind"] == "duration_conflict"]),
                        "pagesRequested": len(manifest), "unsuccessfulSources": sum(m.get("httpStatus") != "200" or bool(m.get("exitCode")) or bool(m.get("rejected")) for m in manifest)}}
    dump(options.output or ROOT / ("data-sources/russia/moscow-enrichment-" + options.collection_date + ".json"), data)
    print("COMPLETE", data["summary"], flush=True)


if __name__ == "__main__":
    main()

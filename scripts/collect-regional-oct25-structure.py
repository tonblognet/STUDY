"""Reviewed October 25 regional common/structure delta, with safe offline replay.

Only existing cards and their missing general fields / higher-education units
are in scope. No education/admission tables are fetched or interpreted.
"""
import argparse
import concurrent.futures
import hashlib
import importlib.util
import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]
BATCH = "2026-10-25"
WORK = ROOT / "tmp/russia-research/regional-structure-enrichment-2026-10-25"
OUT = ROOT / "data-sources/russia/regional-structure-enrichment-2026-10-25.json"
REPORT = ROOT / "data-sources/russia/regional-structure-collection-report-2026-10-25.json"
TARGETS = {
    "russia-1601": "https://www.klgtu.ru/",
    "russia-83": "https://www.isu.ru/",
    "russia-12": "https://bgu.ru/",
    "russia-258": "https://www.sgu.ru/",
    "russia-11": "https://asu-edu.ru/",
    "russia-199": "https://www.petrsu.ru/",
    "russia-342": "https://www.uniyar.ac.ru/",
    "russia-341": "https://ystu.ru/",
}
# Filled only after inspecting literal source rows and their HE/campus context.
REVIEWED_UNITS = {
    "russia-1601": {
        "https://klgtu.ru/sveden/struct/": [
            "Институт рыболовства и аквакультуры",
            "Институт агроинженерии и пищевых систем",
            "Институт цифровых технологий",
            "Институт морских технологий, энергетики и строительства",
            "Институт отраслевой экономики и управления",
            "Морской институт",
            "Институт инженерной педагогики и гуманитарной подготовки"
        ]
    },
    "russia-83": {
        "https://www.isu.ru/sveden/struct/": [
            "Байкальская международная бизнес-школа (институт)",
            "Факультет бизнеса и менеджмента",
            "Институт Биологических наук",
            "Институт математики, экономики и информатики",
            "Институт социальных наук",
            "Социальный факультет",
            "Институт филологии, иностранных языков и медиакоммуникации",
            "Факультет иностранных языков",
            "Факультет теоретической и прикладной филологии",
            "Международный институт экономики и лингвистики",
            "Педагогический институт",
            "Юридический институт",
            "Географический факультет",
            "Геологический факультет",
            "Исторический факультет",
            "Факультет психологии",
            "Факультет бизнес-коммуникаций и информатики",
            "Физический факультет",
            "Химический факультет"
        ]
    },
    "russia-12": {
        "https://bgu.ru/sveden/struct/": [
            "Институт управления, экономики и финансов",
            "Институт юстиции",
            "Институт государственного права и национальной безопасности",
            "Институт мировой экономики и международных отношений",
            "Институт культуры, социальных коммуникаций и информационных технологий"
        ]
    },
    "russia-258": {
        "https://www.sgu.ru/sveden/struct/": [
            "Биологический факультет",
            "Географический факультет",
            "Геологический факультет",
            "Институт истории и международных отношений",
            "Институт физики",
            "Институт филологии и журналистики",
            "Институт химии",
            "Механико-математический факультет",
            "Педагогический институт",
            "Социологический факультет",
            "Факультет гуманитарных дисциплин, русского и иностранных языков",
            "Факультет искусств",
            "Факультет компьютерных наук и информационных технологий",
            "Факультет психологии",
            "Факультет психолого-педагогического и специального образования",
            "Факультет физико-математических и естественно-научных дисциплин",
            "Факультет фундаментальной медицины и медицинских технологий",
            "Философский факультет",
            "Экономический факультет",
            "Юридический факультет",
            "Факультет физической культуры и спорта"
        ]
    },
    "russia-11": {
        "https://asu-edu.ru/sveden/struct/": [
            "Агро-биологический факультет",
            "Факультет иностранных языков",
            "Факультет истории и социальных коммуникаций",
            "Факультет педагогики, психологии, гостеприимства и спорта",
            "Факультет физики, математики и инженерных технологий",
            "Факультет филологии и журналистики",
            "Факультет цифровых технологий и кибербезопасности",
            "Факультет экономики и управления",
            "Юридический факультет"
        ]
    },
    "russia-342": {
        "https://www.uniyar.ac.ru/sveden/struct/": [
            "Математический факультет",
            "Факультет информатики и вычислительной техники",
            "Физико-технический факультет",
            "Факультет социально-политических наук",
            "Юридический факультет",
            "Экономический факультет",
            "Исторический факультет",
            "Факультет психологии",
            "Факультет биологии и экологии",
            "Факультет филологии, иностранных языков и международной коммуникации"
        ]
    },
    "russia-341": {
        "https://ystu.ru/sveden/struct/": [
            "Институт архитектуры и дизайна",
            "Институт инженерии и машиностроения",
            "Институт инженеров строительства и транспорта",
            "Институт химии и химической технологии",
            "Институт цифровых систем",
            "Институт экономики и менеджмента",
            "Институт базовой инженерной подготовки"
        ]
    }
}
EXCLUSIONS = {
    "russia-12": {
        "names": [
            "Международный факультет"
        ],
        "reason": "Отдельно не подтверждён профиль основного высшего образования: научные, подготовительные, дополнительные или послевузовские функции не превращаются в факультет бакалавриата/специалитета."
    },
    "russia-258": {
        "names": [
            "Институт археологии и культурного наследия",
            "Институт рисков"
        ],
        "reason": "Отдельно не подтверждён профиль основного высшего образования: научные, подготовительные, дополнительные или послевузовские функции не превращаются в факультет бакалавриата/специалитета.",
        "additionalUnresolved": "Образовательно-научный институт наноструктур и биосистем"
    },
    "russia-11": {
        "names": [
            "Каспийская высшая школа перевода"
        ],
        "reason": "Отдельно не подтверждён профиль основного высшего образования: научные, подготовительные, дополнительные или послевузовские функции не превращаются в факультет бакалавриата/специалитета.",
        "otherCityExcluded": "Филиал ФГБОУ ВО «Астраханский государственный университет имени В.Н. Татищева» в г. Знаменске Астраханской области"
    },
    "russia-342": {
        "names": [
            "Институт информационной безопасности",
            "Институт радиотехнических систем",
            "Институт цифрового педагогического дизайна",
            "Объединенный институт математики и компьютерных наук им. А.Н. Колмогорова"
        ],
        "reason": "Отдельно не подтверждён профиль основного высшего образования: научные, подготовительные, дополнительные или послевузовские функции не превращаются в факультет бакалавриата/специалитета."
    },
    "russia-341": {
        "names": [
            "Институт аспирантуры и докторантуры"
        ],
        "reason": "Отдельно не подтверждён профиль основного высшего образования: научные, подготовительные, дополнительные или послевузовские функции не превращаются в факультет бакалавриата/специалитета."
    },
    "global": {
        "reason": "Отделы, управления, комиссии, кафедры, научные центры, ДПО, СПО, подготовка и филиалы других городов исключены редакционным списком; отсутствие включения не означает отсутствие высшего образования."
    }
}


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


regional = module("regional_oct25_base", "collect-regional-enrichment.py")
regional.YEAR = 2026
safe = module("regional_oct25_safe", "collect-contacts-enrichment.py")
safe.BATCH = BATCH
safe.OFFICIAL_HOSTS = {slug: {urlparse(url).hostname.removeprefix("www.")} for slug, url in TARGETS.items()}


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def freeze_baseline(work):
    path = work / "baseline.json"
    if path.exists():
        baseline = json.loads(path.read_text(encoding="utf-8"))
    elif REPORT.exists():
        baseline = json.loads(REPORT.read_text(encoding="utf-8"))["baseline"]
        dump(path, baseline)
    else:
        raw = (ROOT / "data-sources/russia/coverage.json").read_bytes()
        matrix = json.loads(raw)
        rows = {row["slug"]: row for row in matrix["universities"] if row["slug"] in TARGETS}
        baseline = {"coverageGeneratedAt": matrix["generatedAt"], "coverageSha256": hashlib.sha256(raw).hexdigest(), "gapBaseline": {slug: row["missing"] for slug, row in rows.items()}, "counts": {slug: {key: row[key] for key in ("sourcedFields", "faculties", "educationalListings")} for slug, row in rows.items()}}
        dump(path, baseline)
    if set(baseline["gapBaseline"]) != set(TARGETS):
        raise ValueError("Frozen baseline does not cover the exact eight selected existing cards")
    return baseline


def collect_one(work, slug):
    base = TARGETS[slug]
    urls = [base, urljoin(base, "sveden/common/"), urljoin(base, "sveden/struct/")]
    if slug in {"russia-1601", "russia-199"}:
        bare = regional.bare_host_url(base)
        urls += [bare, urljoin(bare, "sveden/common/"), urljoin(bare, "sveden/struct/")]
        if slug == "russia-199":
            urls += [urljoin(bare, "sveden/common"), urljoin(bare, "sveden/struct")]
    receipts = []
    seen = set()
    for url in urls:
        if url in seen:
            continue
        seen.add(url)
        receipt = safe.fetch(work, slug, url)
        receipts.append(receipt)
        if str(receipt.get("httpStatus")) != "200" or receipt.get("error"):
            continue
        try:
            _, document = safe.load_evidence(work, slug, url)
        except (ValueError, OSError) as error:
            receipt["rejected"] = str(error)
            continue
        # Use explicitly linked disclosure pages, retaining any failed guessed URL.
        if url == base:
            for _, link in regional.links(document, receipt["url"]):
                if re.search(r"/sveden/(?:common|struct)(?:/|$|\.)", urlparse(link).path):
                    try:
                        safe.validate_source_url(slug, link)
                    except ValueError:
                        continue
                    if link not in urls:
                        urls.append(link)
    dump(work / slug / "manifest.json", receipts)
    return receipts


def source_documents(work, slug):
    manifest = json.loads((work / slug / "manifest.json").read_text(encoding="utf-8"))
    for receipt in manifest:
        if str(receipt.get("httpStatus")) != "200" or receipt.get("error") or receipt.get("rejected"):
            continue
        meta, document = safe.load_evidence(work, slug, receipt["requestedUrl"])
        yield meta, document


def reviewed_units(document, meta, university):
    candidates = regional.structural_rows(document, meta, university)
    approved = REVIEWED_UNITS.get(university["slug"], {})
    names = approved.get(meta["requestedUrl"], [])
    by_name = {row["name"]: row for row in candidates}
    result = []
    evidence = []
    for name in names:
        if name not in by_name:
            raise ValueError("Reviewed exact structural row disappeared: " + name)
        elements = [node for node in document.xpath('//*[@itemprop="name" or @itemprop="divisionName" or @itemprop="structName"]') if regional.clean(node.text_content()) == name]
        element = elements[0]
        containers = element.xpath('ancestor::*[contains(@itemprop,"structOrgUprav")][1]') or element.xpath('ancestor::tr[1]')
        container = containers[0]
        addresses = container.xpath('.//*[@itemprop="addressStr" or @itemprop="addressStruct" or @itemprop="address"]')
        address = regional.clean(addresses[0].text_content()) if addresses else ""
        city = university["city"]
        if city.casefold() not in address.casefold():
            # The six cityless ASU rows give the main building address from
            # this batch's common page, rather than the separate Znamensk branch.
            if university["slug"] != "russia-11" or not re.search(r"Татищева\s*[,д.\s]*20а", address, re.I):
                raise ValueError("Reviewed unit main-city address is not confirmed: " + name)
        unit = dict(by_name[name])
        if unit["url"] and "/phonebook" in unit["url"]:
            # The disclosure publishes a shared phone book in its site column;
            # it does not identify this faculty's own website.
            unit["url"] = None
        result.append(unit)
        evidence.append({"name": name, "xpath": document.getroottree().getpath(element), "address": address, "mainCity": city, "precedingHeadings": [regional.clean(node.text_content()) for node in container.xpath('preceding::h2[1]|preceding::h3[1]')], "literalRowText": regional.clean(" ".join(container.xpath('.//text()[not(ancestor::script) and not(ancestor::style)]'))), "campusReview": "Адрес основного города; для строк АГУ без города улица Татищева, 20а совпадает с подтверждённым адресом головного вуза. Вложенные факультеты считаются отдельными подразделениями."})
    return result, candidates, evidence


def common_fields(document, meta):
    """A disclosure may put itemprop on the whole row, including its label."""
    scoped = deepcopy(document)
    for row in scoped.xpath('//tr[@itemprop]'):
        prop = row.get("itemprop")
        cells = row.xpath('./td|./th')
        if prop in {"fullName", "shortName", "regDate", "address", "telephone", "email"} and len(cells) == 2:
            row.attrib.pop("itemprop")
            cells[1].set("itemprop", prop)
            if prop == "telephone":
                phones = cells[1].xpath('.//a[starts-with(@href,"tel:")]')
                if phones:
                    text = regional.clean(phones[0].text_content())
                    cells[1].clear()
                    cells[1].set("itemprop", prop)
                    cells[1].text = text
            if prop == "regDate":
                text = regional.clean(" ".join(cells[1].xpath('.//text()[not(ancestor::a)]')))
                cells[1].clear()
                cells[1].set("itemprop", prop)
                cells[1].text = text
    return regional.common_fields(scoped, meta)


def build(work, output, report_path):
    baseline = freeze_baseline(work)
    roster = json.loads((ROOT / "data-sources/russia/universities.json").read_text(encoding="utf-8"))["universities"]
    universities = {row["slug"]: row for row in roster if row["slug"] in TARGETS}
    profiles, sources, issues, review, field_review = [], [], [], [], []
    for slug in TARGETS:
        profile = {"universitySlug": slug, "fields": {}, "faculties": [], "offerings": []}
        missing = baseline["gapBaseline"][slug]
        manifest = json.loads((work / slug / "manifest.json").read_text(encoding="utf-8"))
        sources.extend(manifest)
        seen_names = set()
        for receipt in manifest:
            if str(receipt.get("httpStatus")) != "200" or receipt.get("error") or receipt.get("rejected"):
                issues.append({"universitySlug": slug, "kind": "source_unavailable", "requestedUrl": receipt["requestedUrl"], "note": receipt.get("error", receipt.get("rejected", "HTTP " + str(receipt.get("httpStatus"))))})
        for meta, document in source_documents(work, slug):
            if re.search(r"/sveden/common(?:/|$|\.)", urlparse(meta["url"]).path):
                for key, fact in common_fields(document, meta).items():
                    if key in missing and key not in profile["fields"]:
                        nodes = document.xpath('//*[@itemprop="' + key + '"]')
                        proofs = [(node, regional.clean(" ".join(node.xpath('.//text()[not(ancestor::script) and not(ancestor::style)]')))) for node in nodes]
                        proof = next(((node, fragment) for node, fragment in proofs if fact["value"] in fragment), None)
                        if proof is None:
                            raise ValueError("General field is not an exact fragment of its official disclosure field: " + slug + ":" + key)
                        profile["fields"][key] = fact
                        field_review.append({"universitySlug": slug, "field": key, "value": fact["value"], "sourceUrl": meta["url"], "sourceSha256": meta["sourceSha256"], "checkedAt": meta["checkedAt"], "xpath": document.getroottree().getpath(proof[0]), "literalFieldText": proof[1]})
            units, candidates, evidence = reviewed_units(document, meta, universities[slug])
            if "faculties" in missing:
                for unit in units:
                    if unit["name"].casefold() not in seen_names:
                        profile["faculties"].append(unit)
                        seen_names.add(unit["name"].casefold())
            if candidates:
                review.append({"universitySlug": slug, "requestedUrl": meta["requestedUrl"], "sourceUrl": meta["url"], "sourceSha256": meta["sourceSha256"], "checkedAt": meta["checkedAt"], "candidates": candidates, "selectedNames": [row["name"] for row in units], "selectedEvidence": evidence})
        for key in ("faculties", "fields"):
            if not profile[key]:
                issues.append({"universitySlug": slug, "kind": key + "_unresolved", "note": "В этой партии подтверждённые недостающие сведения не получены; отсутствие результата не означает отсутствия подразделений или сведений."})
        profiles.append(profile)
    # Stable ordering makes the offline evidence replay byte-for-byte comparable.
    profiles.sort(key=lambda row: row["universitySlug"])
    sources.sort(key=lambda row: (row["universitySlug"], row["requestedUrl"]))
    issues.sort(key=lambda row: (row["universitySlug"], row["kind"], row.get("requestedUrl", "")))
    checked_at = max(row["checkedAt"] for row in sources)
    stats = {"universitiesAttempted": len(TARGETS), "universitiesWithCurrentFields": sum(bool(row["fields"]) for row in profiles), "universitiesWithFaculties": sum(bool(row["faculties"]) for row in profiles), "fields": sum(len(row["fields"]) for row in profiles), "faculties": sum(len(row["faculties"]) for row in profiles), "implementedOfferings": 0, "pagesRequested": len(sources)}
    payload = {"checkedAt": checked_at, "sourceYear": 2026, "scope": "Недостающие общие сведения и точные учебные подразделения восьми существующих региональных карточек. Включены только проверенные подразделения высшего образования основного города; институты и вложенные факультеты учитываются как подразделения. Филиалы других городов, управление, научные, подготовительные, СПО и ДПО единицы исключены. Перечни могут быть неполными. Образовательные и конкурсные программы, ЕГЭ, места, цены, баллы и лицензии в этой партии не добавляются.", "profiles": profiles, "sources": sources, "issues": issues, "alreadyCoveredExcluded": [], "stats": stats, "gapBaseline": baseline["gapBaseline"]}
    dump(output, payload)
    report = {"batchDate": BATCH, "baseline": baseline, "stats": stats, "reviewedFields": field_review, "reviewedStructure": review, "scopeExclusions": EXCLUSIONS, "issues": issues, "reproduction": {"collect": "python scripts/collect-regional-oct25-structure.py --collect", "offline": "python scripts/collect-regional-oct25-structure.py", "replay": "python scripts/collect-regional-oct25-structure.py --output tmp/russia-research/regional-structure-enrichment-2026-10-25/replay.json --report tmp/russia-research/regional-structure-enrichment-2026-10-25/replay-report.json"}}
    dump(report_path, report)
    print(json.dumps(stats, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collect", action="store_true", help="Fetch official sources once; otherwise parse frozen evidence without network")
    parser.add_argument("--work", type=Path, default=WORK)
    parser.add_argument("--output", type=Path, default=OUT)
    parser.add_argument("--report", type=Path, default=REPORT)
    args = parser.parse_args()
    freeze_baseline(args.work)
    if args.collect:
        if datetime.now(timezone.utc).date().isoformat() != BATCH:
            raise ValueError("New HTTP evidence requires the actual frozen batch UTC date")
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda slug: collect_one(args.work, slug), TARGETS))
    build(args.work, args.output, args.report)


if __name__ == "__main__":
    main()

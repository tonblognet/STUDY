"""Replay reviewed regional common/academic-unit gaps from guarded HTTP evidence.

The curated lists are partial main-city lists, not admissions authorization.
No degree offerings, fees, exam combinations, places or licensing are inferred.
"""
import argparse
import concurrent.futures
import hashlib
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
import re
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]
BATCH = "2026-11-09"
WORK = ROOT / "tmp/russia-research/continuation-structure-2026-11-09"
OUT = ROOT / "data-sources/russia/continuation-structure-2026-11-09.json"
REPORT = ROOT / "data-sources/russia/continuation-structure-collection-report-2026-11-09.json"
TARGETS = {
    "russia-305": {"base": "https://ulstu.ru", "city": "Ульяновск", "struct": "/sveden/struct/"},
    "russia-306": {"base": "https://ulsu.ru", "city": "Ульяновск", "struct": "/ru/sveden/struct/"},
    "russia-36": {"base": "https://volsu.ru", "city": "Волгоград", "struct": "/sveden/struct/"},
    "russia-117": {"base": "https://www.stu.lipetsk.ru", "city": "Липецк", "struct": "/sveden/struct/"},
}
REVIEWED_UNITS = {
    "russia-305": [
        "Машиностроительный факультет", "Самолетостроительный факультет ИАТУ",
        "Факультет информационных систем и технологий", "Радиотехнический факультет",
        "Энергетический факультет", "Строительный факультет", "Гуманитарный факультет",
        "Заочно-вечерний факультет", "Инженерно-экономический факультет",
    ],
    "russia-306": [
        "Институт экономики и бизнеса", "Институт медицины, экологии и физической культуры",
        "Факультет лингвистики, межкультурных связей и профессиональной коммуникации",
        "Факультет математики, информационных и авиационных технологий",
        "Инженерно-физический факультет высоких технологий", "Юридический факультет",
        "Факультет гуманитарных наук и социальных технологий", "Факультет культуры и искусства",
        "Заволжский экономико-гуманитарный факультет",
    ],
    "russia-36": [
        "Институт естественных наук", "Институт истории, международных отношений и социальных технологий",
        "Институт математики и информационных технологий", "Институт права",
        "Физико-технический институт", "Институт филологии и межкультурной коммуникации",
        "Институт экономики и управления",
    ],
    "russia-117": [
        "Институт машиностроения и транспорта", "Металлургический институт",
        "Институт социальных наук экономики и права", "Институт строительства и архитектуры",
        "Физико-энергетический институт", "Институт компьютерных наук",
    ],
}
EXCLUSIONS = [
    {"universitySlug": "russia-306", "names": ["Передовая инженерная школа «ФармИнжиниринг»", "Факультет трансферных специальностей"], "reason": "Основной профиль высшего образования отдельно не проверен; короткие курсы, трансфер и дополнительное образование не выводятся из структурного перечня."},
    {"universitySlug": "russia-36", "names": ["Институт международного образования"], "reason": "Нужна отдельная сверка участия в основном высшем образовании; подготовительные функции не трактуются как образовательные программы."},
    {"scope": "global", "reason": "Частичные списки факультетов/институтов основного города. Управления, научные, подготовительные, СПО, ДПО и филиалы других городов не включены. У УлГУ отдельные вложенные факультеты с другой страницы не объединяются без дополнительной проверки."},
]
FIELDS = ("fullName", "shortName", "regDate", "address", "telephone", "email")


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


safe = module("continuation_structure_safe", "collect-contacts-enrichment.py")
safe.BATCH = BATCH
safe.OFFICIAL_HOSTS = {slug: {urlparse(row["base"]).hostname.removeprefix("www.")} for slug, row in TARGETS.items()}
clean = safe.clean


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def provenance(meta):
    return {"sourceUrl": meta["url"], "sourceYear": 2026, "checkedAt": meta["checkedAt"], "sourceSha256": meta["sourceSha256"]}


def freeze_baseline(work):
    path = work / "baseline.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    if REPORT.exists():
        baseline = json.loads(REPORT.read_text(encoding="utf-8"))["baseline"]
    else:
        source = ROOT / "tmp/russia-before-nov09-continuation.json"
        raw = source.read_bytes()
        snapshot = json.loads(raw)
        rows = {row["universitySlug"]: row for row in snapshot["directoryDetails"] if row["universitySlug"] in TARGETS}
        if set(rows) != set(TARGETS):
            raise ValueError("Runtime baseline lacks target cards")
        baseline = {"runtimeSnapshotSha256": hashlib.sha256(raw).hexdigest(), "fields": {slug: row["fields"] for slug, row in rows.items()}, "facultyNames": {slug: [unit["name"] for unit in row.get("faculties", [])] for slug, row in rows.items()}}
    dump(path, baseline)
    return baseline


def source(work, slug, url):
    meta, tree = safe.load_evidence(work, slug, url)
    title = clean(" ".join(tree.xpath("//title/text()")))
    visible = clean(" ".join(tree.xpath('//body//text()[not(ancestor::script) and not(ancestor::style)]')))
    if re.search(r"(?:ошибка\s*)?404|not found", title, re.I) or len(visible) < 500:
        raise ValueError("Source is a soft error or insufficient page")
    return meta, tree


def common_fields(tree, meta):
    fields, evidence = {}, []
    for key in FIELDS:
        nodes = tree.xpath('//*[@itemprop="' + key + '"]')
        values = [(node, clean(node.text_content())) for node in nodes]
        values = [(node, value) for node, value in values if value and "�" not in value]
        if not values:
            raise ValueError("Missing exact common field " + key)
        # Curated pages publish the organization field before footer repetitions.
        node, value = values[0]
        if key == "email" and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Email field requires its literal single address")
        if len(value) > 800:
            raise ValueError("Field value includes an unrelated container")
        fields[key] = {"value": value, **provenance(meta)}
        evidence.append({"field": key, "value": value, "xpath": tree.getroottree().getpath(node), "literalFieldText": value, **provenance(meta)})
    return fields, evidence


def verify_campus(slug, address, common_address):
    city = TARGETS[slug]["city"]
    if city.casefold() in address.casefold():
        return "Буквальный адрес строки содержит основной город " + city
    if slug == "russia-117" and re.match(r"ул\.\s*Московская,\s*30,\s*к\d+-\d+$", address) and "г. Липецк, ул. Московская, д. 30" in common_address:
        return "Улица Московская, 30 совпадает с основным адресом ЛГТУ в Липецке; корпус/аудитория сохранены в строке"
    raise ValueError("Reviewed unit does not establish main-city campus")


def academic_units(slug, tree, meta, common_address):
    result, evidence = [], []
    for name in REVIEWED_UNITS[slug]:
        nodes = [n for n in tree.xpath('//*[@itemprop="name" or @itemprop="divisionName" or @itemprop="structName"]') if clean(n.text_content()) == name]
        if len(nodes) != 1:
            raise ValueError("Reviewed exact unit changed or duplicated: " + name)
        node = nodes[0]
        # Some pages put structOrgUprav on the whole TABLE. Select the actual
        # nearest row so one institute cannot inherit the rector's/another unit's URL.
        rows = node.xpath('ancestor::tr[1]')
        if len(rows) != 1:
            raise ValueError("Reviewed unit lacks its own disclosure row")
        row = rows[0]
        addresses = row.xpath('.//*[@itemprop="addressStr" or @itemprop="addressStruct" or @itemprop="address"]')
        if addresses:
            address = clean(addresses[0].text_content())
        else:
            cells = row.xpath('./td')
            if len(cells) < 4:
                raise ValueError("Missing unit address column")
            address = clean(cells[3].text_content())
        campus_review = verify_campus(slug, address, common_address)
        sites = row.xpath('.//*[@itemprop="site"]')
        if len(sites) != 1:
            raise ValueError("Missing exact site cell for " + name)
        hrefs = sites[0].xpath('.//a/@href')
        published = hrefs[0] if hrefs else clean(sites[0].text_content())
        url = urljoin(meta["url"], published)
        safe.validate_source_url(slug, url)
        unit = {"name": name, "url": url, **provenance(meta)}
        result.append(unit)
        evidence.append({"name": name, "url": url, "xpath": tree.getroottree().getpath(node), "rowXPath": tree.getroottree().getpath(row), "siteXPath": tree.getroottree().getpath(sites[0]), "address": address, "mainCity": TARGETS[slug]["city"], "literalRowText": clean(row.text_content()), "campusReview": campus_review, **provenance(meta)})
    return result, evidence


def build(work, output, report_path):
    baseline = freeze_baseline(work)
    profiles, reviewed = [], []
    for slug, target in TARGETS.items():
        common_url = target["base"] + "/sveden/common/"
        struct_url = target["base"] + target["struct"]
        meta, tree = source(work, slug, common_url)
        fields, field_evidence = common_fields(tree, meta)
        if any(key in baseline["fields"][slug] for key in fields):
            raise ValueError("Attempt to replace a previously sourced field")
        meta, tree = source(work, slug, struct_url)
        faculties, unit_evidence = academic_units(slug, tree, meta, fields["address"]["value"])
        known = {clean(name).casefold() for name in baseline["facultyNames"][slug]}
        if any(clean(unit["name"]).casefold() in known for unit in faculties):
            raise ValueError("Attempt to repeat a previously sourced unit")
        profiles.append({"universitySlug": slug, "fields": fields, "faculties": faculties, "offerings": []})
        reviewed.append({"universitySlug": slug, "fields": field_evidence, "faculties": unit_evidence})
    receipts = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(work.glob("*/*.meta.json"))]
    issues = [{"universitySlug": row["universitySlug"], "sourceUrl": row["requestedUrl"], "reason": row.get("error", "HTTP failure")} for row in receipts if row.get("error") or str(row.get("httpStatus")) != "200"]
    issues.append({"universitySlug": "russia-194", "sourceUrl": "https://pnzgu.ru/sveden/common/", "reason": "HTTP 200 с заголовком ошибки 404 исключён. Другие страницы ПГУ требуют отдельного разбора вложенной структуры; сведения не добавлены."})
    stats = {"universities": len(profiles), "fields": sum(len(p["fields"]) for p in profiles), "faculties": sum(len(p["faculties"]) for p in profiles), "offerings": 0}
    scope = "Частичные перечни факультетов/институтов и шесть основных сведений УлГТУ, УлГУ, ВолГУ и ЛГТУ из официальных страниц. Вложенные единицы считаются подразделениями. Условия поступления, текущие лицензии, конкурсные программы и наличие мест не подтверждаются этой партией."
    payload = {"checkedAt": max(f["checkedAt"] for p in profiles for f in p["fields"].values()), "sourceYear": 2026, "scope": scope, "profiles": profiles, "sources": receipts, "issues": issues, "stats": stats}
    dump(output, payload)
    dump(report_path, {"batchDate": BATCH, "scope": scope, "baseline": baseline, "workDirectory": work.relative_to(ROOT).as_posix(), "stats": stats, "reviewed": reviewed, "sources": receipts, "issues": issues, "scopeExclusions": EXCLUSIONS, "reproduction": {"offline": "python -X utf8 scripts/collect-regional-nov09-continuation-structure.py", "replay": "python -X utf8 scripts/collect-regional-nov09-continuation-structure.py --output tmp/continuation-structure-replay.json --report tmp/continuation-structure-replay-report.json"}})
    print(json.dumps(stats))


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
            raise ValueError("Fresh evidence must match the actual batch UTC date")
        requests = [(slug, target["base"] + path) for slug, target in TARGETS.items() for path in ("/sveden/common/", target["struct"])]
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda entry: safe.fetch(args.work, *entry), requests))
    build(args.work, args.output, args.report)


if __name__ == "__main__":
    main()

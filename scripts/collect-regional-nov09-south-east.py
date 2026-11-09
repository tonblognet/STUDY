"""Reviewed November 9 regional catalog delta. Offline replay is the default.

Use --collect only for the frozen UTC collection date. Existing snapshots
and review dates are reused. Evidence bodies stay in the ignored tmp directory.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from urllib.parse import urljoin
import json
import re

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "tmp/russia-research/south-east-2026-11-09"
BATCH = "2026-11-09"
CANDIDATE = ROOT / "data-sources/russia/south-east-enrichment-2026-11-09.json"


def load(name, filename):
    spec = spec_from_file_location(name, Path(__file__).with_name(filename))
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


safe = load("nov_south_safe", "collect-contacts-enrichment.py")
safe.BATCH = BATCH
safe.OFFICIAL_HOSTS = {
    "russia-288": {"togudv.ru", "pnu.edu.ru"},
    "russia-296": {"tpu.ru"},
    "russia-337": {"sfedu.ru"},
}
education = load("nov_south_education", "collect-regional-oct25-education.py")
clean = safe.clean

BASE_URLS = {
    "russia-288":{
        "home":"https://togudv.ru/",
        "common":"https://togudv.ru/sveden/common/",
        "structure":"https://togudv.ru/sveden/struct/",
        "education":"https://togudv.ru/sveden/education/",
        "pnu":"https://pnu.edu.ru/ru/",
    },
    "russia-296":{
        "home":"https://tpu.ru/",
        "common":"https://tpu.ru/sveden/common/",
        "structure":"https://tpu.ru/sveden/struct/?mode=print",
        "education":"https://tpu.ru/sveden/education/",
        "catalog":"https://oop.tpu.ru/",
        "admissions":"https://abiturient.tpu.ru/bakalavr/",
        "hostel":"https://tpu.ru/student/campus-host/",
    },
    "russia-337":{
        "home":"https://sfedu.ru/",
        "common":"https://sfedu.ru/www/stat_pages22.show?p=GOV%2Fmain%2FM",
        "common_alt":"https://incampus.sfedu.ru/www/stat_pages22.show?p=GOV%2FN10537%2FB",
        "structure":"https://sfedu.ru/www/stat_pages22.show?p=GOV%2FN10547%2FB",
        "admissions":"https://sfedu.ru/www/stat_pages22.show?p=PR%2FN13141%2FP",
        "admissions_alt":"https://app.sfedu.ru/",
        "hostel":"https://sfedu.ru/www/stat_pages22.show?p=STD%2FN13054%2FP",
        "hostel_alt":"https://welcome.sfedu.ru/dormitory_ru",
    },
}

ALTERNATE_URLS = {
"russia-288":{
 "admissions":"https://togudv.ru/ru/applicant/",
 "institutions":"https://togudv.ru/ru/institutions/",
 "hostel":"https://togudv.ru/sveden/objects/",
},
"russia-296":{
 "schools":"https://staff.tpu.ru/department/school",
 "bachelor":"https://tpu.ru/education/bachelor/",
 "campus":"https://tpu.ru/tpu-life/campus",
},
"russia-337":{
 "home_www":"https://www.sfedu.ru/",
 "common_www":"https://www.sfedu.ru/www/stat_pages22.show?p=GOV%2Fmain%2FM",
 "structure_www":"https://www.sfedu.ru/www/stat_pages22.show?p=GOV%2FN10547%2FB",
 "study":"https://www.study.sfedu.ru/",
 "study_bare":"https://study.sfedu.ru/",
 "sau_admissions":"https://sau.sfedu.ru/?page_id=621",
 "transfer":"https://ictis.sfedu.ru/news/2026/08/transfers/",
 "welcome":"https://welcome.sfedu.ru/",
 "raai":"https://raai.sfedu.ru/Abiturient/abiturient.html",
 "legal":"https://www.urfak.sfedu.ru/",
 "isir":"https://isir.sfedu.ru/index.php?Itemid=259&id=2929&option=com_content&view=article",
}}

SOURCES = {slug: {**urls, **ALTERNATE_URLS[slug]} for slug, urls in BASE_URLS.items()}

profile = {slug: {"universitySlug": slug, "fields": {}, "faculties": [], "offerings": []} for slug in SOURCES}
issues = []
reviewed_fields = []
reviewed_units = []
reviewed_offerings = {}

def source(slug, key):
    return safe.load_evidence(WORK, slug, SOURCES[slug][key])

def provenance(meta, year=2026):
    return {"sourceUrl": meta["url"], "sourceYear": year, "checkedAt": meta["checkedAt"], "sourceSha256": meta["sourceSha256"]}

def exact_field(slug, key, source_key, xpath, value, context=None, proof=None):
    meta, doc = source(slug, source_key)
    elements = doc.xpath(xpath)
    for element in elements:
        text = clean(" ".join(element.xpath(".//text()[not(ancestor::script) and not(ancestor::style)]")))
        if clean(proof or value) in text and (not context or clean(context) in text):
            profile[slug]["fields"][key] = {"value": value, **provenance(meta)}
            reviewed_fields.append({"universitySlug": slug, "field": key, **provenance(meta), "requestedUrl": meta["requestedUrl"], "xpath": doc.getroottree().getpath(element), "literalFieldText": text, "proof": proof or value})
            return
    raise ValueError(f"Evidence mismatch for {slug} {key}: {proof or value}")

def link_field(slug, key, source_key, href, label, value):
    meta, doc = source(slug, source_key)
    element = next(node for node in doc.xpath("//a[@href]") if node.get("href") == href and label == clean(node.text_content()))
    if urljoin(meta["url"], href) != value:
        raise ValueError("Admissions link target mismatch")
    safe.validate_source_url(slug, value)
    profile[slug]["fields"][key] = {"value": value, **provenance(meta)}
    reviewed_fields.append({"universitySlug": slug, "field": key, **provenance(meta), "requestedUrl": meta["requestedUrl"], "xpath": doc.getroottree().getpath(element), "literalFieldText": label, "href": href})

TOGU, TPU, SFEDU = "russia-288", "russia-296", "russia-337"
HOSTEL_NOTE = " Наличие свободных мест и предоставление места требуют отдельного подтверждения."
TOGU_UNITS = {
    "Институт лингвистики и межкультурной коммуникации (ИЛМК)": "ilmk",
    "Институт социально-политических технологий и коммуникаций (ИСПТиК)": "isptik",
    "Педагогический институт (Пединститут)": "pedinstitut",
    "Институт экономики и управления (ИЭУ)": "ieu",
    "Юридический институт (ЮИ)": "yui",
    "Институт архитектуры, строительства и дизайна (ИАСиД)": "iasid",
    "Политехнический институт (ПОЛИТЕХ)": "politeh",
}
TPU_UNITS = {
    "Инженерная школа «Интеллектуальные энергетические системы»",
    "Инженерная школа информационных технологий и робототехники",
    "Инженерная школа неразрушающего контроля и безопасности",
    "Инженерная школа новых производственных технологий",
    "Инженерная школа природных ресурсов",
    "Инженерная школа энергетики",
    "Инженерная школа ядерных технологий",
    "Школа общественных наук",
}

def units(slug, names, table_index):
    meta, doc = source(slug, "structure")
    table = doc.xpath("//table")[table_index]
    found = set()
    for row in table.xpath("./tbody/tr"):
        cells = row.xpath("./td")
        col = 1 if slug == TPU else 0
        if len(cells) < col + 5:
            continue
        name = clean(cells[col].text_content())
        if name not in names:
            continue
        address = clean(cells[col + 3].text_content())
        urls = cells[col + 4].xpath(".//a/@href")
        if slug == TOGU:
            if "г. Хабаровск" not in address:
                raise ValueError("TOGU unit outside reviewed campus")
            urls = [url for url in urls if url == "/ru/institutions/" + TOGU_UNITS[name] + "/"]
        if len(set(urls)) != 1:
            raise ValueError("Ambiguous official unit URL: " + name)
        url = urljoin(meta["url"], urls[0])
        safe.validate_source_url(slug, url)
        if name in found:
            raise ValueError("Duplicate reviewed unit")
        profile[slug]["faculties"].append({"name": name, "url": url, **provenance(meta)})
        reviewed_units.append({"universitySlug": slug, "name": name, "address": address, "url": url, "xpath": doc.getroottree().getpath(row), **provenance(meta)})
        found.add(name)
    if found != set(names):
        raise ValueError("Reviewed units missing")

TPU_STANDARD = " (ФГОС ВО 3++ (действует c 01.09.2017))"
TPU_MAIN_SCHOOLS = {"ИШПР","ИШНКБ","ИШЭ","ИШИТР","ИЯТШ","ИШНПТ","БШ","ШОН","ИШИнЭС"}
TPU_TERM = re.compile(r"(?P<school>.+) - (?P<duration>\d+ (?:год|года|лет)(?: \d+ мес\.)?) \((?P<cohort>20\d{2})\)")
SECTION = "Реализуемые образовательные программы"

def offerings(slug):
    meta, doc = source(slug,"education")
    table = doc.xpath("//table")[0]
    col = 1 if slug == TPU else 0
    rows, exclusions = [], Counter()
    header = table.xpath(".//tr[1]")[0]
    columns = [clean(c.text_content()) for c in header.xpath("./th|./td")]
    duration_col = 7 if slug == TPU else 5
    if columns[duration_col] != "Нормативный срок обучения" or not columns[col].startswith("Код"):
        raise ValueError("Disclosure education table changed")
    for index, row in enumerate(table.xpath("./tbody/tr|./tr"), 1):
        cells = [clean(c.text_content()) for c in row.xpath("./td")[:duration_col + 1]]
        if len(cells) <= duration_col or not re.fullmatch(r"\d{2}\.(?:03|05)\.\d{2}", cells[col]):
            continue
        code, title, name, level, mode = cells[col:col + 5]
        raw_duration = cells[duration_col]
        locator = {"tableIndex":0,"rowIndex":index,"section":SECTION,"literalCells":cells[:duration_col+1]}
        duration = raw_duration
        if slug == TPU:
            school = raw_duration.split(" - ", 1)[0]
            if school == "ЮТИ ТПУ":
                exclusions["ЮТИ ТПУ (Юрга)"] += 1
                continue
            if school not in TPU_MAIN_SCHOOLS:
                exclusions["Неподтверждённое подразделение"] += 1
                continue
            if not title.endswith(TPU_STANDARD):
                raise ValueError("Unexpected TPU title format")
            title = title.removesuffix(TPU_STANDARD)
            match = TPU_TERM.fullmatch(raw_duration)
            duration = match["duration"] if match else None
            if match:
                locator.update({"unit": school, "cohort": match["cohort"]})
            else:
                issues.append({"universitySlug":slug,"kind":"offering_duration_format_unresolved","publishedValue":raw_duration,**provenance(meta, None),**locator})
        values = {"eduCode":code,"eduName":title,"eduProf":name,"eduLevel":level,"eduForm":mode}
        item = education.fact(slug,values,meta,locator,issues,raw_duration=duration,duration_header=columns[duration_col])
        if item:
            rows.append((item, locator))
    result, evidence = education.deduplicate(rows,slug,issues)
    profile[slug]["offerings"] = result
    # Row numbers point to the hashed first disclosure table, not statistics
    # or cohort documentation tables on the same page.
    reviewed_offerings[slug] = {
        "source": provenance(meta, None),
        "tableIndex": 0,
        "rowNumbersByOfferingId": {
            key: [row["rowIndex"] for row in source_rows]
            for key, source_rows in evidence.items()
        },
        "excludedCampusRows": dict(exclusions),
        "eligibleRowsBeforeDeduplication": len(rows),
    }



def build(output):
    exact_field(TOGU,"fullName","common",'//p[./*[@itemprop="fullName"]]', "Федеральное государственное бюджетное образовательное учреждение высшего образования «Тихоокеанский государственный университет имени М.П. Даниловского»", "Официальное наименование", "Федеральное государственное бюджетное образовательное учреждение высшего образования «Тихоокеанский государственный университет имени М.П. Даниловского »")
    for key, value in {
        "shortName": "ФГБОУ ВО «ТОГУ имени М.П. Даниловского»",
        "regDate": "29 марта 1958 г.",
        "address": "680042, Россия, г. Хабаровск, ул. Тихоокеанская, 136",
        "telephone": "(4212) 97-97-00",
        "email": "mail@togudv.ru",
    }.items():
        exact_field(TOGU,key,"common",f'//*[@itemprop="{key}"]',value)
    link_field(TOGU,"admissionsUrl","home","/ru/applicant/","Абитуриенту","https://togudv.ru/ru/applicant/")
    for key, value in {"admissionsPhone": "(4212) 97-97-31", "admissionsEmail": "abitur@togudv.ru"}.items():
        exact_field(TOGU,key,"admissions",'/html/body/div[1]/div[4]/div[2]/div/div[1]/div/nav/ul/li[1]',value,"Приемная комиссия ТОГУ:")
    exact_field(TOGU,"hostelInfo","hostel","//tr[td]", "ТОГУ публикует перечень общежитий в Хабаровске, в том числе по адресу ул. Тихоокеанская, 140." + HOSTEL_NOTE, "Общежитие", "г. Хабаровск, ул. Тихоокеанская, д. 140")

    for key, value in {
        "fullName": "Федеральное государственное автономное образовательное учреждение высшего образования «Национальный исследовательский Томский политехнический университет»",
        "shortName": "ФГАОУ ВО НИ ТПУ",
        "regDate": "15 мая 2014 г.",
        "address": "Россия, 634050, г. Томск, проспект Ленина, дом 30",
        "telephone": "+7 (3822) 60-63-33",
        "email": "tpu@tpu.ru",
    }.items():
        exact_field(TPU,key,"common",f'//*[@itemprop="{key}"]',value)
    link_field(TPU,"admissionsUrl","home","https://abiturient.tpu.ru/","Абитуриенту","https://abiturient.tpu.ru/")
    for key, value in {
        "admissionsPhone": "8-800-350-28-09 (для граждан РФ); +7 (3822) 60-99-09 (для иностранных граждан)",
        "admissionsEmail": "abiturient@tpu.ru",
    }.items():
        exact_field(TPU,key,"admissions","/html/body/div/footer/div[1]/div[2]/div[2]/div[2]",value,"Приемная комиссия ТПУ",value.replace("; ", " "))
    exact_field(TPU,"hostelInfo","campus",'//h1|//h2|//h3|//h4|//p|//span|//div[not(descendant::div)]',"ТПУ указывает 15 студенческих общежитий." + HOSTEL_NOTE,proof="15 студенческих общежитий")

    exact_field(SFEDU,"admissionsPhone","isir",'/html/body/div/div[3]/main/div/div[2]/div[17]/div[2]/div[2]/div',"8-800-700-33-98; +7 (863) 2-370-370","Приемная комиссия ЮФУ: г. Ростов-на-Дону","8-800-700-33-98, +7 (863) 2-370-370")
    exact_field(SFEDU,"hostelInfo","hostel_alt",'//p|//div[not(descendant::div)]',"В Ростове-на-Дону ЮФУ описывает студенческие общежития квартирного типа по адресу ул. Зорге, 21." + HOSTEL_NOTE,proof="г. Ростов-на-Дону, ул. Зорге, 21")

    units(TOGU, TOGU_UNITS, 0)
    units(TPU, TPU_UNITS, 5)
    offerings(TOGU)
    offerings(TPU)

    baseline_path = WORK / "baseline.json"
    if baseline_path.exists():
        baseline = json.loads(baseline_path.read_bytes())
    elif CANDIDATE.exists():
        baseline = json.loads(CANDIDATE.read_bytes())["gapBaseline"]
    else:
        raw_baseline = json.loads((ROOT / "data-sources/russia/coverage.json").read_bytes())
        baseline = {row["slug"]: row for row in raw_baseline["universities"] if row["slug"] in profile}
    if set(baseline) != set(profile):
        raise ValueError("Frozen coverage baseline has different university slugs")
    for slug,row in profile.items():
        for key in row["fields"]:
            if key not in baseline[slug]["missing"]:
                raise ValueError("Baseline is already populated: " + slug + "/" + key)
        if row["faculties"] and baseline[slug]["faculties"]:
            raise ValueError("Baseline already includes faculties")
        if row["offerings"] and baseline[slug]["educationalListings"]:
            raise ValueError("Baseline already includes educational listings")

    sources = sorted(
        (json.loads(p.read_text(encoding="utf-8")) for p in WORK.glob("*/*.meta.json")),
        key=lambda meta: (meta["universitySlug"], meta["requestedUrl"]),
    )
    for meta in sources:
        if meta.get("httpStatus") != "200":
            issues.append({
                "universitySlug": meta["universitySlug"],
                "kind": "source_unavailable",
                "requestedUrl": meta["requestedUrl"],
                "reason": meta.get("error") or "HTTP " + str(meta.get("httpStatus")),
            })
    stats = {slug: {key: len(row[key]) for key in ("fields", "faculties", "offerings")} for slug, row in profile.items()}
    report = {
        "profiles": list(profile.values()),
        "batchDate": BATCH,
        "scope": "Томск, Хабаровск и Ростов-на-Дону. Образовательные записи .03/.05 отражают реализацию. Кампания приёма, доступность мест в общежитиях и магистратура требуют отдельной проверки.",
        "stats": stats,
        "gapBaseline": baseline,
        "sources": sources,
        "issues": issues,
        "reviewedFields": reviewed_fields,
        "reviewedUnits": reviewed_units,
        "reviewedOfferings": reviewed_offerings,
    }
    safe.dump(output, report)
    print(json.dumps(stats, ensure_ascii=False))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collect", action="store_true")
    parser.add_argument("--output", type=Path, default=WORK / "replay.json")
    args = parser.parse_args()
    if args.collect:
        if datetime.now(timezone.utc).date().isoformat() != BATCH:
            parser.error("Collection date is frozen; use offline replay of the saved evidence")
        targets = [(slug, url) for slug, urls in SOURCES.items() for url in dict.fromkeys(urls.values())]
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda pair: safe.fetch(WORK, *pair), targets))
    build(args.output)


if __name__ == "__main__":
    main()

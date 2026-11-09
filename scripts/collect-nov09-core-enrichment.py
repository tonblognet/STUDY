"""Replay reviewed Nov 9 directory facts from local official HTTP snapshots."""

import argparse
from pathlib import Path
import re
from urllib.parse import urljoin

from importlib.util import module_from_spec, spec_from_file_location


ROOT = Path(__file__).resolve().parents[1]
BATCH = "2026-11-09"
WORK = ROOT / "tmp/russia-research/nov09-central"
OUT = ROOT / f"data-sources/russia/core-enrichment-{BATCH}.json"
SPEC = spec_from_file_location("education", ROOT / "scripts/collect-regional-oct25-education.py")
education = module_from_spec(SPEC)
SPEC.loader.exec_module(education)

OMSK = "russia-1638"
PETR = "russia-199"
ISU = "russia-83"
YSTU = "russia-341"
COMMON = "https://omgau.ru/sveden/common/"
STRUCTURE = "https://omgau.ru/sveden/struct/"
EDUCATION = "https://omgau.ru/sveden/education/eduaccred"
OMSK_CONTACTS = "https://www.omgau.ru/o-universitete/kontakti/"
OMSK_ADMISSIONS = "https://www.omgau.ru/abiturientu/"
HOSTEL = "https://www.omgau.ru/campus/obshchezhitiya/pravila-prozhivaniya/"
PETR_ADMISSIONS = "https://www.petrsu.ru/page/aggr/abit"
ISU_CONTACTS = "https://www.isu.ru/ru/contacts/contacts/"
YSTU_CONTACTS = "https://ystu.ru/contacts/"
SOURCES = {
    OMSK: ("omgau.ru", [COMMON, STRUCTURE, EDUCATION, OMSK_CONTACTS, OMSK_ADMISSIONS, HOSTEL]),
    PETR: ("petrsu.ru", [PETR_ADMISSIONS]),
    ISU: ("isu.ru", [ISU_CONTACTS]),
    YSTU: ("ystu.ru", [YSTU_CONTACTS]),
}
education.guard.BATCH = BATCH
for slug, (domain, _) in SOURCES.items():
    education.guard.OFFICIAL_HOSTS[slug] = {domain}


def literal(node):
    return education.clean(" ".join(node.xpath(".//text()[not(ancestor::script) and not(ancestor::style)]")))


def one(node, selector):
    results = node.xpath(selector)
    if len(results) != 1:
        raise ValueError(f"Expected one result for {selector}, found {len(results)}")
    return results[0]


def provenance(meta):
    return {**education.provenance(meta), "sourceYear": int(BATCH[:4])}


def build(work, output):
    profiles, sources, documents, review, issues = {}, [], {}, [], []
    for slug, (_, urls) in SOURCES.items():
        profiles[slug] = {"universitySlug": slug, "fields": {}, "faculties": [], "offerings": []}
        for url in urls:
            meta, doc = education.evidence(work, slug, url)
            sources.append(meta)
            documents[url] = (slug, meta, doc)

    def field(url, key, selector, value=None, quote=None):
        slug, meta, doc = documents[url]
        node = one(doc, selector)
        text = literal(node)
        if key == "admissionsUrl":
            value = meta["url"]
        elif value is None:
            value = text
        elif (quote or value) not in text:
            raise ValueError(f"Missing reviewed {key} in {url}")
        profiles[slug]["fields"][key] = {"value": value, **provenance(meta)}
        review.append({"universitySlug": slug, "field": key, "sourceUrl": meta["url"], "xpath": doc.getroottree().getpath(node)})

    for key in ("fullName", "shortName", "regDate"):
        field(COMMON, key, f'//*[@itemprop="{key}"]')
    field(COMMON, "telephone", '//*[@itemprop="telephone"]', "+7 (3812) 65-11-46")
    field(COMMON, "email", '//*[@itemprop="email"]', "adm@omgau.ru")
    field(OMSK_CONTACTS, "address", '//td[contains(., "644008, Сибирский федеральный округ") and contains(., "Институтская площадь")]')
    field(OMSK_CONTACTS, "admissionsPhone", '//td[h2[contains(., "Приемная комиссия")]]', "+7 (3812) 65-53-44")
    field(OMSK_ADMISSIONS, "admissionsUrl", '//title[contains(., "Абитуриентам")]')
    field(
        HOSTEL,
        "hostelInfo",
        '//li[starts-with(normalize-space(.), "Заселение обучающихся производится")]',
        "Для заселения в общежитие нужны личное заявление, решение комиссии по предоставлению мест и договор найма.",
        quote="Заселение обучающихся производится на основании личных заявлений, решения комиссии по предоставлению мест в студенческих общежитиях и договора найма жилого помещения в студенческом общежитие.",
    )

    field(PETR_ADMISSIONS, "admissionsUrl", '//title[contains(., "Приемная кампания")]')
    field(PETR_ADMISSIONS, "admissionsPhone", '//p[contains(., "Задать вопрос в приемную комиссию")]', "(814-2) 71-10-30")
    field(PETR_ADMISSIONS, "admissionsEmail", '//p[contains(., "Задать вопрос в приемную комиссию")]/a[starts-with(@href, "mailto:")]', "priem@petrsu.ru")
    field(PETR_ADMISSIONS, "address", '//footer//address', "185910, Россия, Республика Карелия, г. Петрозаводск, пр. Ленина, 33")
    field(PETR_ADMISSIONS, "email", '//footer//address/a[starts-with(@href, "mailto:")]', "rectorat@petrsu.ru")
    field(PETR_ADMISSIONS, "telephone", '//footer//p[contains(., "По официальным запросам")]', "(814-2) 71-10-29")
    field(ISU_CONTACTS, "admissionsPhone", '//p[strong[contains(., "Центральная приемная комиссия")]]', "(3952) 521-555")
    field(ISU_CONTACTS, "admissionsEmail", '//p[strong[contains(., "Центральная приемная комиссия")]]/a[@href="mailto:priem@isu.ru"]', "priem@isu.ru")
    field(YSTU_CONTACTS, "admissionsPhone", '//article[h3[contains(., "Абитуриенту")]]//a[contains(., "250-76-77")]', "+7 800 250-76-77")
    field(YSTU_CONTACTS, "admissionsEmail", '//article[h3[contains(., "Абитуриенту")]]//a[@href="mailto:priem@ystu.ru"]', "priem@ystu.ru")

    def unit(url, node, heading, link=None):
        slug, meta, doc = documents[url]
        if link:
            education.guard.validate_source_url(slug, link)
        name = literal(node)
        profiles[slug]["faculties"].append({"name": name, "url": link, "sourceSection": heading, **provenance(meta)})
        review.append({"universitySlug": slug, "faculty": name, "sourceUrl": meta["url"], "xpath": doc.getroottree().getpath(node)})

    _, _, doc = documents[STRUCTURE]
    for row in doc.xpath('//tr[td[@itemprop="name"]]'):
        name = one(row, './td[@itemprop="name"]')
        if not re.match(r"^(?:Факультет|Институт|Землеустроительный|Агротехнологический|Экономический)", literal(name)):
            continue
        if re.search(r"филиал|дополнительного профессионального", literal(name), re.I):
            continue
        if not any("г. Омск" in literal(cell) for cell in row.xpath("./td")):
            raise ValueError(f"Oмский адрес подразделения не подтверждён: {literal(name)}")
        unit(STRUCTURE, name, "Структура и органы управления образовательной организацией")

    _, meta, doc = documents[PETR_ADMISSIONS]
    heading = one(doc, '//h4[contains(., "ОБРАЗОВАТЕЛЬНЫЕ ИНСТИТУТЫ")]')
    for link in heading.getparent().xpath('.//a[starts-with(@href, "/structure/")]'):
        if re.search(r"\bинститут\b", literal(link), re.I):
            unit(PETR_ADMISSIONS, link, literal(heading), urljoin(meta["url"], link.get("href")))

    _, meta, doc = documents[EDUCATION]
    offering_rows = []
    for table in doc.xpath('//table[.//td[@itemprop="eduCode"]]'):
        heading = education.section(table)
        if heading not in {"Программы бакалавриата", "Программы специалитета"}:
            continue
        for row in table.xpath('.//tr[td[@itemprop="eduCode"]]'):
            values = {cell.get("itemprop"): literal(cell) for cell in row.xpath("./td[@itemprop]") if cell.get("itemprop") in education.PROPS}
            locator = {"section": heading, "xpath": doc.getroottree().getpath(row), "literalCells": values}
            item = education.fact(OMSK, values, meta, locator, issues, duration_header="Нормативный срок обучения")
            if item:
                offering_rows.append((item, locator))
    offerings, locators = education.deduplicate(offering_rows, OMSK, issues)
    profiles[OMSK]["offerings"] = offerings
    review.extend({"universitySlug": OMSK, "offeringId": item["id"], "sourceUrl": meta["url"], "xpaths": [row["xpath"] for row in locators[item["id"]]]} for item in offerings)

    if any(not profile["fields"] for profile in profiles.values()) or len(profiles[OMSK]["faculties"]) != 8 or len(profiles[PETR]["faculties"]) != 11 or not offerings:
        raise ValueError("Reviewed facts or source sections disappeared")
    data = {
        "checkedAt": max(row["checkedAt"] for row in sources),
        "scope": "Общие сведения, приёмные контакты, образовательные институты и перечень бакалавриата по официальным источникам. Перечень ОмГАУ относится к головному вузу. Конкурсные группы не добавляются.",
        "profiles": list(profiles.values()),
        "sources": sources,
        "review": review,
        "issues": issues,
        "limitations": [
            "Личный адрес сотрудника приёмной комиссии ОмГАУ и адрес Минобрнауки исключены. Адрес комиссии ОмГАУ остаётся неизвестным.",
            "СПО, ДПО, Тарский филиал и аспирантура ОмГАУ исключены. Опубликованный объединённый уровень «специалитет, магистратура» требует отдельного уточнения.",
            "У ПетрГУ взят опубликованный список образовательных институтов для поступающих; подготовительное отделение исключено. Даты из смешанных блоков разных приёмных кампаний не использованы.",
        ],
    }
    education.dump(output, data)
    for slug, profile in profiles.items():
        print(slug, {key: len(value) for key, value in profile.items() if key != "universitySlug"})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collect", action="store_true", help="Fetch missing official HTTPS snapshots")
    parser.add_argument("--cache-dir", type=Path, default=WORK)
    parser.add_argument("--output", type=Path, default=OUT)
    args = parser.parse_args()
    if args.collect:
        for slug, (_, urls) in SOURCES.items():
            for url in urls:
                education.fetch(args.cache_dir, slug, url)
    build(args.cache_dir, args.output)

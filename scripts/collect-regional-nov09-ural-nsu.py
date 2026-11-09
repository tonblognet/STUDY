"""Replay reviewed UrFU / NSU gap-only facts from guarded local HTTP snapshots."""
import argparse
import importlib.util
import json
from pathlib import Path
import re
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
BATCH = "2026-11-09"
URFU = "russia-313"
NSU = "russia-178"
WORK = ROOT / f"tmp/russia-research/ural-nsu-{BATCH}"
OUT = ROOT / f"data-sources/russia/ural-nsu-enrichment-{BATCH}.json"
REPORT = ROOT / f"data-sources/russia/ural-nsu-collection-report-{BATCH}.json"
COMMON_URL = {
    URFU: "https://urfu.ru/sveden/common/",
    NSU: "https://www.nsu.ru/n/sveden/common/",
}
EDUCATION_URL = {
    URFU: "https://urfu.ru/sveden/education/",
    NSU: "https://www.nsu.ru/n/sveden/education/",
}
ADMISSIONS_URL = {
    URFU: "https://urfu.ru/ru/applicant/",
    NSU: "https://future.nsu.ru/",
}
HOUSING_URL = {
    URFU: "https://urfu.ru/ru/students/social/campus/",
    NSU: "https://www.nsu.ru/n/life/campus/dormitories/",
}
UNITS_URL = {
    URFU: "https://urfu.ru/ru/instituty/",
    NSU: "https://www.nsu.ru/n/education/departments-sections/",
}
URFU_OVERVIEW = "https://privet.urfu.ru/about"
URFU_CAMPUS_SCOPE = "https://urfu.ru/priemurfu/"
URFU_PERSONNEL_PROGRAM = "https://programs.edu.urfu.ru/ru/10144/"
TARGETS = {
    slug: [urls[slug] for urls in (COMMON_URL, EDUCATION_URL, ADMISSIONS_URL, HOUSING_URL, UNITS_URL)]
    for slug in (URFU, NSU)
}
TARGETS[URFU].extend([URFU_OVERVIEW, URFU_CAMPUS_SCOPE, URFU_PERSONNEL_PROGRAM])
SCOPE = "Общие сведения, приёмные комиссии, общежития, учебные подразделения и образовательные перечни УрФУ (Екатеринбург) и НГУ (Новосибирск). Перечни частичные: бакалавриат, специалитет и базовое высшее с кодами .03/.05. Год приёма не установлен. Условия конкурсного отбора не добавляются."

def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

education = load_module("education_base", "collect-regional-oct25-education.py")
regional = education.shared
guard = load_module("ural_nsu_guard", "collect-contacts-enrichment.py")
guard.BATCH = BATCH
guard.OFFICIAL_HOSTS = {URFU: {"urfu.ru"}, NSU: {"nsu.ru"}}
c = guard.clean
issues = []
sources = {}

def document(work, slug, url):
    meta, tree = guard.load_evidence(work, slug, url)
    visible = tree.xpath('//body//text()[not(ancestor::script) and not(ancestor::style)]')
    if len(c(" ".join(visible))) < 500:
        raise ValueError(f"Insufficient source content: {url}")
    sources[url] = meta
    return meta, tree

def provenance(meta):
    return {"sourceUrl": meta["url"], "sourceYear": 2026, "checkedAt": meta["checkedAt"], "sourceSha256": meta["sourceSha256"]}

def only(nodes, name):
    if len(nodes) != 1:
        raise ValueError(f"Expected one {name}; got {len(nodes)}")
    return nodes[0]

def literal(node):
    return c(" ".join(node.itertext()))

def set_field(fields, key, value, meta, evidence):
    if key in fields or not value:
        raise ValueError(f"Invalid field {key}")
    fields[key] = {"value": value, **provenance(meta)}
    return {"value": value, "literalEvidence": evidence, "sourceUrl": meta["url"]}

def common_fields(slug, meta, doc):
    fields, review = {}, {}
    if slug == URFU:
        return regional.common_fields(doc, meta), review
    selectors = {
        "fullName": r"Полное наименование:\s*(.+)",
        "shortName": r"Сокращенное наименование:\s*(.+)",
        "regDate": r"Дата создания образовательной организации\s*(9 января 1958 г\.).*",
        "address": r"Адрес:\s*(.+)",
        "telephone": r"Контактные телефоны:\s*(\+7 \(383\) 363 40 00)",
        "email": r"Электронная почта:\s*(rector@nsu.ru)",
    }
    for key, pattern in selectors.items():
        evidence = literal(only(doc.xpath(f'//*[@itemprop="{key}"]'), key))
        match = re.fullmatch(pattern, evidence)
        if not match:
            raise ValueError(f"Unexpected NSU field markup {key}: {evidence[:150]}")
        review[key] = set_field(fields, key, match[1], meta, evidence if key != "regDate" else evidence[:145])
    return fields, review

def read_contacts(slug, fields, review, meta, doc, contact, phone, email):
    selected = only(doc.xpath(contact), "admissions office")
    evidence = literal(selected)
    for key, value in [("admissionsUrl", meta["url"]), ("admissionsPhone", phone), ("admissionsEmail", email)]:
        if key != "admissionsUrl" and value not in evidence:
            raise ValueError(f"Missing {slug} {key} in published admissions office")
        review[key] = set_field(fields, key, value, meta, evidence)

def url_for_unit(slug, meta, url):
    resolved = urljoin(meta["url"], url)
    # Retain the university-published scheme. Requiring TLS applies to provenance fetches.
    guard.validate_source_url(slug, re.sub(r"^http:", "https:", resolved))
    return resolved

def urfu_faculties(meta, doc):
    units = []
    for card in doc.xpath('//div[@class="in"][./ul/li/a[normalize-space(.)="Посетить сайт"]]'):
        label = card.xpath('./a[1]|./h3[1]|./h4[1]')
        if not label:
            label = card.xpath('./*[1]')
        name = c(label[0].text_content())
        if not re.search(r"\bинститут\b|^Уральская передовая инженерная школа", name, re.I):
            continue
        if "филиал" in name.casefold():
            raise ValueError("Branch in UrFU unit directory")
        link = only(card.xpath('./ul/li/a[normalize-space(.)="Посетить сайт"]/@href'), name)
        if "Адрес: ул." not in c(card.text_content()):
            raise ValueError(f"Missing main-city address context {name}")
        units.append({"name": name, "url": url_for_unit(URFU, meta, link), **provenance(meta)})
    if len(units) != 13 or len({u["name"] for u in units}) != 13:
        raise ValueError("UrFU reviewed main-city academic unit count changed")
    return units

def nsu_faculties(meta, doc, edu_doc):
    units = []
    for card in doc.xpath('//div[contains(concat(" ",normalize-space(@class)," ")," department-card ")]'):
        name = literal(only(card.xpath('./a[contains(concat(" ",normalize-space(@class)," ")," inner ")]'), "NSU unit name"))
        if not re.search(r"\bинститут\b|\bфакультет\b|^Передовая инженерная школа$", name, re.I):
            continue
        link = only(card.xpath('.//a[normalize-space(.)="Подробнее"]/@href'), name)
        if name == "Передовая инженерная школа":
            section = only(edu_doc.xpath('//*[@id="collapse_16926"]'), "NSU engineering school")
            if not section.xpath('.//*[@itemprop="eduLevel"][contains(.,"Магистратура")]'):
                raise ValueError("Higher education scope of the NSU engineering school not confirmed")
        units.append({"name": name, "url": url_for_unit(NSU, meta, link), **provenance(meta)})
    if len(units) != 11 or len({u["name"] for u in units}) != 11:
        raise ValueError("NSU reviewed academic unit count changed")
    return units

def normalized(value):
    return c(value or "").casefold().replace("ё", "е")

def unit_key(value):
    return re.sub(r"[\s–-]", "", normalized(value))

def join_key(code, profile, level, form):
    return tuple(normalized(p) for p in (code, profile, level, form))

def urfu_scope(doc, faculties):
    """Read the initial first-party program records without executing the inline script."""
    scripts = doc.xpath('//script[not(@src) and contains(text(),"programsMapped:[")]/text()')
    block = only(scripts, "UrFU portal course inventory").split("programsMapped:[", 1)[1].split("],streams:[", 1)[0]
    string = r'"(?:[^"\\]|\\.)*"'
    entries = re.split(r'(?=\{id:\d+,title:' + string + r',link:)', block)
    if len(entries) < 180:
        raise ValueError("UrFU portal course inventory changed")
    record = re.compile(
        rf'\{{id:(?P<id>\d+),title:(?P<profile>{string}),link:{string},levelCode:(?P<level>{string}),'
        rf'institute:\{{id:\d+,title:(?P<institute>{string})\}},branches:\[\],'
        rf'direction:\{{okso:(?P<code>{string}),title:(?P<title>{string})\}},forms:\[(?P<forms>.*?)\],tests:',
        re.S,
    )
    units = {unit_key(f["name"]) for f in faculties}
    levels = {
        "bac": "Высшее образование – бакалавриат",
        "spc": "Высшее образование – специалитет",
        "bvo": "Базовое высшее образование",
    }
    known = {}
    for entry in entries:
        match = record.match(entry)
        if not match:
            continue
        info = {key: json.loads(match[key]) for key in ("code", "profile", "level", "institute", "title")}
        if unit_key(info["institute"]) not in units or info["level"] not in levels:
            continue
        for form in re.findall(r'[{,]name:(' + string + ')', match["forms"]):
            form = json.loads(form)
            key = join_key(info["code"], info["profile"], levels[info["level"]], form)
            known.setdefault(key, []).append({**info, "portalProgramId": match["id"], "form": form})
    if len(known) < 170:
        raise ValueError("Too few unambiguous UrFU main-city matches")
    return known

def urfu_offerings(meta, doc, city_scope, portal_meta):
    section = "Информация о формах обучения, сроках обучения, о сроке действия государственной аккредитации, о языках, на которых осуществляется образование"
    table = only(doc.xpath('//table[./tbody/tr[@itemprop="eduAccred"]]'), "UrFU education form-and-duration table")
    header = [c(cell.text_content()) for cell in only(table.xpath('./thead/tr'), "UrFU education header").xpath('./th|./td')]
    if header[2] != "Образовательная программа" or header[6] != "Срок получения образования":
        raise ValueError("UrFU form-and-duration table columns changed")
    reviewed, scope_exclusions = [], []
    for row_index, row in enumerate(table.xpath('./tbody/tr[@itemprop="eduAccred"]'), 1):
        cells = row.xpath("./td")
        props = [cell.get("itemprop") for cell in cells]
        if len(cells) != 9 or props[:7] != ["eduCode", "eduName", None, "eduLevel", "eduForm", None, "learningTerm"]:
            raise ValueError(f"Unexpected UrFU row structure at {row_index}")
        values = dict(zip(["eduCode", "eduName", "eduProf", "eduLevel", "eduForm", "standard", "learningTerm"], [c(cell.text_content()) for cell in cells[:7]]))
        code, profile, level, form = (values[prop] for prop in ("eduCode", "eduProf", "eduLevel", "eduForm"))
        if not re.fullmatch(r"\d{2}\.(03|05)\.\d{2}", code):
            continue
        match = city_scope.get(join_key(code, profile, level, form), [])
        if not match or not any(normalized(values["eduName"]) == normalized(x["title"]) for x in match):
            scope_exclusions.append({"row": row_index, **values})
            continue
        loc = {"rowIndex": row_index, "section": section, "literalCells": values, "mainCityEvidence": match, "mainCitySource": provenance(portal_meta)}
        item = education.fact(URFU, values, meta, loc, issues, duration_header=header[6])
        if item:
            if re.fullmatch(r"\d+[.,]\d+\s+(?:год[а-я]*|лет)", item["duration"] or "", re.I):
                issues.append({"universitySlug": URFU, "kind": "offering_ambiguous_decimal_duration", "offeringId": item["id"], "literalDuration": item["duration"], "rowIndex": row_index, "sourceUrl": meta["url"]})
                item["duration"] = None
            reviewed.append((item, loc))
    return reviewed, scope_exclusions

def omit_urfu_personnel_conflict(rows, meta, doc):
    profile_key = join_key(
        "38.03.03", "Управление персоналом", "Высшее образование – бакалавриат", "Очно-заочная",
    )
    visible = c(" ".join(doc.xpath('//body//text()[not(ancestor::script) and not(ancestor::style)]')))
    evidence = "Институт: Уральский гуманитарный институт Уровень образования: Бакалавриат Год(ы) набора: 2020-2026 Форма и срок обучения: Очная: 4 года Язык обучения: Русский"
    if evidence not in visible or "Направление подготовки: 38.03.03 Управление персоналом" not in visible:
        raise ValueError("UrFU personnel-management detail requires renewed review")
    item, locator = only([
        pair for pair in rows
        if join_key(*(pair[0][key] for key in ("code", "profile", "level", "forms"))) == profile_key
    ], "UrFU personnel-management part-time entry")
    issues.append({
        "universitySlug": URFU,
        "kind": "offering_conflicting_form_excluded",
        "offeringId": item["id"],
        "overviewEvidence": locator,
        "programDetail": {"literalEvidence": evidence, **provenance(meta)},
    })
    return [pair for pair in rows if pair[0]["id"] != item["id"]]

def nsu_offerings(meta, doc, unit_names):
    reviewed = []
    wraps = doc.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," program-card-section-wrap ")]')
    for wrap in wraps:
        name = c(only(wrap.xpath('./*/a[@href][1]|./a[@href][1]'), "NSU educational section label").text_content())
        if name not in unit_names:
            continue
        for row_index, entry in enumerate(wrap.xpath('.//*[@itemprop="eduOp"]'), 1):
            info = only(entry.xpath('./*[1]'), "NSU educational card details")
            values = {}
            for node in info.xpath('.//*[@itemprop]'):
                key = node.get("itemprop")
                if key in education.PROPS:
                    if key in values:
                        raise ValueError(f"Repeated NSU property {name}/{row_index}/{key}")
                    values[key] = c(node.text_content())
            if not re.fullmatch(r"\d{2}\.(03|05)\.\d{2}", values.get("eduCode", "")):
                continue
            duration = info.xpath('./p[normalize-space(.)="Срок обучения"]/following-sibling::*[1][self::p]')
            if len(duration) > 1:
                raise ValueError(f"Multiple NSU durations {name}/{row_index}")
            values["learningTerm"] = c(duration[0].text_content()) if duration else ""
            ancestor = entry.xpath('ancestor::div[starts-with(@id,"prog_")][1]/@id')
            loc = {"section": name, "cardId": ancestor[0] if ancestor else None, "rowIndex": row_index, "literalCells": values}
            item = education.fact(NSU, values, meta, loc, issues, duration_header="Срок обучения")
            if item:
                reviewed.append((item, loc))
    return reviewed

def profiles(work):
    field_evidence = {}
    profile_data = []
    offering_evidence = {}
    exclusions = {}
    for slug in (URFU, NSU):
        meta, doc = document(work, slug, COMMON_URL[slug])
        fields, review = common_fields(slug, meta, doc)
        edu_meta, edu_doc = document(work, slug, EDUCATION_URL[slug])
        if slug == URFU:
            meta, doc = document(work, slug, ADMISSIONS_URL[slug])
            read_contacts(slug, fields, review, meta, doc, '//div[@class="ce-bodytext"][.//a[normalize-space(.)="priem@urfu.ru"]]', "+7 (343) 375-44-74", "priem@urfu.ru")
            meta, doc = document(work, slug, HOUSING_URL[slug])
            dorm = only(doc.xpath('//div[@class="ce-bodytext"][contains(.,"Поселение поступающих в 2026 году")]'), "UrFU housing announcement")
            text = literal(dorm)
            if "проводится жилищными комиссиями институтов" not in text or "в случае их наличия" not in text:
                raise ValueError("UrFU housing conditions require renewed review")
            review["hostelInfo"] = set_field(fields, "hostelInfo", "УрФУ предоставляет общежития. По информации о заселении на 2026 год, места распределяют жилищные комиссии институтов по графикам и при наличии свободных мест.", meta, text)
            meta, doc = document(work, slug, URFU_OVERVIEW)
            about = only(doc.xpath('//p[contains(.,"Создан федеральный вуз УрФУ")]'), "UrFU history")
            if "на базе УГТУ-УПИ и УрГУ" not in literal(about):
                raise ValueError("UrFU history requires renewed review")
            review["overview"] = set_field(fields, "overview", "УрФУ создан на базе Уральского государственного технического университета — УПИ и Уральского государственного университета. Новый кампус расположен в Новокольцовском районе Екатеринбурга.", meta, [literal(about), literal(only(doc.xpath('//p[contains(.,"Открыт новый кампус УрФУ")]'), "UrFU campus"))])
            meta, doc = document(work, slug, UNITS_URL[slug])
            faculties = urfu_faculties(meta, doc)
            portal_meta, portal_doc = document(work, slug, URFU_CAMPUS_SCOPE)
            rows, exclusions[slug] = urfu_offerings(edu_meta, edu_doc, urfu_scope(portal_doc, faculties), portal_meta)
            detail_meta, detail_doc = document(work, slug, URFU_PERSONNEL_PROGRAM)
            rows = omit_urfu_personnel_conflict(rows, detail_meta, detail_doc)
        else:
            meta, doc = document(work, slug, ADMISSIONS_URL[slug])
            read_contacts(slug, fields, review, meta, doc, '//div[@class="footer-item"][.//a[normalize-space(.)="priem@nsu.ru"]]', "+7 (383) 363-40-37", "priem@nsu.ru")
            meta, doc = document(work, slug, HOUSING_URL[slug])
            housing = literal(only(doc.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," content-bar ")]'), "NSU housing section"))
            start = housing.index("Все иногородние обучающиеся НГУ получают общежитие")
            end = housing.index("Заселение иногородних студентов 1 курса", start)
            if "при наличии свободных мест" not in housing[start:end]:
                raise ValueError("NSU housing conditions require renewed review")
            review["hostelInfo"] = set_field(fields, "hostelInfo", "По данным НГУ, общежитие предоставляется иногородним студентам на бюджетной и платной основе. Студенты из Бердска, Искитима, Краснообска и Кольцово могут заселиться при наличии свободных мест.", meta, housing[start:end].strip())
            meta, doc = document(work, slug, UNITS_URL[slug])
            faculties = nsu_faculties(meta, doc, edu_doc)
            rows = nsu_offerings(edu_meta, edu_doc, {f["name"] for f in faculties})
        offerings, offering_evidence[slug] = education.deduplicate(rows, slug, issues)
        if len(offerings) < 30 or len(fields) < 10:
            raise ValueError(f"Unexpectedly few reviewed facts: {slug}")
        profile_data.append({"universitySlug": slug, "fields": fields, "faculties": faculties, "offerings": offerings})
        field_evidence[slug] = review
    return profile_data, field_evidence, offering_evidence, exclusions

def report(data, field_evidence, offering_evidence, exclusions):
    totals = {
        p["universitySlug"]: {key: len(p[key]) for key in ("fields", "faculties", "offerings")}
        for p in data
    }
    review_counts = {}
    for issue in issues:
        kind = issue["kind"]
        review_counts[kind] = review_counts.get(kind, 0) + 1
    main_city_rows = {
        offering_id: {
            "educationTableRows": sorted({locator["rowIndex"] for locator in locators}),
            "admissionsPortalProgramIds": sorted({
                int(record["portalProgramId"])
                for locator in locators
                for record in locator["mainCityEvidence"]
            }),
        }
        for offering_id, locators in offering_evidence[URFU].items()
    }
    return {
        "batch": BATCH,
        "scope": SCOPE,
        "totals": totals,
        "sources": list(sources.values()),
        "fieldEvidence": field_evidence,
        "urfuMainCity": {
            "educationTable": EDUCATION_URL[URFU],
            "officialInstituteDirectory": UNITS_URL[URFU],
            "officialAdmissionsPortal": URFU_CAMPUS_SCOPE,
            "review": "Строка сохраняется при буквальном совпадении кода, названия направления, профиля, уровня и формы с программой подразделения Екатеринбурга. Записи с явной связью с филиалом, неполными значениями и без однозначной привязки пропущены.",
            "educationRowsWithoutExactMatch": len(exclusions[URFU]),
            "evidence": main_city_rows,
        },
        "nsuUnitScope": {
            "engineeringSchool": "Передовая инженерная школа",
            "sourceUrl": EDUCATION_URL[NSU],
            "sectionAnchor": "#collapse_16926",
            "note": "Раздел подтверждает реализацию высшего образования у подразделения по магистратуре. Магистерские записи остаются за пределами образовательного перечня этой партии.",
        },
        "issuesByKind": review_counts,
        "conflictingForms": [issue for issue in issues if issue["kind"] == "offering_conflicting_form_excluded"],
        "reproduction": f"python -X utf8 scripts/collect-regional-nov09-ural-nsu.py --output tmp/ural-nsu-replay-{BATCH}.json --report tmp/ural-nsu-replay-report-{BATCH}.json",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=WORK)
    parser.add_argument("--output", type=Path, default=OUT)
    parser.add_argument("--report", type=Path, default=REPORT)
    parser.add_argument("--collect", action="store_true", help="Fetch only missing official snapshots for the batch date")
    args = parser.parse_args()
    if args.collect:
        for slug, urls in TARGETS.items():
            for url in urls:
                meta = guard.fetch(args.cache_dir, slug, url)
                if meta.get("httpStatus") == "429":
                    raise SystemExit(f"Rate limit from {url}; collection stopped")
    data, field_evidence, offering_evidence, exclusions = profiles(args.cache_dir)
    candidate = {"checkedAt": max(s["checkedAt"] for s in sources.values()), "sourceYear": 2026, "scope": SCOPE, "profiles": data}
    guard.dump(args.output, candidate)
    receipt = report(data, field_evidence, offering_evidence, exclusions)
    guard.dump(args.report, receipt)
    print(receipt["totals"])
    print("UrFU not matched", receipt["urfuMainCity"]["educationRowsWithoutExactMatch"], "issues", receipt["issuesByKind"])


if __name__ == "__main__":
    main()

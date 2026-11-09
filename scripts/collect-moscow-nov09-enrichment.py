"""Replay the 9 November Moscow-priority review against frozen HTTPS evidence."""

import argparse
import hashlib
import importlib.util
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BATCH = "2026-11-09"
WORK = ROOT / "tmp/russia-research/moscow-priority-2026-11-09"
OUTPUT = ROOT / "data-sources/russia/moscow-priority-enrichment-2026-11-09.json"
SPEC = importlib.util.spec_from_file_location("education", Path(__file__).with_name("collect-regional-oct25-education.py"))
edu = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(edu)

MIPT_LANDING = "https://pk.mipt.ru/"
MIPT_CONTACTS = "https://pk.mipt.ru/schools/contacts/"
MPEI_EDUCATION = "https://www.mpei.ru/sveden/education/Pages/default.aspx?short=/sveden/education/eduaccred"
MEPHI_PROGRAMS = "https://admission.mephi.ru/admission/baccalaureate-and-specialty/education/programs"
SOURCES = {"mipt": [MIPT_LANDING, MIPT_CONTACTS], "mpei": [MPEI_EDUCATION], "mephi": [MEPHI_PROGRAMS]}
edu.guard.OFFICIAL_HOSTS = {slug: {f"{slug}.ru"} for slug in SOURCES}
edu.guard.BATCH = BATCH

# These names were cross-checked with the main-campus structure in the existing
# moscow-enrichment-2026-10-22 batch. Do not infer campus from the name alone.
MEPHI_MOSCOW_UNITS = {
    "Институт ядерной физики и технологий",
    "Институт лазерных и плазменных технологий",
    "Инженерно-физический институт биомедицины",
    "Институт нанотехнологий в электронике, спинтронике и фотонике",
    "Институт интеллектуальных кибернетических систем",
    "Институт физико-технических интеллектуальных систем",
    "Институт финансовых технологий и экономической безопасности",
    "Институт международных отношений",
    "Факультет бизнес–информатики и управления комплексными системами",
}


def literal(node):
    return edu.clean(" ".join(node.xpath('.//text()[not(ancestor::script) and not(ancestor::style)]')))


def one(nodes):
    if len(nodes) != 1:
        raise ValueError(f"Expected one reviewed node, got {len(nodes)}")
    return nodes[0]


def mipt_fields(landing, contacts):
    landing_meta, landing_page = landing
    contacts_meta, contacts_page = contacts
    title = literal(one(landing_page.xpath("//title")))
    if title != "Приёмная комиссия МФТИ":
        raise ValueError("Expected the official MFTI admissions landing page")
    address = "pk.bachelor@mipt.ru"
    phone = "+7 495 408-48-00"
    block = one(contacts_page.xpath('//div[@class="WordSection1"][p//a[@href="mailto:pk.bachelor@mipt.ru"]]'))
    office = edu.clean(block.text_content())
    contact_text = f"Центральная приемная комиссия Телефон: {phone} Почта (базовое высшее образование) : {address}"
    if contact_text not in office or literal(one(block.xpath('.//a[@href="mailto:pk.bachelor@mipt.ru"]'))) != address:
        raise ValueError("Central commission phone and base-degree email must agree with reviewed text and link")
    return {
        key: {"value": value, **edu.provenance(meta), "sourceYear": 2026}
        for key, value, meta in [("admissionsUrl", landing_meta["url"], landing_meta), ("admissionsPhone", phone, contacts_meta), ("admissionsEmail", address, contacts_meta)]
    }, {"admissionsUrl": title, "admissionsPhone": contact_text, "admissionsEmail": contact_text}


def mpei_offerings(meta, page, issues):
    if not page.xpath('//body//text()[contains(.,"111250, Россия, г. Москва")]'):
        raise ValueError("Expected the main Moscow MPEI website")
    rows = []
    for section in ["Программы бакалавриата", "Программы специалитета"]:
        table = one(page.xpath('//*[@id="vikon-content"]/h3[normalize-space()=$section]/following-sibling::*[1][@class="vikon-responsive-table"]/table', section=section))
        for index, row in enumerate(table.xpath('.//tr[@itemprop="eduAccred"]'), 1):
            # MPEI repeats complete literal cells even when they have rowspan.
            # Expanding spans corrupts the association of code/title and profile.
            values = {
                prop: literal(one(row.xpath('./td[@itemprop=$prop]', prop=prop)))
                for prop in ("eduCode", "eduName", "eduProf", "eduLevel", "eduForm", "learningTerm")
            }
            locator = {"section": section, "rowIndex": index, "literalCells": values}
            item = edu.fact("mpei", values, meta, locator, issues)
            if item:
                rows.append((item, locator))
    offerings, evidence = edu.deduplicate(rows, "mpei", issues)
    return offerings, {key: [row["rowIndex"] for row in locators] for key, locators in evidence.items()}


def mephi_offerings(meta, page, issues):
    breadcrumb = literal(one(page.xpath('//*[@id="breadcrumbs"]')))
    if "Прием 2026" not in breadcrumb:
        raise ValueError("Expected a source explicitly dated to the 2026 intake")
    rows, evidence = {}, []
    for degree, level, code_level in [("bachelor", "Бакалавриат", "03"), ("specialist", "Специалитет", "05")]:
        section = one(page.xpath('//*[@id="contentb"]//*[@data-degree=$degree]', degree=degree))
        if literal(one(section.xpath('./h2'))) != level:
            raise ValueError("Degree section heading does not match the reviewed level")
        for card in section.xpath('.//div[@class="program-card"]'):
            code = literal(one(card.xpath('./div/span[@class="program-code"]')))
            if not re.fullmatch(rf"\d{{2}}\.{code_level}\.\d{{2}}", code):
                raise ValueError(f"Unexpected MEPhI program code: {code}")
            title = literal(one(card.xpath('./div/h3[@class="program-title"]')))
            note = edu.clean(" ".join(map(literal, card.xpath('./div/div[@class="notes"]'))))
            for unit in card.xpath('./div[@class="institute-group"]'):
                institute = literal(one(unit.xpath('./h4[@class="institute-name"]')))
                for profile in unit.xpath('./div[@class="profile-item"]'):
                    name = literal(one(profile.xpath('./*[@class="profile-name"]')))
                    locator = {"section": level, "code": code, "title": title, "unit": institute, "profile": name, "programNote": note or None}
                    if institute not in MEPHI_MOSCOW_UNITS or (note and "также" not in note) or re.search(r"совместно|обнинск|obninsk|филиал", literal(profile), re.I):
                        issues.append({"universitySlug": "mephi", "kind": "offering_campus_scope_excluded", **edu.provenance(meta), "sourceYear": 2026, **locator})
                        continue
                    identity = hashlib.sha256("|".join([code, title, name, level]).encode()).hexdigest()[:16]
                    key = f"mephi-official-{identity}"
                    rows[key] = {"id": key, "code": code, "title": title, "profile": name, "level": level, "forms": None, "duration": None, "admissionsStatus": "pending_review", **edu.provenance(meta), "sourceYear": 2026, "sourceSection": f"{level}, перечень приёма 2026"}
                    evidence.append({"offeringId": key, "unit": institute})
    return list(rows.values()), {"breadcrumb": breadcrumb, "rows": evidence}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collect", action="store_true")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    if args.collect:
        for slug, urls in SOURCES.items():
            for url in urls:
                edu.fetch(WORK, slug, url)
    source_docs = {url: edu.evidence(WORK, slug, url) for slug, urls in SOURCES.items() for url in urls}
    issues = []
    fields, mipt_evidence = mipt_fields(source_docs[MIPT_LANDING], source_docs[MIPT_CONTACTS])
    mpei, mpei_evidence = mpei_offerings(*source_docs[MPEI_EDUCATION], issues)
    mephi, mephi_evidence = mephi_offerings(*source_docs[MEPHI_PROGRAMS], issues)
    if not (mpei and mephi):
        raise ValueError("Expected nonempty offerings from the reviewed sources")
    profiles = [
        {"universitySlug": "mipt", "fields": fields, "faculties": [], "offerings": []},
        {"universitySlug": "mpei", "fields": {}, "faculties": [], "offerings": mpei},
        {"universitySlug": "mephi", "fields": {}, "faculties": [], "offerings": mephi},
    ]
    attempts = [source_docs[url][0] for urls in SOURCES.values() for url in urls]
    edu.dump(args.output, {"profiles": profiles, "sources": attempts, "issues": issues,
        "evidence": {"mipt": mipt_evidence, "mpei": mpei_evidence, "mephi": mephi_evidence},
        "summary": {"batch": BATCH, "fields": len(fields), "listings": {"mpei": len(mpei), "mephi": len(mephi)}, "scope": "Directory-only. No competitive admissions groups, current license, or accreditation facts are added.",
            "reviewLimitations": [
                {"universitySlug": "mai", "urls": ["https://mai.ru/sveden/struct/", "https://institutes.mai.ru/?blind=Y", "https://mai.ru/sveden/education/obrazovanie_1/"], "reason": "TLS certificate validation failed with SEC_E_UNTRUSTED_ROOT on the attempted official sources. The verification policy was retained."},
                {"universitySlug": "mipt", "url": "https://pk.mipt.ru/contacts/", "reason": "The main contact block displayed the base-degree address but its mailto targeted a different address. The central commission block on /schools/contacts/ has matching text and mailto and supplies both contact fields."},
                {"universitySlug": "mpei", "reason": "The SharePoint table repeats literal code and name cells even where rowspan is present. Read direct row microdata. The bachelor's form and duration refer to implementation, and the intake year is unknown."},
                {"universitySlug": "mephi", "reason": "The commission's 2026 list establishes profile names and levels. Campuses were checked against the existing Moscow structure; joint or ambiguous listings were excluded. Forms and durations are unknown here."},
            ], "evidenceDirectory": WORK.relative_to(ROOT).as_posix(), "replay": "python -X utf8 scripts/collect-moscow-nov09-enrichment.py --output tmp/moscow-nov09-replay.json"}})
    print(f"{len(fields)} MFTI fields, {len(mpei)} MPEI listings, {len(mephi)} MEPhI listings")


if __name__ == "__main__":
    main()

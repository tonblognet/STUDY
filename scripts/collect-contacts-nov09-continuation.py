"""Replay a gap-only regional admission-office and housing batch from official snapshots."""

import argparse
import concurrent.futures
import hashlib
import importlib.util
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BATCH = "2026-11-09"
WORK = ROOT / "tmp/russia-research/continuation-contacts-2026-11-09"
OUTPUT = ROOT / f"data-sources/russia/continuation-contacts-{BATCH}.json"
REPORT = ROOT / f"data-sources/russia/continuation-contacts-collection-report-{BATCH}.json"
HOSTEL_NOTE = " Это описание опубликованных условий, а не подтверждение наличия свободного места или гарантия заселения."

spec = importlib.util.spec_from_file_location("continuation_contacts_guard", ROOT / "scripts/collect-contacts-enrichment.py")
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
guard.BATCH = BATCH
guard.OFFICIAL_HOSTS = {
    "russia-1601": {"klgtu.ru"}, "russia-83": {"isu.ru"},
    "russia-12": {"bgu.ru"}, "russia-258": {"sgu.ru"},
    "russia-11": {"asu-edu.ru"}, "russia-342": {"uniyar.ac.ru"},
    "russia-341": {"ystu.ru"}, "russia-199": {"petrsu.ru"},
}


def reviewed(slug, key, url, xpath, evidence, value, context):
    return {"universitySlug": slug, "field": key, "requestedUrl": url,
            "xpath": xpath, "evidence": evidence, "value": value, "context": context}


REVIEWED = [
    reviewed("russia-1601", "admissionsUrl", "https://klgtu.ru/abitur/contacts/", '//h1', "Абитуриентам 2026", None, "admissions-page"),
    reviewed("russia-1601", "admissionsPhone", "https://klgtu.ru/abitur/contacts/", '/html/body/main/section[7]/div[2]/div[2]/div[3]', "+7 (4012) 99-59-99", "+7 (4012) 99-59-99", "admissions-office"),
    reviewed("russia-1601", "admissionsEmail", "https://klgtu.ru/abitur/contacts/", '/html/body/main/section[7]/div[2]/div[2]/div[3]', "pk@klgtu.ru", "pk@klgtu.ru", "admissions-office"),
    reviewed("russia-1601", "hostelInfo", "https://klgtu.ru/divisions/studencheskiy_gorodok/", '/html/body/main/section[2]/div/div[2]/div/p[5]', "При заселении в общежитие обучающиеся должны быть ознакомлены с Положением о Студенческом городке, Правилами проживания в общежитии и пройти соответствующие инструктажи по пожарной безопасности, технике безопасности при эксплуатации электробытовых приборов и др.", "При заселении в общежитие обучающиеся должны быть ознакомлены с Положением о Студенческом городке, Правилами проживания в общежитии и пройти соответствующие инструктажи по пожарной безопасности, технике безопасности при эксплуатации электробытовых приборов и др.", "housing-description"),
    reviewed("russia-12", "admissionsUrl", "https://bgu.ru/abitur/address.aspx", '//head/title', "БГУ: Адреса приема документов и режим работы приемной комиссии", None, "admissions-page"),
    reviewed("russia-12", "admissionsPhone", "https://bgu.ru/abitur/address.aspx", '/html/body/form/div/div[2]', "Телефон: +7 (3952) 500-005 (многоканальный)", "+7 (3952) 500-005", "admissions-office"),
    reviewed("russia-12", "admissionsEmail", "https://bgu.ru/abitur/address.aspx", '/html/body/form/div/div[2]', "Электронная почта: priem@bgu.ru", "priem@bgu.ru", "admissions-office"),
    reviewed("russia-12", "hostelInfo", "https://bgu.ru/abitur/hostel.aspx", '/html/body/form/div/p[3]', "Абитуриентам, зачисленным на 1 курс (заочная форма обучения) места предоставляются на период сессии при наличии свободных, за исключением лиц, проживающих в городах Иркутск, Ангарск, Шелехов.", "Абитуриентам, зачисленным на 1 курс (заочная форма обучения) места предоставляются на период сессии при наличии свободных, за исключением лиц, проживающих в городах Иркутск, Ангарск, Шелехов.", "housing-description"),
    reviewed("russia-83", "admissionsUrl", "https://isu.ru/Abitur/pk2026/main/", '//head/title', "Приемная кампания 2026", None, "admissions-page"),
    reviewed("russia-258", "admissionsUrl", "https://www.sgu.ru/node/235357", '//head/title', "Адреса приемных комиссий", None, "admissions-page"),
    reviewed("russia-258", "admissionsPhone", "https://www.sgu.ru/node/235357", '/html/body/div/footer/section[1]/div/div/div[1]/div[3]', "Отдел по организации приёма на основные образовательные программы (Центральная приёмная комиссия): +7 (8452) 51 - 92 - 26, cpk@sgu.ru", "+7 (8452) 51 - 92 - 26", "admissions-office"),
    reviewed("russia-258", "admissionsEmail", "https://www.sgu.ru/node/235357", '/html/body/div/footer/section[1]/div/div/div[1]/div[3]', "Отдел по организации приёма на основные образовательные программы (Центральная приёмная комиссия): +7 (8452) 51 - 92 - 26, cpk@sgu.ru", "cpk@sgu.ru", "admissions-office"),
    reviewed("russia-258", "hostelInfo", "https://www.sgu.ru/obschezhitiya-i-predostavlenie-mest", '/html/body/div/main/div[3]/div[2]/section[2]/div[1]/p[3]', "ВАЖНО! По вопросам заселения иногородних поступающих в общежития университета следует обращаться в приёмные комиссии учебных подразделений университета при подаче документов для поступления.", "По вопросам заселения иногородних поступающих в общежития университета следует обращаться в приёмные комиссии учебных подразделений университета при подаче документов для поступления.", "housing-description"),
    reviewed("russia-11", "admissionsUrl", "https://asu-edu.ru/departments/147-upravlenie-dovuzovskogo-obrazovaniia-i-organizacii-priema-abiturientov.html", '//head/title', "Управление довузовского образования и организации приема абитуриентов", None, "admissions-page"),
    reviewed("russia-11", "admissionsPhone", "https://asu-edu.ru/universitet/12465-contacti.html", '/html/body/div/div[4]/div[2]/div[1]/div[2]/div/div/div[1]/div[1]', "Приёмная комиссия Телефоны: +7 (8512) 24-64-37, +7 (8512) 24-64-09 (только по вопросам поступления)", "+7 (8512) 24-64-37; +7 (8512) 24-64-09", "admissions-office"),
    reviewed("russia-11", "admissionsEmail", "https://asu-edu.ru/universitet/12465-contacti.html", '/html/body/div/div[4]/div[2]/div[1]/div[2]/div/div/div[1]/div[1]', "E-mail: priem@asu-edu.ru", "priem@asu-edu.ru", "admissions-office"),
    reviewed("russia-342", "admissionsUrl", "https://www.uniyar.ac.ru/Abitur/", '//head/title', "Абитуриенту", None, "admissions-page"),
    reviewed("russia-342", "admissionsPhone", "https://www.uniyar.ac.ru/Abitur/", '/html/body/div[1]/div[3]/div/div[1]/div[4]/div/div/div/div/p[3]', "Телефоны для связи: 8 (4852) 78-85-32 и 8 (4852) 78-85-33.", "8 (4852) 78-85-32; 8 (4852) 78-85-33", "admissions-office"),
    reviewed("russia-342", "admissionsEmail", "https://www.uniyar.ac.ru/Abitur/", '/html/body/div[1]/div[3]/div/div[1]/div[4]/div/div/div/div/p[3]', "e-mail: abitur@uniyar.ac.ru priem@uniyar.ac.ru", "abitur@uniyar.ac.ru; priem@uniyar.ac.ru", "admissions-office"),
    reviewed("russia-341", "admissionsUrl", "https://ystu.ru/university/pordrazdelenia/sluzhby-i-otdely/priemnaya-komissiya/", '//head/title', "Приемная комиссия", None, "admissions-page"),
    reviewed("russia-199", "hostelInfo", "https://petrsu.ru/page/education/bakalavriat_i_spec/rules/hostel", '/html/body/div[2]/div/div[1]/div[1]/div/div[2]/p[5]', 'Предоставление места в общежитии иногородним студентам после зачисления осуществляется на основании личного заявления, поданного на портале "Цифровое пространство студента ПетрГУ".', 'Предоставление места в общежитии иногородним студентам после зачисления осуществляется на основании личного заявления, поданного на портале "Цифровое пространство студента ПетрГУ".', "housing-description"),
]

TARGETS = {slug: sorted({r["requestedUrl"] for r in REVIEWED if r["universitySlug"] == slug}) for slug in guard.OFFICIAL_HOSTS}


def freeze_baseline(work, baseline_path):
    destination = work / "baseline.json"
    if destination.exists():
        return json.loads(destination.read_text(encoding="utf-8"))
    raw = baseline_path.read_bytes()
    snapshot = json.loads(raw)
    baseline = {
        "runtimeSnapshotSha256": hashlib.sha256(raw).hexdigest(),
        "fields": {p["universitySlug"]: p["fields"] for p in snapshot["directoryDetails"] if p["universitySlug"] in TARGETS},
    }
    if set(baseline["fields"]) != set(TARGETS):
        raise ValueError("Incomplete runtime gap baseline")
    guard.dump(destination, baseline)
    return baseline


def validate_review(row, tree, meta):
    contact = row["field"] in {"admissionsPhone", "admissionsEmail"}
    if contact and row["context"] != "admissions-office":
        raise ValueError("Admission contact lacks reviewed central-office context")
    selected = tree.xpath(row["xpath"])
    if not selected:
        raise ValueError("Reviewed selector no longer matches")
    clean = lambda value: re.sub(r"\s+([,.;:!?])", r"\1", guard.clean(value))
    literal = clean(" ".join(" ".join(n.itertext()) for n in selected))
    if clean(row["evidence"]) not in literal:
        raise ValueError("Reviewed literal evidence missing: " + row["universitySlug"] + "/" + row["field"])
    if row["field"] == "admissionsUrl":
        if row["context"] != "admissions-page":
            raise ValueError("Admissions URL lacks page context")
        return meta["url"], literal
    parts = row["value"].split("; ")
    if any(clean(part) not in clean(row["evidence"]) for part in parts):
        raise ValueError("Value is not present in reviewed evidence")
    if row["field"] == "admissionsEmail" and any(part.endswith("@minobrnauki.gov.ru") for part in parts):
        raise ValueError("Ministry contact is not a university admission contact")
    return row["value"] + (HOSTEL_NOTE if row["field"] == "hostelInfo" else ""), literal


def build(work, baseline):
    profiles, reviews, sources = {}, [], {}
    for row in REVIEWED:
        slug, key = row["universitySlug"], row["field"]
        if key in baseline["fields"][slug]:
            raise ValueError("Attempt to overwrite baseline field: " + slug + "/" + key)
        meta, tree = guard.load_evidence(work, slug, row["requestedUrl"])
        value, literal = validate_review(row, tree, meta)
        sources[row["requestedUrl"]] = meta
        p = profiles.setdefault(slug, {"universitySlug": slug, "fields": {}, "faculties": [], "offerings": []})
        if key in p["fields"]:
            raise ValueError("Duplicate field")
        p["fields"][key] = {"value": value, "sourceUrl": meta["url"], "sourceYear": 2026,
                            "checkedAt": meta["checkedAt"], "sourceSha256": meta["sourceSha256"]}
        reviews.append({**row, "publishedValue": value, "literalEvidence": literal, "sourceUrl": meta["url"]})
    attempts = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(work.glob("*/*.meta.json"))]
    summary = {"batch": BATCH, "profiles": len(profiles), "newFields": sum(len(p["fields"]) for p in profiles.values()),
               "scope": "Gap-only admission-office URLs/contacts and published housing conditions. Existing values are preserved. Housing does not confirm availability or guarantee placement.",
               "baselineFieldKeys": {slug: sorted(fields) for slug, fields in baseline["fields"].items()},
               "runtimeSnapshotSha256": baseline["runtimeSnapshotSha256"]}
    candidate = {"sourceYear": 2026, "profiles": list(profiles.values()), "summary": summary}
    report = {"summary": summary, "sources": list(sources.values()), "attempts": attempts, "reviews": reviews,
              "issues": [
                  {"universitySlug": "russia-258", "reason": "The in-page unified commission hotline 210-500 is explicitly limited to seasonal office hours. The year-round central admission-office block (+7 (8452) 51 - 92 - 26, cpk@sgu.ru) is used instead. The housing total also includes Balashov and is excluded from the Saratov card."},
                  {"universitySlug": "russia-342", "reason": "Only the central applicant contact block is used; faculty technical commissions, contract department, and university college contacts are excluded. Both centrally published email addresses are preserved."},
                  {"universitySlug": "russia-12", "reason": "The retained housing sentence applies specifically to part-time students during sessions, with explicit availability and city restrictions. Numbers of beds and first-year allocations are excluded."},
                  {"universitySlug": "russia-11", "reason": "The checked contact page is marked last-edited 2024-06-03, while the same central phone is still published in its current site navigation. checkedAt records observation on 2026-11-09 and does not imply a new admissions campaign. The housing page timed out; no housing fact inferred."},
                  {"universitySlug": "russia-83", "reason": "The old admissions route redirects through inline JavaScript. The directly fetched official 2026 campaign page supplies the URL. Existing phones and emails are preserved; complex campus description not added."},
                  {"universitySlug": "russia-199", "reason": "Only the published requirement for a personal housing application after admission is reproduced. 2026 bed allocations, past August settlement dates, tariffs and placement guarantees are excluded."},
              ]}
    return candidate, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collect", action="store_true")
    parser.add_argument("--work-dir", type=Path, default=WORK)
    parser.add_argument("--baseline", type=Path, default=ROOT / "tmp/russia-before-nov09-continuation.json")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--report", type=Path, default=REPORT)
    args = parser.parse_args()
    baseline = freeze_baseline(args.work_dir, args.baseline)
    if args.collect:
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            results = [pool.submit(guard.fetch, args.work_dir, slug, url) for slug, urls in TARGETS.items() for url in urls]
            for result in concurrent.futures.as_completed(results):
                meta = result.result()
                print(json.dumps({k: meta.get(k) for k in ["universitySlug", "requestedUrl", "httpStatus", "error"]}))
    candidate, report = build(args.work_dir, baseline)
    guard.dump(args.output, candidate)
    guard.dump(args.report, report)
    print(json.dumps(candidate["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()

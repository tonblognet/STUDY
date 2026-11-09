"""Replay four regional cards' missing admission contacts and housing descriptions."""

import argparse
import concurrent.futures
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BATCH = "2026-11-09"
WORK = ROOT / "tmp/russia-research/followup-contacts-2026-11-09"
OUTPUT = ROOT / f"data-sources/russia/followup-contacts-{BATCH}.json"
REPORT = ROOT / f"data-sources/russia/followup-contacts-collection-report-{BATCH}.json"

spec = importlib.util.spec_from_file_location("followup_contact_review", ROOT / "scripts/collect-contacts-nov09-continuation.py")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
guard = base.guard
guard.OFFICIAL_HOSTS = {
    "russia-305": {"ulstu.ru"}, "russia-306": {"ulsu.ru"},
    "russia-36": {"volsu.ru"}, "russia-117": {"stu.lipetsk.ru"},
}
reviewed = base.reviewed

REVIEWED = [
    reviewed("russia-305", "admissionsUrl", "https://ulstu.ru/abitur/", "//head/title", "Поступающему", None, "admissions-page"),
    reviewed("russia-305", "admissionsPhone", "https://ulstu.ru/abitur/common/contacts/", '//main//p[contains(.,"Приемная комиссия УлГТУ расположена")]', "Номера телефона: +7 (8422) 43-05-05, +7 (960) 375-64-60", "+7 (8422) 43-05-05; +7 (960) 375-64-60", "admissions-office"),
    reviewed("russia-305", "admissionsEmail", "https://ulstu.ru/abitur/common/contacts/", '//main//p[contains(.,"Приемная комиссия УлГТУ расположена")]', "Адрес электронной почты: pk@ulstu.ru", "pk@ulstu.ru", "admissions-office"),
    reviewed("russia-305", "hostelInfo", "https://ulstu.ru/for_student/dormitories/", '//main//p[contains(.,"Лицам, зарегистрированным вне")]', "Лицам, зарегистрированным вне г.Ульяновска и нуждающимся в общежитии, таковое может быть предоставлено.", "Лицам, зарегистрированным вне г.Ульяновска и нуждающимся в общежитии, таковое может быть предоставлено.", "housing-description"),
    reviewed("russia-306", "admissionsUrl", "https://abiturient.ulsu.ru/", "//head/title", "Абитуриент 2026", None, "admissions-page"),
    reviewed("russia-306", "admissionsPhone", "https://ulsu.ru/ru/sveden/struct/0b71dbab-f201-11de-8bdd-001a92e75bb4/", '/html/body/div[2]/main/div[2]/div[2]/div', "Телефон: (8422) 41-20-90", "(8422) 41-20-90", "admissions-office"),
    reviewed("russia-306", "admissionsEmail", "https://ulsu.ru/ru/sveden/struct/0b71dbab-f201-11de-8bdd-001a92e75bb4/", '/html/body/div[2]/main/div[2]/div[2]/div', "E-mail: pk@ulsu.ru", "pk@ulsu.ru", "admissions-office"),
    reviewed("russia-36", "admissionsUrl", "https://volsu.ru/Abitur/", "//head/title", "Раздел абитуриенту", None, "admissions-page"),
    reviewed("russia-36", "admissionsPhone", "https://volsu.ru/Abitur/feedback/", '//form/p[2]', "Задать вопросы Вы так же можете по телефону справочно-информационной службы Волгоградского государственного университета: (8442) 40-55-47 или по электронному адресу: priem@volsu.ru", "(8442) 40-55-47", "admissions-office"),
    reviewed("russia-36", "admissionsEmail", "https://volsu.ru/Abitur/feedback/", '//form/p[2]', "Задать вопросы Вы так же можете по телефону справочно-информационной службы Волгоградского государственного университета: (8442) 40-55-47 или по электронному адресу: priem@volsu.ru", "priem@volsu.ru", "admissions-office"),
    reviewed("russia-36", "hostelInfo", "https://volsu.ru/struct/generalservices/obshchezhitie/", '//p[contains(.,"В общежитии могут проживать как одинокие обучающиеся")]', "В пределах имеющегося жилищного фонда для семейных обучающихся выделяются изолированные жилые помещения в соответствии с локальными нормативными актами и требованиями жилищного законодательства.", "В пределах имеющегося жилищного фонда для семейных обучающихся выделяются изолированные жилые помещения в соответствии с локальными нормативными актами и требованиями жилищного законодательства.", "housing-description"),
    reviewed("russia-117", "admissionsUrl", "https://www.stu.lipetsk.ru/abit/", "//head/title", "Абитуриенту - ЛГТУ", None, "admissions-page"),
    reviewed("russia-117", "admissionsPhone", "https://www.stu.lipetsk.ru/abit/", '/html/body/div[2]/main/section[2]/div/section[4]/div[2]/div[1]/p[3]', "Ответственный секретарь: +7 (4742) 328-223", "+7 (4742) 328-223", "admissions-office"),
    reviewed("russia-117", "hostelInfo", "https://www.stu.lipetsk.ru/struct/management/rectorat/pro-vos/sub/uvsr/sub/hostel/", '/html/body/div[2]/main/section[2]/div/div/div/p[1]', "ЛГТУ располагает благоустроенным общежитием. Иногородние студенты при наличии соответствующего жилищного фонда обеспечиваются местами в общежитии ЛГТУ.", "ЛГТУ располагает благоустроенным общежитием. Иногородние студенты при наличии соответствующего жилищного фонда обеспечиваются местами в общежитии ЛГТУ.", "housing-description"),
]

TARGETS = {slug: sorted({r["requestedUrl"] for r in REVIEWED if r["universitySlug"] == slug}) for slug in guard.OFFICIAL_HOSTS}
base.TARGETS = TARGETS

ISSUES = [
    {"universitySlug": "russia-117", "reason": "The central admission secretary's phone is kept with its explicit role. Only institute/college/lyceum and Ministry emails appear in the admission page; none is promoted to the central admission email. The central email remains unknown."},
    {"universitySlug": "russia-305", "reason": "The selected central commission paragraph precedes IATU and faculty contract-contact blocks; those contacts are excluded. Housing explicitly says it may be provided to people registered outside Ulyanovsk; it is not a placement guarantee. Published tariffs and room allocations are excluded."},
    {"universitySlug": "russia-306", "reason": "The Secretariat of the admission commission supplies its own phone and email, separately from general-office contact@ulsu.ru and Ministry hotlines. Housing conditions have not been reviewed and remain unknown."},
    {"universitySlug": "russia-36", "reason": "The applicant question-and-answer service supplies the phone and email, distinct from the rector's office and general office. Housing text preserves the existing-housing-stock condition for student families. Seasonal applicant housing tariffs and deadlines are excluded."},
]


def validate_review(row, tree, meta):
    if len(tree.xpath(row["xpath"])) != 1:
        raise ValueError("Reviewed source needs exactly one unambiguous block")
    return base.validate_review(row, tree, meta)


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
        p["fields"][key] = {"value": value, "sourceUrl": meta["url"], "sourceYear": 2026, "checkedAt": meta["checkedAt"], "sourceSha256": meta["sourceSha256"]}
        reviews.append({**row, "publishedValue": value, "literalEvidence": literal, "resolvedXPath": tree.getroottree().getpath(tree.xpath(row["xpath"])[0]), "sourceUrl": meta["url"]})
    summary = {"batch": BATCH, "profiles": len(profiles), "newFields": sum(len(p["fields"]) for p in profiles.values()),
               "scope": "Gap-only central admission contacts and published housing conditions for UlSTU, UlSU, VolSU and LSTU. No fees, exams, places, deadlines or admission programs added.",
               "baselineFieldKeys": {slug: sorted(fields) for slug, fields in baseline["fields"].items()}, "runtimeSnapshotSha256": baseline["runtimeSnapshotSha256"]}
    candidate = {"sourceYear": 2026, "profiles": list(profiles.values()), "summary": summary}
    report = {"summary": summary, "baseline": baseline, "workDirectory": work.relative_to(ROOT).as_posix(), "sources": list(sources.values()),
              "attempts": [json.loads(p.read_text(encoding="utf-8")) for p in sorted(work.glob("*/*.meta.json"))], "reviews": reviews, "issues": ISSUES}
    return candidate, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collect", action="store_true")
    parser.add_argument("--work-dir", type=Path, default=WORK)
    parser.add_argument("--baseline", type=Path, default=ROOT / "tmp/russia-before-nov09-followup.json")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--report", type=Path, default=REPORT)
    args = parser.parse_args()
    baseline = base.freeze_baseline(args.work_dir, args.baseline)
    if args.collect:
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            futures = [pool.submit(guard.fetch, args.work_dir, slug, url) for slug, urls in TARGETS.items() for url in urls]
            for result in concurrent.futures.as_completed(futures):
                m = result.result()
                print(json.dumps({k: m.get(k) for k in ["universitySlug", "requestedUrl", "httpStatus", "error"]}))
    candidate, report = build(args.work_dir, baseline)
    guard.dump(args.output, candidate)
    guard.dump(args.report, report)
    print(json.dumps(candidate["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()

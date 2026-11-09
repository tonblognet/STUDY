"""Reviewed, gap-only contacts batch; frozen HTTP evidence supports offline replay.

No admissions facts are inferred from a website-wide footer. Every field requires
an explicit source association and a manually reviewed local text fragment.
"""
import argparse
import concurrent.futures
import hashlib
import ipaddress
import json
import re
import socket
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from lxml import html

ROOT = Path(__file__).resolve().parents[1]
BATCH = "2026-10-22"
SLUGS = ("mfua", "pushkin", "moscow-110266", "guu", "russia-292", "russia-1715", "russia-1763", "russia-28")
TARGETS = {
    "mfua": ["https://www.mfua.ru/abiturientu/", "https://www.mfua.ru/sveden/struct/", "https://www.mfua.ru/features/obshchezhitie/"],
    "moscow-110266": ["https://imeit.ru/abitur/", "https://imeit.ru/abitur/bachelor"],
    "guu": ["https://guu.ru/abiturguu/"],
    "russia-292": ["https://tsuab.ru/departments/admissionCommittee"],
    "russia-1715": ["https://www.stu.ru/abiturient/", "https://www.stu.ru/abiturient/index.php?page=3673", "https://www.stu.ru/abiturient/index.php?page=2239"],
    "russia-1763": ["https://www.ssuwt.ru/abitur/"],
    "russia-28": ["https://www.vvsu.ru/admission/"],
}
OFFICIAL_HOSTS = {slug: {urlparse(url).hostname.removeprefix("www.") for url in urls} for slug, urls in TARGETS.items()}
MAX_REDIRECTS = 5
HOSTEL_NOTE = " Наличие свободных мест и предоставление места требуют отдельного подтверждения."


def reviewed(slug, field, url, xpath, evidence, value, context):
    return {"universitySlug": slug, "field": field, "url": url, "xpath": xpath, "evidence": evidence, "value": value, "context": context}


# All associations were manually reviewed against this batch's saved body.
# XPath restricts contacts to the university commission's own content block.
REVIEWED = [
    reviewed("mfua", "hostelInfo", "https://www.mfua.ru/features/obshchezhitie/", "//body", "Общежитие расположено по адресу: г. Москва, ул. Большая Черемушкинская, д. 17А, стр. 6. Условия проживания предусматривают размещение в четырёхместных комнатах, в каждом жилом блоке есть санузел и душ. На каждом этаже оборудована кухня.", "Общежитие расположено по адресу: г. Москва, ул. Большая Черемушкинская, д. 17А, стр. 6. Условия проживания предусматривают размещение в четырёхместных комнатах, в каждом жилом блоке есть санузел и душ. На каждом этаже оборудована кухня." + HOSTEL_NOTE, "hostel-description"),
    reviewed("moscow-110266", "admissionsPhone", "https://imeit.ru/abitur/bachelor", '//tr[td[contains(., "Приемная комиссия")]]', "Приемная комиссия 105318, г. Москва,, ул. Ибрагимова, дом 31, корпус 1 +7 495 795 00 10, доб. 1", "+7 495 795 00 10, доб. 1", "admissions-office"),
    reviewed("guu", "telephone", "https://guu.ru/abiturguu/", '//a[@href="tel:84953778914"]/..', "8 (495) 377-89-14", "8 (495) 377-89-14", "university-general"),
    reviewed("guu", "admissionsPhone", "https://guu.ru/abiturguu/", '/html/body/div[1]/div[2]/div[2]/div', "Контакты приемной комиссии ГУУ Телефон: 8 (495) 371-00-55 Электронная почта: priem@guu.ru", "8 (495) 371-00-55", "admissions-office"),
    reviewed("guu", "admissionsEmail", "https://guu.ru/abiturguu/", '/html/body/div[1]/div[2]/div[2]/div', "Контакты приемной комиссии ГУУ Телефон: 8 (495) 371-00-55 Электронная почта: priem@guu.ru", "priem@guu.ru", "admissions-office"),
    reviewed("russia-292", "admissionsPhone", "https://tsuab.ru/departments/admissionCommittee", '/html/body/div[2]/div[1]/div[3]/div[2]/div[3]/div/div[4]/div[5]/div[2]', "Телефон приемной комиссии: +7 (3822) 90-33-06. E-mail приемной комиссии: pk@tsuab.ru", "+7 (3822) 90-33-06", "admissions-office"),
    reviewed("russia-292", "admissionsEmail", "https://tsuab.ru/departments/admissionCommittee", '/html/body/div[2]/div[1]/div[3]/div[2]/div[3]/div/div[4]/div[5]/div[2]', "Телефон приемной комиссии: +7 (3822) 90-33-06. E-mail приемной комиссии: pk@tsuab.ru", "pk@tsuab.ru", "admissions-office"),
    reviewed("russia-1715", "admissionsPhone", "https://www.stu.ru/abiturient/", '/html/body/div[7]/div/div/div/div/main/div[7]/div[3]/div[1]/div/div/div[1]/div[2]', "Приемная комиссия Телефоны: +7-383-328-05-85 , 8-993-023-01-11", "+7-383-328-05-85; 8-993-023-01-11", "admissions-office"),
    reviewed("russia-1715", "admissionsEmail", "https://www.stu.ru/abiturient/", '/html/body/div[7]/div/div/div/div/main/div[7]/div[3]/div[1]/div/div/div[1]/div[2]', "Эл. адрес: pk@sgups.stu.ru Приемная комиссия работает", "pk@sgups.stu.ru", "admissions-office"),
    reviewed("russia-1715", "hostelInfo", "https://www.stu.ru/abiturient/index.php?page=2239", '//main', "Большая часть помещений общежитий реконструирована, студенты проживают как по два, так и по три- четыре человека в комнате в блоках гостиничного типа с обеспечением необходимых санитарно-гигиенических условий. Для самостоятельного приготовления пищи студентам оборудованы кухни, где расположены плиты, разделочные столы и мойки.", "Большая часть помещений общежитий реконструирована, студенты проживают как по два, так и по три- четыре человека в комнате в блоках гостиничного типа с обеспечением необходимых санитарно-гигиенических условий. Для самостоятельного приготовления пищи студентам оборудованы кухни, где расположены плиты, разделочные столы и мойки." + HOSTEL_NOTE, "hostel-description"),
    reviewed("russia-1763", "admissionsPhone", "https://www.ssuwt.ru/abitur/", '/html/body/div/section/div/div/div[1]/div[4]/div', "Информация о приемной комиссии Почтовый адрес для направления документов, необходимых для поступления: 630099 г. Новосибирск, ул. Щетинкина, 33, каб.324 (Приемная комиссия) Электронный адрес для взаимодействия с поступающими: e-mail: fdp@nsawt.ru Телефон +7 (383) 222-12-00, 8-800-200-48-63", "+7 (383) 222-12-00; 8-800-200-48-63", "admissions-office"),
    reviewed("russia-1763", "admissionsEmail", "https://www.ssuwt.ru/abitur/", '/html/body/div/section/div/div/div[1]/div[4]/div', "Электронный адрес для взаимодействия с поступающими: e-mail: fdp@nsawt.ru", "fdp@nsawt.ru", "admissions-office"),
    reviewed("russia-28", "admissionsPhone", "https://www.vvsu.ru/admission/", '//article[.//h2[contains(., "Приёмная комиссия ВВГУ")]]', "Приёмная комиссия ВВГУ Телефон 8 (800) 700-04-65", "8 (800) 700-04-65", "admissions-office"),
    reviewed("russia-28", "admissionsEmail", "https://www.vvsu.ru/admission/", '//article[.//h2[contains(., "Приёмная комиссия ВВГУ")]]', "Электронная почта abiturient@vvsu.ru", "abiturient@vvsu.ru", "admissions-office"),
]

REVIEW_ISSUES = [
    {"universitySlug": "mfua", "field": "admissionsEmail", "sourceUrl": "https://www.mfua.ru/sveden/struct/", "reason": "The admission-commission structural row lists the named secretary's personal address belenko.t@masi.ru. It is not promoted to a generic admissions-office email."},
    {"universitySlug": "moscow-110266", "field": "admissionsEmail", "sourceUrl": "https://imeit.ru/abitur/bachelor/", "reason": "The current bachelor's-admissions page supplies an application form URL rather than an email address. No generic or personal email is substituted."},
    {"universitySlug": "moscow-110266", "sourceUrl": "https://imeit.ru/abitur/", "reason": "The landing page still prints commission working dates in 2025. Dates are excluded; the phone is sourced instead from the separate 2026/2027 bachelor's-admissions contact table."},
    {"universitySlug": "russia-1715", "field": "hostelInfo", "sourceUrl": "https://www.stu.ru/abiturient/index.php?page=3673", "reason": "The promotional room-description page was last updated 16.06.2023. Its dated details are excluded; the hostel field uses the separate admissions-hostel page updated 25.05.2026."},
    {"universitySlug": "russia-1715", "sourceUrl": "https://www.stu.ru/abiturient/", "reason": "Ministry hotline/email and faculty-specific commission contacts are excluded; only the university admission commission's own local contact block is used."},
    {"universitySlug": "russia-1763", "sourceUrl": "https://www.ssuwt.ru/abitur/", "reason": "Ministry hotlines/email and general university header contacts are excluded; only the local applicant-interaction block is used."},
    {"universitySlug": "pushkin", "reason": "All admission URL, telephone, email and hostel fields already exist in the frozen baseline. No prior value or check date is rewritten."},
]
BASELINE_FILES = [
    "data-sources/moscow/profiles.json", "data-sources/russia/profiles.json",
    "data-sources/russia/moscow-enrichment-2026-10-09.json",
    "data-sources/russia/regional-enrichment-2026-10-09.json",
    "data-sources/russia/regional-enrichment-2026-10-10.json",
    "data-sources/russia/moscow-enrichment-2026-10-10.json",
    "data-sources/russia/moscow-enrichment-2026-10-11.json",
    "data-sources/russia/regional-enrichment-2026-10-11.json",
    "data-sources/russia/moscow-enrichment-2026-10-20.json",
    "data-sources/russia/regional-north-enrichment-2026-10-20.json",
    "data-sources/russia/regional-south-enrichment-2026-10-20.json",
]


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def clean(value):
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def source_paths(work, slug, url):
    key = hashlib.sha256(url.encode()).hexdigest()[:16]
    return work / slug / (key + ".html"), work / slug / (key + ".meta.json")


def freeze_baseline(work):
    path = work / "baseline.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    fields = {slug: {} for slug in SLUGS}
    sources = []
    for filename in BASELINE_FILES:
        raw = (ROOT / filename).read_bytes()
        sources.append({"path": filename, "sha256": hashlib.sha256(raw).hexdigest()})
        for profile in json.loads(raw).get("profiles", []):
            if profile["universitySlug"] in fields:
                for key, value in profile.get("fields", {}).items():
                    fields[profile["universitySlug"]].setdefault(key, value)
    baseline = {"files": sources, "fields": fields}
    dump(path, baseline)
    return baseline


def validate_source_url(slug, url):
    """Only an HTTPS URL on this reviewed university's domain is a source."""
    if not isinstance(url, str) or re.search(r"[\x00-\x20\\]", url):
        raise ValueError("Unsafe source URL")
    parsed = urlparse(url)
    try:
        valid_port = parsed.port in {None, 443}
    except ValueError as error:
        raise ValueError("Unsafe source URL port") from error
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or parsed.username is not None or parsed.password is not None or not hostname or not valid_port:
        raise ValueError("Unsafe source URL scheme, credentials or host")
    if not any(hostname == domain or hostname.endswith("." + domain) for domain in OFFICIAL_HOSTS.get(slug, set())):
        raise ValueError("Source URL is outside the official university domain")
    return parsed


def require_public_resolution(url):
    """Check each destination before requests can send a network request."""
    parsed = urlparse(url)
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(address[4][0]).is_global or ipaddress.ip_address(address[4][0]).is_multicast for address in addresses):
        raise ValueError("Source host resolves to a non-public address")


def safe_get(slug, url, max_redirects=MAX_REDIRECTS):
    """Validate every redirect before following it; requests never follows one."""
    seen = set()
    for hop in range(max_redirects + 1):
        validate_source_url(slug, url)
        if url in seen:
            raise ValueError("Source redirect loop")
        seen.add(url)
        require_public_resolution(url)
        response = requests.get(url, timeout=(10, 22), allow_redirects=False, headers={"User-Agent": "Postupai-source-verification/1.0"})
        try:
            validate_source_url(slug, response.url)
            if response.status_code not in {301, 302, 303, 307, 308}:
                return response
            location = response.headers.get("Location")
            if not location or hop == max_redirects:
                raise ValueError("Source redirect missing location or exceeds limit")
            destination = urljoin(url, location)
            validate_source_url(slug, destination)
        except Exception:
            response.close()
            raise
        response.close()
        url = destination
    raise ValueError("Source redirect exceeds limit")


def validate_checked_at(value, now=None):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)", value):
        raise ValueError("Source checkedAt must be a UTC ISO timestamp")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.date().isoformat() != BATCH:
        raise ValueError("Source checkedAt is outside the frozen batch date")
    if parsed > (now or datetime.now(timezone.utc)):
        raise ValueError("Source checkedAt cannot be in the future")
    return parsed


def validate_source_metadata(meta, slug, url, now=None):
    validate_source_url(slug, url)
    if meta.get("universitySlug") != slug or meta.get("requestedUrl") != url:
        raise ValueError("Source metadata identity mismatch")
    validate_source_url(slug, meta.get("url"))
    if str(meta.get("httpStatus")) != "200" or type(meta.get("exitCode")) is not int or meta["exitCode"] != 0:
        raise ValueError("Reviewed source was not HTTP 200 with successful exit")
    if meta.get("rejected") or meta.get("error"):
        raise ValueError("Reviewed source metadata is rejected")
    if not re.fullmatch(r"[0-9a-f]{64}", str(meta.get("sourceSha256", ""))):
        raise ValueError("Source SHA-256 metadata is invalid")
    validate_checked_at(meta.get("checkedAt"), now)


def fetch(work, slug, url):
    validate_source_url(slug, url)
    body_path, meta_path = source_paths(work, slug, url)
    if meta_path.exists():
        cached = json.loads(meta_path.read_text(encoding="utf-8"))
        if str(cached.get("httpStatus")) == "200":
            validate_source_metadata(cached, slug, url)
        return cached
    record = {"universitySlug": slug, "requestedUrl": url}
    try:
        response = safe_get(slug, url)
        try:
            record.update({"url": response.url, "httpStatus": str(response.status_code), "exitCode": 0, "checkedAt": datetime.now(timezone.utc).isoformat(), "contentType": response.headers.get("Content-Type", ""), "encoding": response.encoding})
            if response.status_code == 200:
                body_path.parent.mkdir(parents=True, exist_ok=True)
                body_path.write_bytes(response.content)
                record.update({"body": body_path.relative_to(work).as_posix(), "sourceSha256": hashlib.sha256(response.content).hexdigest()})
            else:
                record["error"] = "HTTP " + str(response.status_code)
        finally:
            response.close()
    except (requests.RequestException, ValueError, OSError) as exc:
        record.update({"checkedAt": datetime.now(timezone.utc).isoformat(), "error": str(exc)})
    dump(meta_path, record)
    return record


def load_evidence(work, slug, url):
    body_path, meta_path = source_paths(work, slug, url)
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    validate_source_metadata(meta, slug, url)
    raw = body_path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != meta["sourceSha256"]:
        raise ValueError("Raw source hash mismatch: " + url)
    try:
        decoded = raw.decode("utf-8")
    except UnicodeDecodeError:
        decoded = raw.decode(meta.get("encoding") or "windows-1251")
    document = html.fromstring(decoded)
    visible = clean(" ".join(document.xpath('//body//text()[not(ancestor::script) and not(ancestor::style)]')))
    if re.search(r"checking your browser|ddos.guard|just a moment|подтвердите.{0,25}человек|доступ.{0,15}ограничен", visible[:2500], re.I):
        raise ValueError("Reviewed source is an access challenge")
    return meta, document


def validate_review(row, tree):
    """Context is an explicit review decision, never an email-name heuristic."""
    if row["field"] in {"admissionsEmail", "admissionsPhone"} and row.get("context") != "admissions-office":
        raise ValueError("Admission contacts need reviewed office context")
    nodes = tree.xpath(row.get("xpath", "//body"))
    text = clean(" ".join(" ".join(n.itertext()) for n in nodes))
    if clean(row["evidence"]) not in text:
        raise ValueError("Reviewed evidence missing: " + row["universitySlug"] + "/" + row["field"])
    value = row["value"].removesuffix(HOSTEL_NOTE)
    parts = value.split("; ") if row["field"] == "admissionsPhone" else [value]
    if any(clean(part) not in clean(row["evidence"]) for part in parts):
        raise ValueError("Field value is not present in the reviewed evidence")
    if row["field"] == "admissionsEmail" and row["value"].endswith("@minobrnauki.gov.ru"):
        raise ValueError("A ministry email is not a university admission office")
    return row["value"]


def build(work, baseline):
    profiles = {}
    sources = []
    issues = list(REVIEW_ISSUES)
    for path in sorted(work.glob("*/*.meta.json")):
        meta = json.loads(path.read_text(encoding="utf-8"))
        sources.append(meta)
        if str(meta.get("httpStatus")) != "200":
            issues.append({"universitySlug": meta["universitySlug"], "sourceUrl": meta["requestedUrl"], "reason": meta.get("error", "HTTP failure")})
    for row in REVIEWED:
        slug, key = row["universitySlug"], row["field"]
        if row["url"] not in TARGETS.get(slug, []):
            raise ValueError("Reviewed field is outside the explicit source plan")
        if key in baseline["fields"][slug]:
            raise ValueError("Attempt to overwrite a frozen baseline field: " + slug + "/" + key)
        meta, tree = load_evidence(work, slug, row["url"])
        value = validate_review(row, tree)
        profile = profiles.setdefault(slug, {"universitySlug": slug, "fields": {}, "faculties": [], "offerings": []})
        if key in profile["fields"]:
            raise ValueError("Duplicate reviewed field")
        profile["fields"][key] = {"value": value, "sourceUrl": meta["url"], "sourceYear": 2026, "checkedAt": meta["checkedAt"], "sourceSha256": meta["sourceSha256"]}
    return {"profiles": list(profiles.values()), "sources": sources, "issues": issues, "summary": {"batch": BATCH, "profiles": len(profiles), "newFields": sum(len(p["fields"]) for p in profiles.values()), "scope": "Gap-only admission contacts and hostel facts; no place-availability guarantee, no admissions programs.", "baseline": "Frozen baseline.json in the evidence directory; existing values and dates are preserved.", "baselineFields": {slug: sorted(fields) for slug, fields in baseline["fields"].items()}, "baselineSources": baseline["files"]}}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collect", action="store_true")
    parser.add_argument("--work-dir", type=Path, default=ROOT / "tmp/russia-research/contacts-enrichment-2026-10-22")
    parser.add_argument("--output", type=Path, default=ROOT / "data-sources/russia/contacts-enrichment-2026-10-22.json")
    args = parser.parse_args()
    baseline = freeze_baseline(args.work_dir) if args.collect else json.loads((args.work_dir / "baseline.json").read_text(encoding="utf-8"))
    if args.collect:
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            futures = [pool.submit(fetch, args.work_dir, slug, url) for slug, urls in TARGETS.items() for url in urls]
            for future in concurrent.futures.as_completed(futures):
                record = future.result()
                print(json.dumps(record, ensure_ascii=False))
    result = build(args.work_dir, baseline)
    dump(args.output, result)
    print(json.dumps(result["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()

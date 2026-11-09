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
BATCH = "2026-10-25"
SLUGS = ("mipt", "mephi", "mpei", "rudn", "mgppu", "mirea", "mtuci", "rsuh")
TARGETS = {
    "mipt": ["https://pk.mipt.ru/", "https://pk.mipt.ru/contacts/", "https://pk.mipt.ru/bachelor/", "https://mipt.ru/sveden/objects/"],
    "mephi": ["https://admission.mephi.ru/about/contacts", "https://admission.mephi.ru/about/dorm"],
    "mpei": ["https://pk.mpei.ru/contacts.html"],
    "rudn": ["https://www.rudn.ru/life/accomodation"],
    "mgppu": ["https://mgppu.ru/project/250", "https://mgppu.ru/students/helphostel"],
    "mirea": ["https://priem.mirea.ru/", "https://www.mirea.ru/about/infrastructure/obshchezhitiya/"],
    "mtuci": ["https://abitur.mtuci.ru/", "https://abitur.mtuci.ru/contacts/", "https://abitur.mtuci.ru/dormitory/"],
    "rsuh": ["https://www.rsuh.ru/applicant/"],
}
OFFICIAL_HOSTS = {"mipt": {"mipt.ru"}, "mephi": {"mephi.ru"}, "mpei": {"mpei.ru"}, "rudn": {"rudn.ru"}, "mgppu": {"mgppu.ru"}, "mirea": {"mirea.ru"}, "mtuci": {"mtuci.ru"}, "rsuh": {"rsuh.ru"}}
MAX_REDIRECTS = 5
HOSTEL_NOTE = " Наличие свободных мест и предоставление места требуют отдельного подтверждения."


def reviewed(slug, field, url, xpath, evidence, value, context):
    return {"universitySlug": slug, "field": field, "url": url, "xpath": xpath, "evidence": evidence, "value": value, "context": context}


# All associations were manually reviewed against this batch's saved body.
# XPath restricts contacts to the university commission's own content block.
REVIEWED = [
    reviewed("mipt", "hostelInfo", "https://mipt.ru/sveden/objects/", '/html/body/div/section/div/div/div[1]/div[2]/div[1]/div/div/div[8]/div[2]/div', "Общежития № 12, 13 и 14 приспособлены для использования инвалидами с нарушениями опорно-двигательного аппарата. Общежития № 10 и 11 оборудованы пандусом.", "Общежития № 12, 13 и 14 приспособлены для использования инвалидами с нарушениями опорно-двигательного аппарата. Общежития № 10 и 11 оборудованы пандусом." + HOSTEL_NOTE, "hostel-description"),
    reviewed("mephi", "admissionsPhone", "https://admission.mephi.ru/about/contacts", '//h2[contains(., "Приемная комиссия")]/..', "+7 495 785 55 25 - бесплатные звонки по Москве", "+7 495 785 55 25", "admissions-office"),
    reviewed("mephi", "admissionsEmail", "https://admission.mephi.ru/about/contacts", '//h2[contains(., "Приемная комиссия")]/..', "Email priem@mephi.ru Режим работы", "priem@mephi.ru", "admissions-office"),
    reviewed("mephi", "hostelInfo", "https://admission.mephi.ru/about/dorm", '/html/body/div[3]/div[3]/div/div[3]/div[2]', "Университет имеет современный комплекс общежитий, в который входят общежития квартирного и коридорного типа. В общежитиях квартирного типа каждая квартира укомплектована необходимой мебелью для учебы и отдыха, холодильником и электроплитой. В квартирах имеется кухня, ванная комната, туалет, лоджия.", "Университет имеет современный комплекс общежитий, в который входят общежития квартирного и коридорного типа. В общежитиях квартирного типа каждая квартира укомплектована необходимой мебелью для учебы и отдыха, холодильником и электроплитой. В квартирах имеется кухня, ванная комната, туалет, лоджия." + HOSTEL_NOTE, "hostel-description"),
    reviewed("mpei", "admissionsPhone", "https://pk.mpei.ru/contacts.html", '//div[@class="pk-home-contacts"]', "Телефон +7 (495) 362-77-77 Электронная почта pk@mpei.ru", "+7 (495) 362-77-77", "admissions-office"),
    reviewed("mpei", "admissionsEmail", "https://pk.mpei.ru/contacts.html", '//div[@class="pk-home-contacts"]', "Телефон +7 (495) 362-77-77 Электронная почта pk@mpei.ru", "pk@mpei.ru", "admissions-office"),
    reviewed("rudn", "hostelInfo", "https://www.rudn.ru/life/accomodation", '/html/body/div[3]/div[4]/section[2]/div/div[2]/div/div[1]/div/div[3]/div/div/p[1]', "1-8 блоки туалетная комната, умывальник и кухня находятся на этаже. Душевые кабины, прачечная, гладильные комнаты и камера хранения расположены на цокольном этаже.", "1-8 блоки туалетная комната, умывальник и кухня находятся на этаже. Душевые кабины, прачечная, гладильные комнаты и камера хранения расположены на цокольном этаже." + HOSTEL_NOTE, "hostel-description"),
    reviewed("mgppu", "admissionsPhone", "https://mgppu.ru/project/250", '/html/body/div[1]/div[3]/div/div/div[1]/section[1]', "Телефон: +7 (495) 822-32-52 E-mail: priem@mgppu.ru", "+7 (495) 822-32-52", "admissions-office"),
    reviewed("mgppu", "admissionsEmail", "https://mgppu.ru/project/250", '/html/body/div[1]/div[3]/div/div/div[1]/section[1]', "Телефон: +7 (495) 822-32-52 E-mail: priem@mgppu.ru", "priem@mgppu.ru", "admissions-office"),
    reviewed("mgppu", "hostelInfo", "https://mgppu.ru/students/helphostel", '//article/p[2]', "ФГБОУ ВО МГППУ не имеет общежития.", "ФГБОУ ВО МГППУ не имеет общежития." + HOSTEL_NOTE, "hostel-description"),
    reviewed("mirea", "admissionsUrl", "https://priem.mirea.ru/", '//head/title', "Приёмная комиссия РТУ МИРЭА", "https://priem.mirea.ru/", "admissions-landing"),
    reviewed("mirea", "admissionsPhone", "https://priem.mirea.ru/", '//section[@id="contacts"]', "Горячая линия +7 499 322-20-30 pk@mirea.ru Адрес приемной комиссии", "+7 499 322-20-30", "admissions-office"),
    reviewed("mirea", "admissionsEmail", "https://priem.mirea.ru/", '//section[@id="contacts"]', "Горячая линия +7 499 322-20-30 pk@mirea.ru Адрес приемной комиссии", "pk@mirea.ru", "admissions-office"),
    reviewed("mirea", "hostelInfo", "https://www.mirea.ru/about/infrastructure/obshchezhitiya/", '/html/body/div[3]/div[1]/div[3]/div/div/div[1]/div/div/div[2]/div/p[2]', "В зависимости от общежития имеются: комнаты подготовки к учебным занятиям, комнаты для занятий спортом и отдыха, комнаты для самостоятельных занятий, спортивные и тренажёрные залы, постирочные и гладильные комнаты, комнаты для творческих занятий, парковки для велосипедов, площадки для занятий уличными видами спорта, буфеты и столовые. В общежитиях для учёбы студентов установлены компьютеры с доступом к сети Интернет и основным сервисам университета.", "В зависимости от общежития имеются: комнаты подготовки к учебным занятиям, комнаты для занятий спортом и отдыха, комнаты для самостоятельных занятий, спортивные и тренажёрные залы, постирочные и гладильные комнаты, комнаты для творческих занятий, парковки для велосипедов, площадки для занятий уличными видами спорта, буфеты и столовые. В общежитиях для учёбы студентов установлены компьютеры с доступом к сети Интернет и основным сервисам университета." + HOSTEL_NOTE, "hostel-description"),
    reviewed("mtuci", "admissionsUrl", "https://abitur.mtuci.ru/", '//head/title', "Приёмная комиссия московского технического университета связи и информатики (МТУСИ)", "https://abitur.mtuci.ru/", "admissions-landing"),
    reviewed("mtuci", "admissionsPhone", "https://abitur.mtuci.ru/contacts/", '/html/body/div[2]/div[4]/div/div[3]/div', "Контактные данные приемной комиссии 111024, Москва, ул. Авиамоторная, 8c39 +7 (495) 673-36-25 pk@mtuci.ru", "+7 (495) 673-36-25", "admissions-office"),
    reviewed("mtuci", "admissionsEmail", "https://abitur.mtuci.ru/contacts/", '/html/body/div[2]/div[4]/div/div[3]/div', "Контактные данные приемной комиссии 111024, Москва, ул. Авиамоторная, 8c39 +7 (495) 673-36-25 pk@mtuci.ru", "pk@mtuci.ru", "admissions-office"),
    reviewed("mtuci", "hostelInfo", "https://abitur.mtuci.ru/dormitory/", '/html/body/div[2]/div[4]/div/div[1]/div/div/p[2]', "Общежитие предоставляется только для студентов очной формы обучения.", "Общежитие предоставляется только для студентов очной формы обучения." + HOSTEL_NOTE, "hostel-description"),
    reviewed("rsuh", "admissionsUrl", "https://www.rsuh.ru/applicant/", '//head/title', "РГГУ - Поступающим - приемная кампания 2026", "https://www.rsuh.ru/abitur/", "admissions-landing"),
    reviewed("rsuh", "admissionsPhone", "https://www.rsuh.ru/applicant/", '/html/body/div[5]/div[3]/div[7]', "+7(495) 250-71-71 - многоканальный", "+7(495) 250-71-71", "admissions-office"),
    reviewed("rsuh", "admissionsEmail", "https://www.rsuh.ru/applicant/", '/html/body/div[5]/div[3]/div[7]', "priem@rggu.ru Канал для абитуриентов РГГУ", "priem@rggu.ru", "admissions-office"),
]

REVIEW_ISSUES = [
    {"universitySlug": "mipt", "field": "admissionsUrl", "sourceUrl": "https://pk.mipt.ru/", "reason": "The admissions landing page and two related admissions routes return HTTP 403. No admissions URL or contact is inferred from old search snippets. The official accessible objects page supports only the hostel description."},
    {"universitySlug": "mephi", "sourceUrl": "https://admission.mephi.ru/about/contacts", "reason": "Only the commission's Moscow call-centre phone and its explicitly labelled email are used. The Intereducation hotline, special-category consultation number, institute contacts and branch contacts are excluded. No address conflict is resolved: hostel addresses are omitted."},
    {"universitySlug": "mpei", "sourceUrl": "https://pk.mpei.ru/contacts.html", "reason": "University contacts come from the local pk-home-contacts block. Adjacent federal call-centres, including the ministry email, are excluded. Existing admissions URL and hostel description are not replaced."},
    {"universitySlug": "mgppu", "field": "hostelInfo", "sourceUrl": "https://mgppu.ru/students/helphostel", "reason": "The university explicitly says it has no own hostel and describes assistance with other organisations. Placement statistics for 2022-2023 and 2023-2024 are historical and excluded. This is a current page observation, not a 2026 placement guarantee."},
    {"universitySlug": "mgppu", "sourceUrl": "https://mgppu.ru/project/250", "reason": "Only the bachelor's/specialist's/master's admissions contact is used; security-post phone and postgraduate admissions contacts are excluded."},
    {"universitySlug": "mtuci", "field": "hostelInfo", "sourceUrl": "https://abitur.mtuci.ru/dormitory/", "reason": "Only the explicit full-time-study restriction is reproduced. Score-based hostel guarantees, deadlines, admission thresholds, personal housing-department email and commercial housing services are excluded."},
    {"universitySlug": "rsuh", "sourceUrl": "https://www.rsuh.ru/applicant/", "reason": "The central commission's multichannel number and email are used. College, foreign-student, targeted-admissions and personal staff phones, plus the ministry email in a separate block, are excluded. The existing hostel fact is preserved."},
]
BASELINE_FILES = ['data-sources/moscow/profiles.json', 'data-sources/russia/profiles.json', 'data-sources/russia/moscow-enrichment-2026-10-09.json', 'data-sources/russia/regional-enrichment-2026-10-09.json', 'data-sources/russia/regional-enrichment-2026-10-10.json', 'data-sources/russia/moscow-enrichment-2026-10-10.json', 'data-sources/russia/moscow-enrichment-2026-10-11.json', 'data-sources/russia/regional-enrichment-2026-10-11.json', 'data-sources/russia/moscow-enrichment-2026-10-20.json', 'data-sources/russia/regional-north-enrichment-2026-10-20.json', 'data-sources/russia/regional-south-enrichment-2026-10-20.json', 'data-sources/russia/moscow-enrichment-2026-10-22.json', 'data-sources/russia/regional-enrichment-2026-10-22.json', 'data-sources/russia/contacts-enrichment-2026-10-22.json']


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def clean(value):
    spaced = re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()
    return re.sub(r"\s+([,.;:!?])", r"\1", spaced)


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


def validate_review(row, tree, source_url=None):
    """Context is an explicit review decision, never an email-name heuristic."""
    contact = row["field"] in {"admissionsEmail", "admissionsPhone"}
    if contact and row.get("context") != "admissions-office":
        raise ValueError("Admission contacts need reviewed office context")
    nodes = tree.xpath(row.get("xpath", "//body"))
    if contact and (len(nodes) != 1 or nodes[0].tag in {"html", "body"} or nodes[0].xpath('ancestor-or-self::footer | ancestor-or-self::header | ancestor-or-self::nav | .//footer | .//header | .//nav')):
        raise ValueError("Admission contacts need a local office block outside navigation and footer")
    text = clean(" ".join(" ".join(n.xpath('.//text()[not(ancestor::script) and not(ancestor::style)]')) for n in nodes))
    if clean(row["evidence"]) not in text:
        raise ValueError("Reviewed evidence missing: " + row["universitySlug"] + "/" + row["field"])
    if row["field"] == "admissionsUrl":
        validate_source_url(row["universitySlug"], row["value"])
        if row.get("context") != "admissions-landing" or row["value"] != (source_url or row["url"]) or len(nodes) != 1 or nodes[0].tag not in {"title", "h1"}:
            raise ValueError("Admission URL needs a reviewed landing-page identity")
        return row["value"]
    if row["field"] == "hostelInfo" and (row.get("context") != "hostel-description" or not row["value"].endswith(HOSTEL_NOTE)):
        raise ValueError("Hostel description needs its availability caveat")
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
        if meta.get("requestedUrl") not in TARGETS.get(meta.get("universitySlug"), []):
            continue
        sources.append(meta)
        if str(meta.get("httpStatus")) != "200":
            issues.append({"universitySlug": meta["universitySlug"], "sourceUrl": meta["requestedUrl"], "reason": meta.get("error", "HTTP failure")})
    for row in REVIEWED:
        slug, key = row["universitySlug"], row["field"]
        if key not in {"admissionsUrl", "admissionsPhone", "admissionsEmail", "hostelInfo"}:
            raise ValueError("Field is outside the gap-only contacts scope")
        if row["url"] not in TARGETS.get(slug, []):
            raise ValueError("Reviewed field is outside the explicit source plan")
        if key in baseline["fields"][slug]:
            raise ValueError("Attempt to overwrite a frozen baseline field: " + slug + "/" + key)
        meta, tree = load_evidence(work, slug, row["url"])
        value = validate_review(row, tree, source_url=meta["url"])
        profile = profiles.setdefault(slug, {"universitySlug": slug, "fields": {}, "faculties": [], "offerings": []})
        if key in profile["fields"]:
            raise ValueError("Duplicate reviewed field")
        profile["fields"][key] = {"value": value, "sourceUrl": meta["url"], "sourceYear": 2026, "checkedAt": meta["checkedAt"], "sourceSha256": meta["sourceSha256"]}
    return {"profiles": list(profiles.values()), "sources": sources, "issues": issues, "summary": {"batch": BATCH, "profiles": len(profiles), "newFields": sum(len(p["fields"]) for p in profiles.values()), "scope": "Gap-only admission contacts and hostel facts; no place-availability guarantee, no admissions programs.", "baseline": "Frozen baseline.json in the evidence directory; existing values and dates are preserved.", "baselineFields": {slug: sorted(fields) for slug, fields in baseline["fields"].items()}, "baselineSources": baseline["files"]}}


def write_report(work, output, result, baseline):
    """Account for reviewed evidence separately from saved discovery attempts."""
    planned = {(slug, url) for slug, urls in TARGETS.items() for url in urls}
    attempts = []
    outcomes = {}
    for path in sorted(work.glob("*/*.meta.json")):
        meta = json.loads(path.read_text(encoding="utf-8"))
        outcome = meta.get("httpStatus", "network_error")
        outcomes[outcome] = outcomes.get(outcome, 0) + 1
        attempts.append({"path": path.relative_to(work).as_posix(), "universitySlug": meta["universitySlug"], "requestedUrl": meta["requestedUrl"], "finalUrl": meta.get("url"), "httpStatus": meta.get("httpStatus"), "checkedAt": meta["checkedAt"], "error": meta.get("error"), "inExplicitPlan": (meta["universitySlug"], meta["requestedUrl"]) in planned})
    added = {p["universitySlug"]: sorted(p["fields"]) for p in result["profiles"]}
    fields = {"admissionsUrl", "admissionsPhone", "admissionsEmail", "hostelInfo"}
    report = {
        "batch": BATCH,
        "candidateSha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "profiles": len(result["profiles"]),
        "newFields": result["summary"]["newFields"],
        "addedFields": added,
        "remainingTargetFields": {slug: sorted(fields - set(baseline["fields"][slug]) - set(added.get(slug, []))) for slug in SLUGS},
        "sourceYearMeaning": "2026 records observation of the official contact/accommodation page, not an admissions intake year. Historical placement results, prices, cutoffs and current licence status are not added.",
        "requestAccounting": {
            "unit": "Saved logical page-attempt receipts; redirect hops are not individually counted. These counts are not a total of HTTP network requests.",
            "explicitPlanReceipts": sum(a["inExplicitPlan"] for a in attempts),
            "allSavedReceipts": len(attempts),
            "allSavedHttpOutcomes": outcomes,
            "excludedDiscoveryReceipts": [a for a in attempts if not a["inExplicitPlan"]],
            "allSavedAttempts": attempts,
        },
        "reviewedFields": REVIEWED,
        "baselineFilesUnchanged": all(hashlib.sha256((ROOT / entry["path"]).read_bytes()).hexdigest() == entry["sha256"] for entry in baseline["files"]),
        "replay": "python scripts/collect-contacts-oct25-enrichment.py (offline, uses frozen baseline and HTTP bodies)",
        "tests": "python -m unittest discover -s scripts -p test_collect_contacts_oct25_enrichment.py -v",
    }
    dump(work / "review-report.json", report)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collect", action="store_true")
    parser.add_argument("--work-dir", type=Path, default=ROOT / "tmp/russia-research/contacts-enrichment-2026-10-25")
    parser.add_argument("--output", type=Path, default=ROOT / "data-sources/russia/contacts-enrichment-2026-10-25.json")
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
    write_report(args.work_dir, args.output, result, baseline)
    print(json.dumps(result["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()

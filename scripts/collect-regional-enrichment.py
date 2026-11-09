"""Collect current official profile/structure evidence for a first regional batch.

No licenses, admission places, fees or exam combinations are inferred. Education
rows describe implemented programs, with admissionsStatus=pending_review.
"""

import argparse
import concurrent.futures
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import urljoin, urlparse, urlunparse

from lxml import html
import requests


TARGET_IDS = ["1771", "234", "240", "1519", "313", "178", "294", "296", "1507", "337", "1520", "266", "64", "45", "217", "323", "109", "70"]
ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tmp/russia-research/regional-enrichment-2026-10-09"
OUT = ROOT / "data-sources/russia/regional-enrichment-2026-10-09.json"
CHECKED_AT = None
OFFLINE = False
REFRESH = False
TRY_BARE_HOST = False
YEAR = 2026
UNCERTAIN_UNITS = {
    "russia-88": {
        'Совместная российско-итальянская школа дизайна "Стиль"',
        "Факультет международных образовательных программ",
    },
    "russia-315": {
        "Институт непрерывного и дистанционного образования",
        "Институт стратегического планирования и финансового анализа",
        "Институт параллельного образования",
        "Высшая школа корпоративного образования",
    },
    "russia-82": {"Институт квантовой физики"},
    "russia-1661": {"Институт международных связей"},
    "russia-666669204": {'Школа журналистики «Медиастарт»'},
    "russia-292": {
        "Региональный проектный институт",
        "Институт международных связей и интернационализации образования",
        "Институт магистратуры и аспирантуры",
    },
}


def clean(value):
    return " ".join(value.replace("\xa0", " ").replace("\u200b", "").split())


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def host(url):
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def https(url):
    return urlunparse(urlparse(url)._replace(scheme="https", fragment=""))


def bare_host_url(url):
    """Keep the same official domain/path; do not guess alternative hosts."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.username or parsed.password or not (parsed.hostname or "").startswith("www."):
        return None
    netloc = parsed.hostname[4:] + (":" + str(parsed.port) if parsed.port else "")
    return urlunparse(parsed._replace(netloc=netloc))


def tree(raw):
    charset = re.search(br"charset\s*=\s*['\"]?\s*([A-Za-z0-9_-]+)", raw[:15000], re.I)
    encoding = charset.group(1).decode("ascii") if charset else "utf-8"
    try:
        # Several real UTF-8 pages contain isolated invalid bytes inside scripts.
        # Preserve their declared UTF-8 body instead of re-decoding every Russian
        # character as Windows-1251. Any invalid fact text is rejected below.
        text = raw.decode(encoding, errors="replace")
    except LookupError:
        text = raw.decode("utf-8", errors="replace")
    return html.fromstring(text)


def fetch(url, folder):
    digest = hashlib.sha256(url.encode()).hexdigest()[:16]
    path = folder / (digest + ".html")
    meta_path = path.with_suffix(".meta.json")
    if meta_path.exists() and not REFRESH:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    else:
        if OFFLINE:
            return None, {"requestedUrl": url, "url": url, "httpStatus": "not_fetched", "exitCode": 1, "checkedAt": CHECKED_AT, "sourceKind": "official_university_page", "note": "Новый путь обнаружен в официальной странице; проверка содержимого отложена."}
        run = subprocess.run([
            "curl.exe", "-sS", "-L", "--max-time", "18", "--connect-timeout", "5",
            "--proto", "=http,https", "-A", "Mozilla/5.0", "-o", str(path),
            "-w", "%{http_code}\n%{url_effective}", url,
        ], capture_output=True, timeout=24)
        lines = [line.strip() for line in run.stdout.decode("utf-8", errors="replace").strip().splitlines()]
        meta = {"requestedUrl": url, "url": lines[-1] if lines else url, "httpStatus": lines[0] if lines else "000", "exitCode": run.returncode, "checkedAt": CHECKED_AT, "sourceKind": "official_university_page"}
        if path.exists():
            meta["sourceSha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        if run.returncode:
            meta["error"] = clean(run.stderr.decode("utf-8", errors="replace"))[:300]
        dump(meta_path, meta)
    if meta["httpStatus"] != "200" or meta["exitCode"] or not path.exists():
        if not OFFLINE and not meta.get("requestsAttempted"):
            try:
                response = requests.get(url, timeout=(5, 15), headers={"User-Agent": "Mozilla/5.0"})
                path.write_bytes(response.content)
                meta = {"requestedUrl": url, "url": response.url, "httpStatus": str(response.status_code), "exitCode": 0, "checkedAt": CHECKED_AT, "sourceKind": "official_university_page", "sourceSha256": hashlib.sha256(response.content).hexdigest(), "requestsAttempted": True}
            except Exception as error:
                meta["requestsAttempted"] = True
                meta["requestsError"] = str(error)[:250]
            dump(meta_path, meta)
        if meta["httpStatus"] != "200" or meta["exitCode"] or not path.exists():
            return None, meta
    try:
        document = tree(path.read_bytes())
        visible = clean(" ".join(document.xpath("//body//text()[not(ancestor::script) and not(ancestor::style)]")))
        if len(visible) < 180 or re.search(r"checking your browser|ddos.guard|just a moment|доступ.{0,15}ограничен|подтвердите.{0,15}человек|сайт работает в прежнем режиме", visible[:2500], re.I):
            meta["rejected"] = "empty_or_access_challenge"
            return None, meta
        return document, meta
    except Exception as error:
        meta["rejected"] = str(error)[:150]
        return None, meta


def provenance(meta):
    return {"sourceUrl": meta["url"], "sourceYear": YEAR, "checkedAt": meta["checkedAt"], "sourceSha256": meta["sourceSha256"]}


def links(document, base):
    result = []
    for anchor in document.xpath("//a[@href]"):
        raw = anchor.get("href").strip()
        if raw.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        url = urljoin(base, raw)
        parsed = urlparse(url)
        if parsed.scheme in ("http", "https") and not parsed.username and not parsed.password:
            result.append((clean(anchor.text_content()), url))
    return result


def academic(name, university):
    if not 8 <= len(name) <= 250 or "�" in name:
        return False
    if name in UNCERTAIN_UNITS.get(university.get("slug"), set()) or name.startswith("Проектный институт «Союзхимпромпроект»"):
        # A structural list also contains research/design, DPO and preparatory
        # organizations. Omit these until their HE teaching scope is proven.
        return False
    if not re.search(r"\b(?:факультет|институт|школа)\b", name, re.I):
        return False
    if re.search(r"\b(?:центр|ноц|мниц|отдел|управление|департамент|дирекция|совет|кафедра|комиссия|библиотека|колледж|училище|военный|ректор|ректорат|конференция|президиум|нии|научно-исследовательский|лаборатория|филиал\w*)\b", name, re.I):
        return False
    if re.search(r"дополнительн|повышени[яе]|переподготов|довузов|подготовитель|непрерывного образования|среднего профессионального|деканат|отделени[ея]|научно.{0,12}исследов|структур|положени[ея]|факультет[ыа].{0,10}институт|научная школа|общеобразовательная|средняя школа|лицей|интернат|профориентацион|юного|университетская школа|безопасности труда|разработки видеоигр|цифровой культуры|kronbars|профессионального развития|институт качества|корпоративный институт|международного развития|развития конкуренции|подготовки (?:кадров|научно)|исследован|школьник|истори[яи] университета|подразделение$", name, re.I):
        return False
    return name.casefold().strip(' «»"') not in {university["name"].casefold().strip(' «»"'), university["directory"]["legalName"].casefold().strip(' «»"'), "институт", "высшая школа", "факультет"}


def structural_rows(document, meta, university):
    result = []
    seen = set()
    for element in document.xpath('//*[@itemprop="name" or @itemprop="divisionName" or @itemprop="structName"]'):
        # KНИТУ publishes a nested <li> tree with curly quotes around the
        # itemprop value. Its surrounding layout <tr> is not the unit row.
        containers = element.xpath('ancestor::*[contains(@itemprop,"structOrgUprav")][1]') or element.xpath('ancestor::tr[1]')
        if not containers:
            continue
        name = clean(element.text_content())
        if not academic(name, university) or name.casefold() in seen:
            continue
        container = containers[0]
        sites = element.xpath('.//a/@href') + container.xpath('.//*[@itemprop="site"]//a/@href')
        if not sites:
            sites = [clean(node.text_content()) for node in container.xpath('.//*[@itemprop="site"]') if clean(node.text_content()).startswith(("http://", "https://"))]
        url = urljoin(meta["url"], sites[0]) if sites else None
        if url and (urlparse(url).scheme not in ("http", "https") or urlparse(url).username):
            url = None
        seen.add(name.casefold())
        result.append({"name": name, "url": url, **provenance(meta)})
    return result


def faculty_links(document, meta, university):
    """Only used on an explicitly titled/listed official academic-unit page."""
    result = {}
    domain = host(university["website"])
    # The KFU page contains an older academic sidebar and a distinct primary
    # content list. Read the list itself without mixing navigation aliases.
    content = document.xpath('//*[@class="visit_link"]') if university["slug"] == "russia-1519" else []
    listed = [entry for section in content for entry in links(section, meta["url"])] if content else links(document, meta["url"])
    for name, url in listed:
        if not academic(name, university):
            continue
        if not (host(url) == domain or host(url).endswith("." + domain)):
            continue
        if re.search(r"/news|/novosti|/nauka|/events|/documents", urlparse(url).path, re.I):
            continue
        if university["slug"] == "russia-1519" and ("школа" in name.lower() or re.search(r"^/(?:chelny|elabuga|institutes/dzhizak)", urlparse(url).path)):
            # KFU's list mixes institutes, branches, nested schools and DPO.
            # Retain only clear Kazan higher-education institutes/faculties.
            continue
        key = https(url).rstrip("/")
        # Duplicate desktop/mobile navigation uses the same official unit URL.
        if key not in result or len(name) > len(result[key]["name"]):
            result[key] = {"name": name, "url": url, **provenance(meta)}
    unique = {}
    for faculty in result.values():
        unique.setdefault(faculty["name"].casefold(), faculty)
    return list(unique.values())


def common_fields(document, meta):
    result = {}
    for key in ["fullName", "shortName", "regDate", "address", "telephone", "email"]:
        values = [clean(node.text_content()) for node in document.xpath('//*[@itemprop="' + key + '"]')]
        values = [value for value in values if value and "�" not in value and len(value) <= 800 and not re.fullmatch(r"нет|отсутствует|-|—", value, re.I)]
        for value in values:
            if key == "email":
                # A common-information field can publish several addresses.
                # Preserve the first explicitly written address, rather than
                # treating separators or surrounding labels as part of it.
                # Some official fields spell their address with explicit
                # anti-spam tokens, e.g. office [at] sfu-kras [dot] ru.
                decoded = re.sub(r"\s*\[at\]\s*", "@", value, flags=re.I)
                decoded = re.sub(r"\s*\[dot\]\s*", ".", decoded, flags=re.I)
                addresses = re.findall(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+", decoded)
                if not addresses:
                    continue
                value = addresses[0]
            if key == "telephone" and not re.search(r"\d.{0,5}\d.{0,5}\d.{0,5}\d.{0,5}\d", value):
                continue
            if key == "fullName" and not re.search(r"институт|университет|академи|образован", value, re.I):
                continue
            result[key] = {"value": value, **provenance(meta)}
            break
    return result


def education_overview_links(document, base):
    """Follow explicitly labeled implementation overviews, never cohort plans."""
    return [url for label, url in links(document, base) if (
        re.search(r"/sveden/education/(?:eduaccred|accreditation)/?$", urlparse(url).path, re.I)
        or (re.search(r"/sveden/education/levels_forms$", urlparse(url).path, re.I) and re.fullmatch(r"бакалавриат|специалитет", label, re.I))
        or re.match(r"^(?:информация о )?реализуемы(?:х|е) (?:основны(?:х|е) )?(?:образовательны(?:х|е)|профессиональны(?:х|е)) программ", label, re.I)
        or re.fullmatch(r"информация о реализуемых уровнях образования, о формах обучения, нормативных сроках обучения", label, re.I)
    ) and not re.search(r"\.(?:pdf|docx?|xlsx?)(?:$|\?)", url, re.I)]


def hostel_fields(document, meta, issues=None):
    """Keep explicitly labeled residence counts; never promise a vacant place."""
    parts = []
    observed = {}
    for prop in ["hostelInfo", "hostelNum"]:
        nodes = document.xpath('//*[@itemprop="' + prop + '"]')
        if not nodes:
            continue
        node = nodes[0]
        value = clean(node.text_content())
        rows = node.xpath('ancestor::tr[1]')
        if not value or not rows:
            continue
        cells = rows[0].xpath('./th|./td')
        label = clean(cells[0].text_content()) if cells else ""
        if not label or cells[0] is node or "�" in label + value:
            continue
        if re.fullmatch(r"\d+", value) and not re.search(r"количество|число", label, re.I):
            continue
        parts.append(label + ": " + value)
        observed[prop] = {"label": label, "value": value}
    if issues is not None and "hostelInfo" in observed and "hostelNum" in observed:
        count = observed["hostelInfo"]["value"]
        rooms = observed["hostelNum"]
        if count.isdigit() and int(count) > 0 and re.fullmatch(r"нет|отсутствует", rooms["value"], re.I) and re.search(r"жилых помещений|мест", rooms["label"], re.I):
            issues.append({"kind": "source_inconsistent_residence_counts", "values": observed, **provenance(meta), "note": "Источник одновременно указывает ненулевое количество общежитий и «Нет» для жилых помещений/мест. Буквальные подписи сохранены; это не подтверждает отсутствие общежитий или нулевое число мест, требуется уточнение у вуза."})
    return {"hostelInfo": {"value": "; ".join(parts), **provenance(meta)}} if parts else {}


def offerings(document, meta, university, issues=None):
    result = []
    seen = {}
    durations = {}
    duration_issues = {}
    overview_tables = []
    for row in document.xpath('//tr[@itemprop="eduAccred"][.//*[@itemprop="eduForm"]]'):
        nearest = row.xpath('ancestor::table[1]')
        if nearest and nearest[0] not in overview_tables:
            overview_tables.append(nearest[0])
    if re.fullmatch(r"/sveden/education/levels_forms", urlparse(meta["url"]).path):
        # ИРНИТУ explicitly links these main level/form overviews from its
        # Education page. The rows omit eduAccred but use individual fields.
        overview_tables = document.xpath('//table[.//*[@itemprop="eduCode"]]')
    # Prefer the implemented overview. Later curriculum/cohort document tables
    # cannot add volume when an overview is present.
    # Separate overview tables often hold SPO, bachelor and specialist rows.
    # Read every overview row, without falling back to curriculum/cohort tables
    # merely because the first overview table contains only SPO.
    rows = [(row, table) for table in overview_tables for row in table.xpath('.//tr') if row.xpath('ancestor::table[1]')[0] is table]
    carries = {}
    previous_table = None
    for row, table in rows:
        if table is not previous_table:
            carries = {}
            previous_table = table
        fields = {key: value for key, (value, remaining) in carries.items()}
        carries = {key: (value, remaining - 1) for key, (value, remaining) in carries.items() if remaining > 1}
        for node in row.xpath(".//*[@itemprop]"):
            value = clean(node.text_content())
            if value:
                # An explicit cell always takes priority over carried cells.
                # Do not let malformed/overlong source rowspans conceal the
                # code, profile or form explicitly written in a later row.
                fields[node.get("itemprop")] = value
                carries.pop(node.get("itemprop"), None)
                span = node.get("rowspan", "1")
                if span.isdigit() and int(span) > 1:
                    carries[node.get("itemprop")] = (value, int(span) - 1)
        code = fields.get("eduCode", "")
        title = fields.get("eduName", "")
        level = fields.get("eduLevel", "")
        forms = fields.get("eduForm", "")
        context = row.get("itemprop", "") + " " + (table.get("itemprop", "") if table is not None else "")
        if not re.fullmatch(r"\d{2}\.(?:03|05)\.\d{2}", code) or not title or not level or not forms or "�" in title or len(title) > 450:
            continue
        if re.search(r"edu(?:Priem|Perevod|Stud|Trud|Graduate|Fin|Chislen|Vypusk)|graduate|employment", context, re.I) or any(re.search(r"edu(?:Priem|Perevod|Stud|Trud)|graduate|employment|number", key, re.I) for key in fields):
            continue
        header = clean(" ".join(table.xpath(".//th//text()"))) if table is not None else ""
        if re.search(r"численност|трудоустройств|результат[ыа] при[её]ма", header, re.I):
            continue
        if not (re.search(r"edu(?:Accred|Op)\b", context, re.I) or any(key in fields for key in ["eduPred", "eduPrac", "eduPlan", "educationPlan"]) or re.fullmatch(r"/sveden/education/levels_forms", urlparse(meta["url"]).path)):
            continue
        if not re.search(r"бакалавр|специалитет|специалист|высшее", level, re.I) or not re.search(r"очн|заочн", forms, re.I):
            continue
        profile = fields.get("eduProf") or None
        identity = "|".join([code, title, profile or "", level, forms])
        normalized_identity = tuple(
            clean(value).casefold().replace("ё", "е")
            for value in [code, title, profile or "", level, forms]
        )
        duration = fields.get("eduNorm") or fields.get("eduSrok") or fields.get("learningTerm") or None
        if normalized_identity in seen:
            if duration and normalize_duration(duration) not in {normalize_duration(value) for value in durations[normalized_identity]}:
                durations[normalized_identity].append(duration)
            if len(durations[normalized_identity]) > 1:
                seen[normalized_identity]["duration"] = None
                if issues is not None and normalized_identity not in duration_issues:
                    issue = {"kind": "offering_duration_conflict", "code": code, "title": seen[normalized_identity]["title"], "profile": seen[normalized_identity]["profile"], "level": seen[normalized_identity]["level"], "forms": seen[normalized_identity]["forms"], "values": durations[normalized_identity], **provenance(meta), "sourceYear": None, "note": "Один профиль и форма имеют разные опубликованные сроки в строках по учебным годам. Общий срок оставлен неизвестным; год приёма не подтверждён."}
                    issues.append(issue)
                    duration_issues[normalized_identity] = issue
            continue
        durations[normalized_identity] = [duration] if duration else []
        offering = {"id": university["slug"] + "-official-" + hashlib.sha256(identity.encode()).hexdigest()[:16], "code": code, "title": title, "profile": profile, "level": level, "forms": forms, "duration": duration, "admissionsStatus": "pending_review", **provenance(meta), "sourceYear": None}
        seen[normalized_identity] = offering
        heading = clean(" ".join(table.xpath('preceding::*[self::h2 or self::h3 or self::h4][1]//text()'))) if table is not None else ""
        if heading and re.search(r"образова|программ|бакалавр|специалитет|форм[аы]|уровн", heading, re.I) and not re.search(r"адаптирован|практики|дисциплины", heading, re.I):
            offering["sourceSection"] = heading
        result.append(offering)
    return result


def normalize_duration(value):
    return clean(value).casefold().replace("ё", "е")


def retain_missing_sections(profile, coverage_row):
    """A daily gap batch must not append renamed aliases to a filled section."""
    missing = set(coverage_row["missing"])
    kept = {
        **profile,
        "fields": {key: value for key, value in profile["fields"].items() if key in missing},
        "faculties": profile["faculties"] if "faculties" in missing else [],
        "offerings": profile["offerings"] if "educationalListings" in missing else [],
    }
    omitted = {key: len(profile[key]) - len(kept[key]) for key in ["fields", "faculties", "offerings"]}
    return kept, omitted


def resolve_gap_baseline(output_path, coverage_path, baseline_path=None):
    """A dated gap batch must reproduce independently of later coverage runs."""
    candidate = baseline_path or output_path
    if candidate.exists():
        prior = json.loads(candidate.read_text(encoding="utf-8"))
        baseline = prior.get("gapBaseline")
        if baseline is not None:
            if not isinstance(baseline, dict) or any(
                not isinstance(slug, str) or not isinstance(missing, list)
                or any(not isinstance(section, str) for section in missing)
                for slug, missing in baseline.items()
            ):
                raise ValueError("gapBaseline must map university slugs to missing section names")
            return baseline
        if baseline_path is not None:
            raise ValueError("--gap-baseline file must contain the dated gapBaseline")
    elif baseline_path is not None:
        raise ValueError("--gap-baseline file does not exist")
    coverage = json.loads(coverage_path.read_text(encoding="utf-8"))
    return {row["slug"]: row["missing"] for row in coverage["universities"]}


def review(university):
    slug = university["slug"]
    folder = RAW / slug
    folder.mkdir(parents=True, exist_ok=True)
    base = https(university["website"])
    domains = {host(base)}
    pages, issues = [], []
    output = {"universitySlug": slug, "fields": {}, "faculties": [], "offerings": []}

    def allowed(url):
        return any(host(url) == domain or host(url).endswith("." + domain) for domain in domains)

    def get(url):
        document, metadata = fetch(url, folder)
        pages.append({"universitySlug": slug, **metadata})
        if not allowed(metadata["url"]):
            issues.append({"kind": "external_redirect", "sourceUrl": url, "note": metadata["url"]})
            return None, metadata
        return document, metadata

    homepage, homepage_meta = get(base)
    if homepage is None and TRY_BARE_HOST:
        alternate = bare_host_url(base)
        if alternate:
            alternate_homepage, alternate_meta = get(alternate)
            if alternate_homepage is not None:
                homepage, homepage_meta = alternate_homepage, alternate_meta
    if homepage is not None:
        base = homepage_meta["url"]
    discovered = [(label, link, homepage_meta) for label, link in links(homepage, homepage_meta["url"])] if homepage is not None else []
    sveden_roots = [link.rstrip("/") + "/" for label, link, _ in discovered if re.search(r"/sveden/?$", urlparse(link).path) and allowed(link)]
    common_candidates = [link for _, link, _ in discovered if re.search(r"/sveden/common(?:/|\.|$)", urlparse(link).path)] + [urljoin(root, "common/") for root in sveden_roots] + [urljoin(base, "/sveden/common/"), urljoin(base, "/sveden/common")]
    common = None
    for url in dict.fromkeys(common_candidates):
        if not allowed(url):
            continue
        common, metadata = get(https(url))
        if common is not None:
            fields = common_fields(common, metadata)
            output["fields"].update(fields)
            discovered += [(label, link, metadata) for label, link in links(common, metadata["url"])]
            if fields:
                break
    struct_candidates = [link for _, link, _ in discovered if re.search(r"/sveden/struct(?:/|\.|$)", urlparse(link).path)] + [urljoin(root, "struct/") for root in sveden_roots] + [urljoin(base, "/sveden/struct/")]
    structure_children_seen = set()
    for url in list(dict.fromkeys(struct_candidates))[:2]:
        if not allowed(url):
            continue
        document, metadata = get(https(url))
        if document is not None:
            found = structural_rows(document, metadata, university)
            discovered += [(label, link, metadata) for label, link in links(document, metadata["url"])]
            if found:
                output["faculties"] = found
                break
            # Some disclosure overviews link the actual structure table.
            # Follow only the exact disclosure label on the same domain once.
            children = [link for label, link in links(document, metadata["url"]) if re.fullmatch(r"структура и органы управления образовательной организацией", label, re.I) and allowed(link) and link not in {url, metadata["url"]}]
            for child in list(dict.fromkeys(children))[:2]:
                if child in structure_children_seen:
                    continue
                structure_children_seen.add(child)
                child_document, child_meta = get(https(child))
                if child_document is not None:
                    found = structural_rows(child_document, child_meta, university)
                    if found:
                        output["faculties"] = found
                        break
            if output["faculties"]:
                break
    if not output["faculties"]:
        faculty_candidates = [link for label, link, _ in discovered if re.fullmatch(r"факультеты|факультеты,? институты(?:,? филиалы)?|институты и факультеты|основные подразделения и филиалы КФУ", label, re.I) or re.fullmatch(r"/(?:education/faculties|university/institutes|institutes)/?", urlparse(link).path)]
        for url in list(dict.fromkeys(faculty_candidates))[:2]:
            if not allowed(url):
                continue
            document, metadata = get(https(url))
            if document is not None:
                output["faculties"] = faculty_links(document, metadata, university)
                if output["faculties"]:
                    break
        if not output["faculties"] and homepage is not None and slug == "russia-1507":
            # Main SFU page has an explicitly labeled Institute navigation list.
            output["faculties"] = faculty_links(homepage, homepage_meta, university)
    education_candidates = [link for _, link, _ in discovered if re.search(r"/sveden/education(?:/|\.|$)", urlparse(link).path)] + [urljoin(root, "education/") for root in sveden_roots] + [urljoin(base, "/sveden/education/"), urljoin(base, "/sveden/education")]
    education_seen = set()
    offering_seen = set()
    for url in list(dict.fromkeys(education_candidates))[:2]:
        if not allowed(url):
            continue
        document, metadata = get(https(url))
        if document is not None:
            documents = [(document, metadata)]
            if not document.xpath('//tr[@itemprop="eduAccred"][.//*[@itemprop="eduForm"]]'):
                child_links = [link for link in education_overview_links(document, metadata["url"]) if allowed(link)]
                for child in list(dict.fromkeys(child_links))[:6]:
                    if child in education_seen:
                        continue
                    education_seen.add(child)
                    child_document, child_meta = get(https(child))
                    if child_document is not None:
                        documents.append((child_document, child_meta))
            for source_document, source_meta in documents:
                for offering in offerings(source_document, source_meta, university, issues):
                    key = tuple(clean(offering.get(field) or "").casefold().replace("ё", "е") for field in ["code", "title", "profile", "level", "forms"])
                    if key not in offering_seen:
                        output["offerings"].append(offering)
                        offering_seen.add(key)
            if output["offerings"]:
                break
    if output["fields"]:
        object_candidates = [link for _, link, _ in discovered if re.search(r"/sveden/objects/?$", urlparse(link).path) and allowed(link)]
        for url in list(dict.fromkeys(object_candidates))[:1]:
            document, metadata = get(https(url))
            if document is not None:
                output["fields"].update(hostel_fields(document, metadata, issues))
    admission_candidates = [(label, link) for label, link, _ in discovered if re.fullmatch(r"(?:абитуриент(?:у|ам|ы)?|поступающим|поступающему|поступить в СКФУ|поступление|при[её]мная комиссия|при[её]мная кампания(?: 2026)?|бакалавриат и специалитет)", label, re.I) and allowed(link)]
    for _, url in list(dict.fromkeys(admission_candidates))[:1]:
        document, metadata = get(https(url))
        if document is not None:
            output["fields"]["admissionsUrl"] = {"value": metadata["url"], **provenance(metadata)}
    for category in ["faculties", "offerings"]:
        if not output[category]:
            issues.append({"kind": category + "_unresolved", "note": "Однозначный официальный перечень не подтверждён в доступных страницах этой партии; требуется продолжение проверки."})
    if not output["fields"]:
        issues.append({"kind": "common_fields_unresolved", "note": "Основные сведения не подтверждены в доступной структурированной странице."})
    if slug in UNCERTAIN_UNITS:
        issues.append({"kind": "academic_unit_scope_unresolved", "note": "Из учебных подразделений консервативно исключены единицы, для которых в этой партии не подтверждено высшее образование: " + "; ".join(sorted(UNCERTAIN_UNITS[slug]))})
    dump(folder / "parsed.json", output)
    print(slug, "fields", len(output["fields"]), "faculties", len(output["faculties"]), "offerings", len(output["offerings"]), flush=True)
    return output, pages, [{"universitySlug": slug, **issue} for issue in issues]


def main():
    global CHECKED_AT, OFFLINE, REFRESH, RAW, OUT, YEAR, TRY_BARE_HOST
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checked-at", required=True)
    parser.add_argument("--offline", action="store_true", help="Reparse collected evidence and defer newly discovered URLs")
    parser.add_argument("--collection-date", default="2026-10-09", help="Date used for the current source year and new dated snapshots")
    parser.add_argument("--refresh", action="store_true", help="Fetch again instead of using cached evidence; prefer a new --collection-date for a daily batch")
    parser.add_argument("--try-bare-host", action="store_true", help="If a www homepage fails, try HTTPS on the same official domain without www; keep both source attempts")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--monitoring-ids", help="Comma-separated exact Ministry monitoring IDs for this dated batch")
    parser.add_argument("--gaps-only", action="store_true", help="Retain only sections marked missing in repository coverage.json; keep previously filled sections intact")
    parser.add_argument("--gap-baseline", type=Path, help="Reuse the frozen gapBaseline from a dated batch, for example when reproducing into another output path")
    args = parser.parse_args()
    CHECKED_AT = args.checked_at
    OFFLINE = args.offline
    REFRESH = args.refresh
    TRY_BARE_HOST = args.try_bare_host
    if OFFLINE and REFRESH:
        raise ValueError("--offline and --refresh cannot be combined")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.collection_date):
        raise ValueError("--collection-date must be YYYY-MM-DD")
    YEAR = int(args.collection_date[:4])
    RAW = args.cache_dir or ROOT / ("tmp/russia-research/regional-enrichment-" + args.collection_date)
    OUT = args.output or ROOT / ("data-sources/russia/regional-enrichment-" + args.collection_date + ".json")
    validate_checked_at(CHECKED_AT)
    universities = json.loads((ROOT / "data-sources/russia/universities.json").read_text(encoding="utf-8"))["universities"]
    target_ids = args.monitoring_ids.split(",") if args.monitoring_ids else TARGET_IDS
    if any(not re.fullmatch(r"\d+", monitoring_id) for monitoring_id in target_ids):
        raise ValueError("--monitoring-ids must contain only comma-separated numeric IDs")
    targets = [row for row in universities if row["directory"]["monitoringId"] in target_ids]
    missing = set(target_ids) - {row["directory"]["monitoringId"] for row in targets}
    if missing:
        raise ValueError("Monitoring IDs absent from the sourced national roster: " + ",".join(sorted(missing)))
    if args.gap_baseline and not args.gaps_only:
        raise ValueError("--gap-baseline requires --gaps-only")
    gap_baseline = {}
    if args.gaps_only:
        baseline = resolve_gap_baseline(OUT, ROOT / "data-sources/russia/coverage.json", args.gap_baseline)
        for university in targets:
            slug = university["slug"]
            if slug not in baseline:
                raise ValueError("--gaps-only requires baseline coverage for " + slug)
            gap_baseline[slug] = baseline[slug]
    RAW.mkdir(parents=True, exist_ok=True)
    results, failed = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(review, university): university for university in targets}
        for future in concurrent.futures.as_completed(futures):
            try:
                results.append(future.result())
            except Exception as error:
                failed.append({"universitySlug": futures[future]["slug"], "kind": "collector_error", "note": str(error)[:250]})
    profiles = sorted([result[0] for result in results], key=lambda row: row["universitySlug"])
    omitted = []
    if args.gaps_only:
        kept_profiles = []
        for profile in profiles:
            kept, counts = retain_missing_sections(profile, {"missing": gap_baseline[profile["universitySlug"]]})
            kept_profiles.append(kept)
            if any(counts.values()):
                omitted.append({"universitySlug": profile["universitySlug"], **counts})
        profiles = kept_profiles
    sources = [page for _, pages, _ in results for page in pages]
    issues = failed + [issue for _, _, issues in results for issue in issues]
    stats = {"universitiesAttempted": len(targets), "universitiesWithCurrentFields": sum(bool(profile["fields"]) for profile in profiles), "universitiesWithFaculties": sum(bool(profile["faculties"]) for profile in profiles), "fields": sum(len(profile["fields"]) for profile in profiles), "faculties": sum(len(profile["faculties"]) for profile in profiles), "implementedOfferings": sum(len(profile["offerings"]) for profile in profiles), "pagesRequested": sum(source["httpStatus"] != "not_fetched" for source in sources), "discoveredPathsDeferred": sum(source["httpStatus"] == "not_fetched" for source in sources)}
    scope = "Углублённая датированная партия официальных профилей региональных вузов. Перечни подразделений неполные; отсутствие строки не означает отсутствия подразделения. Реализуемые программы не подтверждают приём в конкретном году."
    if args.gaps_only:
        scope += " Включены только недостающие разделы файловой матрицы; уже заполненные разделы сохраняют прежние сведения и происхождение."
    output = {"checkedAt": CHECKED_AT, "sourceYear": YEAR, "scope": scope, "profiles": profiles, "sources": sources, "issues": issues, "alreadyCoveredExcluded": omitted, "stats": stats}
    if args.gaps_only:
        output["gapBaseline"] = gap_baseline
    dump(OUT, output)
    print("COMPLETE", json.dumps(stats), flush=True)


def validate_checked_at(value, now=None):
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", value):
        raise ValueError("Trusted UTC ISO --checked-at required")
    parsed = datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    if parsed > (now or datetime.now(timezone.utc)):
        raise ValueError("--checked-at cannot be in the future")


if __name__ == "__main__":
    main()

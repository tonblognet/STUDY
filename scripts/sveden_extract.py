"""Bulk reader of the mandatory /sveden/ microdata for catalog filling.

Every Russian university publishes «Сведения об образовательной организации»
under /sveden/ with the same itemprop microdata. This script reads it for many
universities in parallel, without a language model, and writes one review per
university in the exact format accepted by scripts/fill_university.py:

    tmp/sveden/<slug>/review.json          sources, fields, faculties, offerings
    tmp/sveden/<slug>/extract-report.json  pages, row locators, exclusions
    tmp/sveden/summary-<UTC stamp>.json    one line per university

Nothing is published. A review becomes a catalog candidate only after
fill_university.py merges it into data-sources/russia/fill-<date>.json
(``--apply`` skips universities already in that daily file; never run it while
another agent writes the same file).

What is read:
  /sveden/common/     fullName, shortName, regDate, address, telephone, email
  /sveden/struct/     academic units (faculties, institutes, schools)
  /sveden/education/  every published level, plus linked program-table pages
  admissions page     admissionsUrl, from an explicit homepage link only
  /sveden/objects/, /sveden/grants/  hostel microdata, kept as an editor note

Rules: HTTPS only; every redirect stays on the university's own domain;
robots.txt is honoured; one request per host at a time with a pause. Every
value is the literal text of its own microdata node and is checked against the
page's visible text by the importer's own parser before the review is written.
Unclear rows are excluded with a reason. Undated fields and academic units
stay in evidence notes because the directory requires a source year. Listings
keep sourceYear=null and admissionsStatus=pending_review: a listing never
proves a current intake.

Usage:
  python -X utf8 scripts/sveden_extract.py hse spbu          selected slugs
  python -X utf8 scripts/sveden_extract.py --queue 50        next 50 «ждёт» rows
  python -X utf8 scripts/sveden_extract.py --all --workers 8
  python -X utf8 scripts/sveden_extract.py --queue 50 --offline   rebuild from cache
  python -X utf8 scripts/sveden_extract.py hse --apply       merge accepted reviews
  python -X utf8 scripts/sveden_extract.py hse --offline --apply --reuse-reviews
"""

import argparse
import codecs
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import threading
import time
from urllib import robotparser
from urllib.parse import urljoin, urlparse

from lxml import html as lxml_html


ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "tmp/sveden"
QUEUE = ROOT / "docs/catalog-fill/QUEUE.md"
USER_AGENT = "Postupai-sveden-reader/1.0 (official-source catalog verification)"
MOSCOW = timezone(timedelta(hours=3))
FIELD_PROPS = ("fullName", "shortName", "regDate", "address", "telephone", "email")
EDU_PROPS = ("eduCode", "eduName", "eduProf", "eduLevel", "eduForm", "learningTerm", "eduNorm", "eduSrok")
DURATION_PROPS = ("learningTerm", "eduNorm", "eduSrok")
# Rows that repeat program codes but describe students, admission results or jobs.
STATS_ROW_PROPS = {"eduChislen", "eduPriem", "eduPerevod", "graduateJob", "eduPr", "eduPrac", "eduNir"}
STATS_HEADER = re.compile(r"численност|трудоустройств|результат\w* при[её]ма|перевод\w*.{0,20}восстановлен|вакантн", re.I)
EMPTY_VALUES = {"", "-", "—", "–", "нет", "отсутствует", "не предусмотрено", "не установлено"}
CHALLENGE = re.compile(r"checking your browser|ddos.guard|just a moment|подтвердите.{0,25}человек|доступ.{0,15}ограничен|enable javascript", re.I)
CODE = re.compile(r"^(\d{2}\.\d{2}\.\d{2}|\d\.\d{1,2}\.\d{1,2})(?!\d)")
ADMISSIONS_LABEL = re.compile(r"^(?:абитуриент(?:ам|у)?|поступающ(?:им|ему)|при[её]мная комиссия|поступление|поступить)$", re.I)
PAGE_DATE = re.compile(
    r"\b(?:дата (?:последнего )?(?:обновления|публикации) (?:страницы|информации|сведений)"
    r"|страница (?:обновлена|опубликована)|сведения (?:обновлены|опубликованы))\s*[:–—-]?\s*"
    r"(?:\d{1,2}[./]\d{1,2}[./](?P<numeric>\d{4})|(?P<iso>\d{4})-\d{2}-\d{2}"
    r"|\d{1,2} (?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря) (?P<words>\d{4}))\b",
    re.I,
)
# Summary pages only; per-program pages repeat rows the summary already has.
EDUCATION_PATH = re.compile(r"/sveden/education/(?:eduaccred|eduop|edu_op|accreditation|programs?|obr[\w-]*|levels[\w-]*|op)(?:/|\.php|\.html?)?$", re.I)
EDUCATION_LABEL = re.compile(r"реализуем\w*.{0,60}программ|образовательн\w* программ|перечень.{0,40}программ|eduop|eduaccred|уровн\w*.{0,30}форм\w*.{0,30}срок", re.I)
EDUCATION_SKIP = re.compile(r"учебн\w* план|календарн|аннотац|методическ|рабоч\w* программ|практик|численност|результат|перевод|приказ|положени|\bдпо\b|дополнительн", re.I)
FILE_LINK = re.compile(r"\.(?:pdf|docx?|xlsx?|rtf|zip|rar|odt|ods|pptx?)(?:$|\?)", re.I)


def clean(value):
    """The importer's own normalization: literals are compared after this."""
    return " ".join(value.split())


def node_text(node):
    return clean(" ".join(node.xpath('.//text()[not(ancestor::script) and not(ancestor::style)]')))


def usable(value):
    return bool(value) and clean(value).casefold() not in EMPTY_VALUES and "�" not in value and "​" not in value


def load_importer():
    spec = importlib.util.spec_from_file_location("fill_university", Path(__file__).with_name("fill_university.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


IMPORTER = load_importer()


def visible_text(text):
    parser = IMPORTER.VisibleText()
    parser.feed(text)
    return IMPORTER.clean(" ".join(parser.parts))


def published_page_year(visible, checked_at):
    """Use a source-labelled page date; unrelated dates and footer years do not qualify."""
    years = {int(next(year for year in match.groups() if year)) for match in PAGE_DATE.finditer(visible)}
    if len(years) == 1:
        year = years.pop()
        if 1900 <= year <= datetime.fromisoformat(checked_at.replace("Z", "+00:00")).year:
            return year
    return None


# --------------------------------------------------------------------------
# Universities and queue


def universities(root=ROOT):
    rows = {}
    moscow = json.loads((root / "data-sources/moscow/universities.json").read_text(encoding="utf-8"))
    for row in moscow if isinstance(moscow, list) else moscow["universities"]:
        rows[row["slug"]] = row
    for row in json.loads((root / "data-sources/russia/universities.json").read_text(encoding="utf-8"))["universities"]:
        rows.setdefault(row["slug"], row)
    return rows


def queue_slugs(text, statuses=("ждёт",)):
    pattern = re.compile(r"^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|.*\|\s*([^|]+?)\s*\|\s*$")
    return [m.group(1) for line in text.splitlines() if (m := pattern.match(line)) and m.group(2) in statuses]


def official_base(website):
    host = (urlparse(website or "").hostname or "").lower().rstrip(".")
    return host.removeprefix("www.") if "." in host else None


def allowed(url, base):
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().rstrip(".")
    return parsed.scheme == "https" and not parsed.username and (host == base or host.endswith("." + base))


# --------------------------------------------------------------------------
# Fetching


def detect_encoding(raw, content_type=""):
    candidates = []
    match = re.search(r"charset\s*=\s*['\"]?([\w-]+)", content_type or "", re.I)
    if match:
        candidates.append(match.group(1))
    head = raw[:4096].decode("ascii", errors="ignore")
    match = re.search(r"<meta[^>]+charset\s*=\s*['\"]?([\w-]+)", head, re.I)
    if match:
        candidates.append(match.group(1))
    for name in candidates + ["utf-8", "cp1251"]:
        try:
            canonical = codecs.lookup(name).name
            raw.decode(canonical)
            return canonical
        except (LookupError, UnicodeDecodeError):
            continue
    return None


class Fetcher:
    """curl-based fetcher: Windows trust store, manual same-domain redirects, cache."""

    def __init__(self, cache, refresh=False, offline=False, delay=1.0, timeout=40, no_proxy=False):
        self.cache, self.refresh, self.offline = cache, refresh, offline
        self.delay, self.timeout, self.no_proxy = delay, timeout, no_proxy
        self.curl = shutil.which("curl.exe") or shutil.which("curl")
        self.lock = threading.Lock()
        self.host_locks, self.last, self.robots = {}, {}, {}
        # A host that timed out or refused once is not retried in this run:
        # geo-blocked sites otherwise cost a full timeout per page.
        self.dead = {}
        # ...unless it has already answered: then one slow page is just one error.
        self.alive = set()

    def paths(self, slug, url):
        stem = self.cache / slug / hashlib.sha256(url.encode()).hexdigest()[:16]
        return stem.with_suffix(".body"), stem.with_suffix(".meta.json"), stem.with_suffix(".headers.txt")

    def host_lock(self, host):
        with self.lock:
            return self.host_locks.setdefault(host, threading.Lock())

    def curl_once(self, url, body, headers, max_time):
        host = urlparse(url).hostname or ""
        with self.host_lock(host):
            wait = self.last.get(host, 0) + self.delay - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            command = [
                self.curl, "-sS", "--max-time", str(max_time), "--connect-timeout", "10",
                "--proto", "=https", "-A", USER_AGENT, "-D", str(headers), "-o", str(body),
                "-w", "%{http_code}", url,
            ]
            if self.no_proxy:
                command[1:1] = ["--noproxy", "*"]
            try:
                run = subprocess.run(command, capture_output=True, timeout=max_time + 10)
            finally:
                self.last[host] = time.monotonic()
        header_text = headers.read_text(encoding="iso-8859-1") if headers.exists() else ""
        status = run.stdout.decode("ascii", errors="replace").strip()
        error = clean(run.stderr.decode("utf-8", errors="replace"))[:300] if run.returncode else None
        return status, header_text, error

    def robots_allows(self, slug, url):
        parsed = urlparse(url)
        root = f"{parsed.scheme}://{parsed.netloc}"
        with self.lock:
            cached = self.robots.get(root)
        if cached is None:
            parser = robotparser.RobotFileParser()
            lines = []
            if not self.offline:
                body, _, headers = self.paths(slug, root + "/robots.txt")
                body.parent.mkdir(parents=True, exist_ok=True)
                try:
                    status, _, error = self.curl_once(root + "/robots.txt", body, headers, 20)
                    if error:
                        with self.lock:
                            if parsed.hostname not in self.alive:
                                self.dead.setdefault(parsed.hostname, "robots.txt: " + error)
                    else:
                        with self.lock:
                            self.alive.add(parsed.hostname)
                        if status == "200" and body.exists():
                            lines = body.read_bytes().decode("utf-8", errors="replace").splitlines()
                except (OSError, subprocess.SubprocessError) as error:
                    with self.lock:
                        self.dead.setdefault(parsed.hostname, "robots.txt: " + str(error))
            parser.parse(lines)
            with self.lock:
                cached = self.robots.setdefault(root, parser)
        return cached.can_fetch(USER_AGENT, url)

    def get(self, slug, requested, base):
        body, meta_path, headers = self.paths(slug, requested)
        if meta_path.exists() and not self.refresh:
            cached = json.loads(meta_path.read_text(encoding="utf-8"))
            if self.offline or not cached.get("error"):
                return cached  # failures are retried on the next online run
        if self.offline:
            return {"requestedUrl": requested, "error": "not_cached"}
        body.parent.mkdir(parents=True, exist_ok=True)
        record = {"requestedUrl": requested, "redirects": []}
        url, seen = requested, set()
        try:
            for hop in range(6):
                if url.startswith("http://") and allowed("https://" + url[7:], base):
                    # Some servers add a slash and drop to HTTP; ask for the
                    # same official URL over HTTPS instead of downgrading.
                    url = "https://" + url[7:]
                    record["redirects"].append({"url": url, "upgradedFromHttp": True})
                if not allowed(url, base):
                    raise ValueError(("redirect_outside_official_domain: " if hop else "not_official_https: ") + url)
                if url in seen:
                    raise ValueError("redirect_loop: " + url)
                seen.add(url)
                if not self.robots_allows(slug, url):
                    raise ValueError("robots_disallowed: " + url)
                host = urlparse(url).hostname
                if host in self.dead:
                    raise ValueError("network: host unreachable earlier in this run (" + self.dead[host][:200] + ")")
                status, header_text, error = self.curl_once(url, body, headers, self.timeout)
                record.update(url=url, httpStatus=status, checkedAt=now())
                record["redirects"].append({"url": url, "httpStatus": status})
                with self.lock:
                    if error and host not in self.alive:
                        self.dead.setdefault(host, error)
                    elif not error:
                        self.alive.add(host)
                if error:
                    raise ValueError("network: " + error)
                if status in {"301", "302", "303", "307", "308"}:
                    locations = re.findall(r"^location:\s*(.+)$", header_text, re.I | re.M)
                    if not locations or hop == 5:
                        raise ValueError("redirect_without_location_or_too_long")
                    url = urljoin(url, locations[-1].strip())
                    continue
                if status != "200":
                    raise ValueError("http_" + status)
                raw = body.read_bytes()
                types = re.findall(r"^content-type:\s*(.+)$", header_text, re.I | re.M)
                content_type = types[-1].strip() if types else ""
                encoding = detect_encoding(raw, content_type)
                if not encoding:
                    raise ValueError("undecodable_body")
                if not re.search(r"html|xml|text", content_type or "text/html", re.I):
                    raise ValueError("not_html: " + content_type)
                text = raw.decode(encoding)
                visible = visible_text(text)
                if len(visible) < 180 or CHALLENGE.search(visible[:2500]):
                    raise ValueError("empty_or_access_challenge")
                record.update(
                    contentType=content_type, encoding=encoding, bodyPath=body.name,
                    sourceSha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw),
                )
                break
        except (ValueError, OSError, subprocess.SubprocessError) as error:
            record.update(error=str(error), checkedAt=record.get("checkedAt") or now())
        meta_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return record


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def document(fetcher, slug, record):
    raw = (fetcher.cache / slug / record["bodyPath"]).read_bytes()
    if hashlib.sha256(raw).hexdigest() != record["sourceSha256"]:
        raise ValueError("cached body SHA-256 mismatch")
    text = raw.decode(record["encoding"])
    markup = re.sub(r"^\s*<\?xml[^>]*\?>", "", text)
    return lxml_html.fromstring(markup, base_url=record["url"]), visible_text(text)


# --------------------------------------------------------------------------
# Extraction


def heading(node, fallback):
    for xpath in ("./caption", "preceding::*[self::h1 or self::h2 or self::h3 or self::h4][1]"):
        found = node.xpath(xpath)
        if found and node_text(found[0]):
            return node_text(found[0])[:300]
    return fallback


def common_fields(doc):
    """Literal microdata values; a labelled two-cell row yields its value cell."""
    result, notes = {}, []
    for prop in FIELD_PROPS:
        nodes = []
        for node in doc.xpath(f'//*[@itemprop="{prop}"]'):
            cells = node.xpath("./td|./th") if node.tag == "tr" else []
            nodes.append(cells[-1] if len(cells) == 2 else node)
        values = []
        for node in nodes:
            if prop == "telephone":
                links = node.xpath('.//a[starts-with(@href,"tel:")]')
                value = node_text(links[0]) if links else node_text(node)
            else:
                value = node_text(node)
            if usable(value) and len(value) <= 800:
                values.append((value, node))
        for value, node in values:
            if prop == "email":
                found = re.findall(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+", value)
                if not found:
                    continue
                value = found[0]
            if prop == "telephone" and not re.search(r"\d.{0,5}\d.{0,5}\d.{0,5}\d.{0,5}\d", value):
                continue
            if prop == "fullName" and not re.search(r"институт|университет|академи|образован|консерватори|семинари|училищ", value, re.I):
                continue
            if prop == "regDate" and not re.search(r"\d{4}", value):
                continue
            result[prop] = {"value": value, "xpath": node.getroottree().getpath(node)}
            others = sorted({v for v, _ in values if v != value})
            if others:
                notes.append({"kind": "field_additional_values", "field": prop, "kept": value, "others": others[:5]})
            break
    return result, notes


def academic(name, university):
    """Teaching units only; administration, research, DPO, branches stay out."""
    if not 8 <= len(name) <= 250 or not re.search(r"\b(?:факультет|институт|школа)\b", name, re.I):
        return False
    if re.search(r"\b(?:центр|ноц|мниц|отдел|управление|департамент|дирекция|совет|кафедра|комиссия|библиотека|колледж|училище|военный|ректор|ректорат|конференция|президиум|нии|научно-исследовательский|лаборатория|филиал\w*)\b", name, re.I):
        return False
    if re.search(r"дополнительн|повышени[яе]|переподготов|довузов|подготовитель|непрерывного образования|среднего профессионального|деканат|отделени[ея]|научно.{0,12}исследов|структур|положени[ея]|факультет[ыа].{0,10}институт|научная школа|общеобразовательная|средняя школа|лицей|интернат|профориентацион|юного|университетская школа|профессионального развития|корпоративный институт|подготовки (?:кадров|научно)|исследован|школьник|подразделение$", name, re.I):
        return False
    own = {(university.get("name") or "").casefold(), ((university.get("directory") or {}).get("legalName") or "").casefold()}
    return name.casefold().strip(' «»"') not in {value.strip(' «»"') for value in own} | {"институт", "высшая школа", "факультет"}


def faculties(doc, page_url, base, university):
    result, seen = [], set()
    titles = [node_text(h1) for h1 in doc.xpath("//h1") if node_text(h1)]
    section = titles[0][:300] if titles else "Структура и органы управления образовательной организацией"
    for element in doc.xpath('//*[@itemprop="name" or @itemprop="divisionName" or @itemprop="structName"]'):
        containers = element.xpath('ancestor::*[contains(@itemprop,"structOrgUprav")][1]') or element.xpath("ancestor::tr[1]")
        if not containers:
            continue
        name = node_text(element)
        if not usable(name) or not academic(name, university) or name.casefold() in seen:
            continue
        seen.add(name.casefold())
        sites = element.xpath(".//a/@href") + containers[0].xpath('.//*[@itemprop="site"]//a/@href')
        url = urljoin(page_url, sites[0].strip()) if sites else None
        if url and not allowed(url, base):
            url = None
        result.append({"name": name, "url": url, "sourceSection": section or "Структура и органы управления", "xpath": element.getroottree().getpath(element)})
    return result


def layout_rows(table):
    """Expand row/col spans so a code spanning several profile rows is kept."""
    carried = {}
    for index, row in enumerate(table.xpath("./tr|./thead/tr|./tbody/tr|./tfoot/tr")):
        slots = {column: cell for column, (cell, _) in carried.items()}
        carried = {column: (cell, left - 1) for column, (cell, left) in carried.items() if left > 1}
        column = 0
        for cell in row.xpath("./th|./td"):
            while column in slots:
                column += 1
            span = int(re.sub(r"\D", "", cell.get("colspan", "1")) or 1)
            rows = int(re.sub(r"\D", "", cell.get("rowspan", "1")) or 1)
            for offset in range(span):
                slots[column + offset] = cell
                if rows > 1:
                    carried[column + offset] = (cell, rows - 1)
            column += span
        yield index, row, [slots[i] for i in sorted(slots)]


def level_family(level):
    text = level.casefold()
    if re.search(r"среднее профессиональн|среднего звена|квалифицированных рабочих|\bспо\b", text):
        return {"spo"}, False
    found = set()
    if "бакалавр" in text:
        found.add("bachelor")
    if re.search(r"специалитет|специалист", text):
        found.add("specialist")
    if "магистр" in text:
        found.add("master")
    if re.search(r"аспирант|адъюнкт|ординатур|ассистентур|научн\w*.{0,20}кадр|высшей квалификации", text):
        found.add("postgraduate")
    # «высшее образование — специалитет, магистратура» is one legal level
    # (273-ФЗ, ст. 10), not a mix: it covers both .05 and .04 codes.
    if found == {"specialist", "master"} and re.search(r"специалитет\s*,\s*магистратура", text):
        return found, False
    if len(found) > 1:
        return found, True
    if not found and "базовое высшее" in text:
        found = {"bachelor", "specialist"}
    elif not found and "специализированное высшее" in text:
        found = {"master", "postgraduate"}
    return found, False


def code_family(code):
    match = re.fullmatch(r"\d{2}\.(\d{2})\.\d{2}", code)
    if match:
        return {"01": "spo", "02": "spo", "03": "bachelor", "04": "master", "05": "specialist",
                "06": "postgraduate", "07": "postgraduate", "08": "postgraduate", "09": "postgraduate"}.get(match.group(1))
    return "postgraduate" if re.fullmatch(r"\d\.\d{1,2}\.\d{1,2}", code) else None


def row_values(nodes):
    values = {}
    for node in nodes:
        prop = node.get("itemprop")
        if prop in EDU_PROPS and prop not in values:
            values[prop] = node_text(node)
    return values


def education_rows(doc, page_url, issues):
    """Program rows of implemented-program tables on one page."""
    candidates = []
    for table_index, table in enumerate(doc.xpath("//table")):
        if not table.xpath('.//*[@itemprop="eduCode"]'):
            continue
        first_row = table.xpath(".//tr[1]")
        header = clean(" ".join(node_text(th) for th in table.xpath(".//th"))) or (node_text(first_row[0]) if first_row else "")
        section = heading(table, "Сведения об образовательной организации — Образование")
        if re.search(r"общественн\w* аккредитац", section, re.I):
            issues.append({"kind": "public_accreditation_table_skipped", "sourceUrl": page_url, "tableIndex": table_index, "section": section})
            continue
        if STATS_HEADER.search(header) or STATS_HEADER.search(section):
            issues.append({"kind": "statistics_table_skipped", "sourceUrl": page_url, "tableIndex": table_index, "section": section})
            continue
        for row_index, row, cells in layout_rows(table):
            if (row.get("itemprop") or "") in STATS_ROW_PROPS or not row.xpath("./td"):
                continue
            nodes = []
            for cell in dict.fromkeys(cells):
                nodes += [cell] + cell.xpath(".//*[@itemprop]")
            if any((node.get("itemprop") or "").startswith("number") for node in nodes):
                continue
            candidates.append((row_values(nodes), section, row.getroottree().getpath(row)))
    for container in doc.xpath('//*[(@itemprop="eduAccred" or @itemprop="eduOp") and not(self::tr) and not(ancestor::table)]'):
        nodes = [container] + container.xpath(".//*[@itemprop]")
        candidates.append((row_values(nodes), heading(container, "Сведения об образовательной организации — Образование"), container.getroottree().getpath(container)))
    rows = []
    for values, section, xpath in candidates:
        match = CODE.match(values.get("eduCode", ""))
        if not match:
            continue
        code, title, level = match.group(1), values.get("eduName", ""), values.get("eduLevel", "")
        locator = {"sourceUrl": page_url, "xpath": xpath, "section": section, "literal": values}
        if not usable(title) or len(title) > 450 or not usable(level):
            issues.append({"kind": "offering_missing_title_or_level", **locator})
            continue
        if re.search(r"филиал", " ".join([title, values.get("eduProf", ""), section]), re.I):
            issues.append({"kind": "offering_other_campus_excluded", **locator})
            continue
        family, ambiguous = level_family(level)
        if ambiguous:
            issues.append({"kind": "offering_ambiguous_level_excluded", **locator})
            continue
        if family and code_family(code) and code_family(code) not in family:
            issues.append({"kind": "offering_code_level_conflict_excluded", **locator})
            continue
        duration = next((values[key] for key in DURATION_PROPS if usable(values.get(key, ""))), None)
        if duration and not re.search(r"год|лет|месяц|мес\.|недел", duration, re.I):
            duration = None
        profile = values.get("eduProf", "")
        # A profile cell that only repeats the direction («31.02.03, Лабораторная
        # диагностика», «Финансы» for Финансы) names no separate profile.
        if usable(profile) and (profile.casefold().startswith(code) or profile.casefold() == title.casefold()):
            profile = ""
        rows.append(({
            "code": code, "title": title,
            "profile": profile if usable(profile) else None,
            "level": level,
            "forms": values["eduForm"] if usable(values.get("eduForm", "")) else None,
            "duration": duration,
            "sourceSection": section,
        }, locator))
    return rows


def deduplicate(rows, issues):
    """Same program identity with different literal levels is excluded entirely."""
    groups = {}
    for row, locator in rows:
        key = tuple(clean(row.get(k) or "").casefold().replace("ё", "е") for k in ("code", "title", "profile", "forms"))
        groups.setdefault(key, []).append((row, locator))
    kept = []
    for entries in groups.values():
        levels = {clean(row["level"]).casefold().replace("ё", "е") for row, _ in entries}
        if len(levels) > 1:
            issues.append({"kind": "offering_level_conflict_excluded", "rows": [locator for _, locator in entries]})
            continue
        durations = {row["duration"] for row, _ in entries if row["duration"]}
        row, locator = dict(entries[0][0]), entries[0][1]
        if len(durations) > 1:
            row["duration"] = None
        kept.append((row, locator))
    return drop_subsumed(kept, issues)


def drop_subsumed(rows, issues):
    """A thinner copy of a program from another table (e.g. an accreditation
    list without form or term) adds nothing next to the full row."""
    def norm(value):
        return clean(value or "").casefold().replace("ё", "е")

    def covers(rich, thin):
        if (norm(rich["code"]), norm(rich["title"])) != (norm(thin["code"]), norm(thin["title"])):
            return False
        if level_family(rich["level"])[0] != level_family(thin["level"])[0]:
            return False
        keys = ("profile", "forms", "duration")
        if any(thin[k] is not None and norm(thin[k]) != norm(rich[k]) for k in keys):
            return False
        return sum(rich[k] is not None for k in keys) > sum(thin[k] is not None for k in keys)

    kept = []
    for row, locator in rows:
        richer = next((other for other, _ in rows if other is not row and covers(other, row)), None)
        if richer:
            issues.append({"kind": "offering_subsumed_by_richer_row", **locator})
        else:
            kept.append((row, locator))
    return kept


def education_links(doc, page_url, base):
    result = []
    for anchor in doc.xpath("//a[@href]"):
        url = urljoin(page_url, anchor.get("href").strip()).split("#")[0]
        label = node_text(anchor)
        if not url or url == page_url or not allowed(url, base) or FILE_LINK.search(url):
            continue
        if "/sveden/" not in urlparse(url).path.lower():
            continue
        # The standard program pages are followed by path: their official
        # labels are long and mention practice, methods and plans.
        by_path = EDUCATION_PATH.search(urlparse(url).path)
        by_label = EDUCATION_LABEL.search(label) and (re.match(r"(?:информация о )?реализуем", label, re.I) or not EDUCATION_SKIP.search(label))
        if (by_path or by_label) and url not in result:
            result.append(url)
    return result


def hostel_note(doc, page_url):
    values = {}
    for node in doc.xpath('//*[starts-with(@itemprop,"hostel")]'):
        value = node_text(node)
        if usable(value) and len(value) <= 600:
            values.setdefault(node.get("itemprop"), value)
    if not values:
        return None
    return {"kind": "hostel_microdata", "sourceUrl": page_url, "values": values,
            "note": "Общежития найдены в микроразметке. Формулировку hostelInfo составляет редактор: наличие общежития не гарантирует место."}


def admissions_link(doc, page_url, base):
    for anchor in doc.xpath("//a[@href]"):
        url = urljoin(page_url, anchor.get("href").strip()).split("#")[0]
        if ADMISSIONS_LABEL.match(node_text(anchor)) and allowed(url, base) and not FILE_LINK.search(url) and url.rstrip("/") != page_url.rstrip("/"):
            return url, node_text(anchor)
    return None, None


# --------------------------------------------------------------------------
# One university


def collect(slug, university, fetcher, max_pages=25):
    base = official_base(university.get("website"))
    report = {"universitySlug": slug, "name": university.get("shortName") or university.get("name"), "website": university.get("website"), "pages": [], "issues": []}
    if not base:
        report["status"] = "no_website"
        return None, report
    root = f"https://{urlparse(university['website']).hostname}"
    sources, fields, facs, offerings = {}, {}, [], []
    issues = report["issues"]

    def page(kind, url):
        record = fetcher.get(slug, url, base)
        report["pages"].append({"kind": kind, **{k: record.get(k) for k in ("requestedUrl", "url", "httpStatus", "error", "bytes")}})
        if record.get("error"):
            return None, None, None
        doc, visible = document(fetcher, slug, record)
        source_id = f"{kind}-{record['sourceSha256'][:8]}"
        year = published_page_year(visible, record["checkedAt"]) if kind in {"common", "struct", "admissions"} else None
        sources.setdefault(source_id, {
            "id": source_id, "url": record["url"], "checkedAt": record["checkedAt"], "sourceYear": year,
            "bodyPath": record["bodyPath"], "encoding": record["encoding"], "visible": visible,
            "sourceSha256": record["sourceSha256"],
        })
        return doc, record["url"], source_id

    doc, url, source = page("common", root + "/sveden/common/")
    if doc is not None:
        found, notes = common_fields(doc)
        issues.extend({**note, "sourceUrl": url} for note in notes)
        for key, row in found.items():
            fields[key] = {"value": row["value"], "source": source, "xpath": row["xpath"]}

    doc, url, source = page("struct", root + "/sveden/struct/")
    if doc is not None:
        for row in faculties(doc, url, base, university):
            facs.append({**row, "source": source})

    pages, rows = 0, []
    pending = [(root + "/sveden/education/", 0)]
    seen = set()
    while pending and pages < max_pages:
        target, depth = pending.pop(0)
        if target in seen:
            continue
        seen.add(target)
        pages += 1
        doc, url, source = page("education", target)
        if doc is None:
            continue
        rows += [({**row, "source": source}, locator) for row, locator in education_rows(doc, url, issues)]
        if depth < 2 and "/sveden/education" in urlparse(url).path.lower():
            pending += [(link, depth + 1) for link in education_links(doc, url, base) if link not in seen]
    pending = [link for link, _ in pending]
    if pending:
        issues.append({"kind": "education_pages_limit", "notFollowed": pending[:20]})
    offerings = deduplicate(rows, issues)

    for kind, path in (("objects", "/sveden/objects/"), ("grants", "/sveden/grants/")):
        doc, url, _ = page(kind, root + path)
        note = hostel_note(doc, url) if doc is not None else None
        if note:
            issues.append(note)
            break

    doc, url, _ = page("home", root + "/")
    if doc is not None:
        link, label = admissions_link(doc, url, base)
        if link:
            adoc, aurl, asource = page("admissions", link)
            if adoc is not None:
                fields["admissionsUrl"] = {"value": aurl, "source": asource, "xpath": f"homepage link «{label}»"}

    review = assemble(slug, base, sources, fields, facs, offerings, issues)
    report["counts"] = {"fields": len(review["profile"]["fields"]), "faculties": len(review["profile"]["faculties"]), "offerings": len(review["profile"]["offerings"])}
    fetched = [p for p in report["pages"] if not p.get("error")]
    if not fetched:
        errors = [p.get("error") or "" for p in report["pages"]]
        if any(re.search(r"curl: \((?:35|60)\)|schannel|SEC_E_", e) for e in errors):
            report["status"] = "tls_untrusted"
        elif any(e.startswith("network:") for e in errors):
            report["status"] = "unreachable"
        elif any(e.startswith(("robots_disallowed", "empty_or_access_challenge", "redirect_outside", "not_official")) for e in errors):
            report["status"] = "blocked"
        else:
            report["status"] = "unreachable"
    elif not review["sources"]:
        report["status"] = "no_microdata"
    elif report["counts"]["fields"] and report["counts"]["offerings"]:
        report["status"] = "ok"
    else:
        report["status"] = "partial"
    return (review if review["sources"] else None), report


def assemble(slug, base, sources, fields, facs, offerings, issues):
    """Keep only literals the importer will find, then let the importer confirm."""
    def present(source, *values):
        visible = sources[source]["visible"]
        return all(value is None or IMPORTER.clean(value) in visible or value == sources[source]["url"] for value in values)

    evidence_sources = set()

    def retain_undated(source_id, **fact):
        source = sources[source_id]
        evidence_sources.add(source_id)
        issues.append({
            "kind": "directory_fact_without_source_year", **fact,
            "sourceUrl": source["url"], "sourceYear": None,
            "checkedAt": source["checkedAt"], "sourceSha256": source["sourceSha256"],
        })

    profile = {"fields": {}, "faculties": [], "offerings": []}
    for key, row in fields.items():
        source = row["source"]
        if not present(source, row["value"]):
            issues.append({"kind": "literal_not_visible_excluded", "field": key, "value": row["value"], "xpath": row["xpath"]})
        elif sources[source]["sourceYear"] is None:
            retain_undated(source, field=key, value=row["value"], xpath=row["xpath"])
        else:
            profile["fields"][key] = {"value": row["value"], "source": source}
    for row in facs:
        source = row["source"]
        if not present(source, row["name"]):
            issues.append({"kind": "literal_not_visible_excluded", "faculty": row["name"], "xpath": row["xpath"]})
        elif sources[source]["sourceYear"] is None:
            retain_undated(source, faculty=row["name"], url=row["url"], sourceSection=row["sourceSection"], xpath=row["xpath"])
        else:
            profile["faculties"].append({k: row[k] for k in ("name", "url", "source", "sourceSection")})
    for row, locator in offerings:
        if present(row["source"], row["code"], row["title"], row["level"], row["profile"], row["forms"], row["duration"]):
            profile["offerings"].append(row)
        else:
            issues.append({"kind": "literal_not_visible_excluded", **locator})
    used = {row["source"] for row in list(profile["fields"].values()) + profile["faculties"] + profile["offerings"]}
    used.update(evidence_sources)
    review = {
        "officialHosts": [base],
        "scope": (
            "Автоматическое чтение обязательной микроразметки раздела «Сведения об образовательной организации» "
            "(/sveden/): общие сведения, учебные подразделения и реализуемые программы всех опубликованных уровней; "
            "ссылка на страницу приёма — только по явной ссылке главной страницы. Перечень не подтверждает текущий приём: "
            "sourceYear строк перечня = null, admissionsStatus = pending_review. Поля и подразделения без даты "
            "публикации или обновления в источнике сохранены в issues. Конкурсы, баллы, места, цены и общежития не добавляются."
        ),
        "sources": [{k: v for k, v in source.items() if k not in {"visible", "sourceSha256"}} for key, source in sources.items() if key in used],
        "profile": profile,
        "issues": compact_issues(issues),
    }
    return review


# Kept one by one in the catalog file; every other exclusion is only counted
# there and stays row by row in tmp/sveden/<slug>/extract-report.json.
EDITOR_ISSUES = {"hostel_microdata", "field_additional_values", "directory_fact_without_source_year", "importer_literal_rejected"}


def compact_issues(issues):
    kept = [issue for issue in issues if issue["kind"] in EDITOR_ISSUES]
    counts = {}
    for issue in issues:
        if issue["kind"] not in EDITOR_ISSUES:
            counts[issue["kind"]] = counts.get(issue["kind"], 0) + 1
    if counts:
        kept.append({"kind": "automatic_exclusions", "counts": dict(sorted(counts.items())),
                     "note": "Строки, исключённые автоматически, с причинами и XPath — в tmp/sveden/<slug>/extract-report.json."})
    return kept


def confirm(slug, review, review_dir):
    """The importer is the final judge; a rejected review is never written as accepted."""
    candidate = deepcopy(review)
    for _ in range(25):
        try:
            IMPORTER.build_profile(slug, candidate, review_dir)
            return candidate, None
        except ValueError as error:
            message = str(error)
            needle = message.split("absent from source: ", 1)[-1] if "absent from source" in message else None
            if not needle:
                return None, message
            profile = candidate["profile"]
            before = len(profile["offerings"]) + len(profile["faculties"]) + len(profile["fields"])
            profile["offerings"] = [r for r in profile["offerings"] if needle not in [r.get(k) for k in ("code", "title", "level", "profile", "forms", "duration")]]
            profile["faculties"] = [r for r in profile["faculties"] if r["name"] != needle]
            profile["fields"] = {k: r for k, r in profile["fields"].items() if r["value"] != needle}
            if len(profile["offerings"]) + len(profile["faculties"]) + len(profile["fields"]) == before:
                return None, message
            candidate["issues"].append({"kind": "importer_literal_rejected", "value": needle})
    return None, "too many importer rejections"


def run_one(slug, catalog, fetcher, max_pages):
    university = catalog.get(slug)
    out = fetcher.cache / slug
    out.mkdir(parents=True, exist_ok=True)
    if not university:
        report = {"universitySlug": slug, "status": "unknown_slug", "pages": [], "issues": []}
        review = None
    else:
        try:
            review, report = collect(slug, university, fetcher, max_pages)
        except Exception as error:  # one broken site never stops the batch
            review, report = None, {"universitySlug": slug, "status": "error", "error": repr(error)[:500], "pages": [], "issues": []}
    review_path = out / "review.json"
    if review:
        accepted, rejection = confirm(slug, review, out)
        if accepted:
            review_path.write_text(json.dumps(accepted, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            report["counts"] = {key: len(accepted["profile"][key]) for key in ("fields", "faculties", "offerings")}
        else:
            report.update(status="importer_rejected", importerError=rejection)
            review_path.unlink(missing_ok=True)
        report["issues"] = report.get("issues", [])  # full row-by-row record stays in the report
    else:
        review_path.unlink(missing_ok=True)
    (out / "extract-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def program_key(code, title, profile, forms):
    """Same program regardless of level wording or batch: the catalog loader
    keys rows by source and date, so a re-read would otherwise duplicate them."""
    def norm(value):
        return clean(value or "").casefold().replace("ё", "е")
    profile = "" if profile and (norm(profile).startswith(code) or norm(profile) == norm(title)) else profile
    return (code, norm(title), norm(profile), norm(forms))


def existing_offerings(slugs, root=ROOT):
    """Listings the catalog already shows, read through the real TS loader."""
    script = root / "tmp/sveden-existing.ts"
    script.parent.mkdir(parents=True, exist_ok=True)
    script.write_text(
        'import { getDirectoryDetails } from "../lib/university-directory-details";\n'
        'import { readFileSync } from "node:fs";\n'
        'const slugs: string[] = JSON.parse(readFileSync(process.argv[2], "utf8"));\n'
        "const out: Record<string, unknown[]> = {};\n"
        "for (const slug of slugs) out[slug] = (getDirectoryDetails(slug)?.offerings ?? []).map((o) => [o.code, o.title, o.profile, o.forms]);\n"
        "console.log(JSON.stringify(out));\n",
        encoding="utf-8",
    )
    request = root / "tmp/sveden-existing-slugs.json"
    request.write_text(json.dumps(slugs), encoding="utf-8")
    node = shutil.which("node") or "node"
    tsx = root / "node_modules/tsx/dist/cli.mjs"
    run = subprocess.run([node, str(tsx), str(script), str(request)], cwd=root, capture_output=True, text=True, encoding="utf-8")
    lines = run.stdout.strip().splitlines()
    result = json.loads(lines[-1]) if run.returncode == 0 and lines else None
    if not isinstance(result, dict):
        raise RuntimeError("Cannot read existing catalog listings: " + (run.stderr or run.stdout)[-500:])
    return result


def load_cached_review(slug, path):
    """Validate an offline-rebuilt review against the response metadata and bytes."""
    try:
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
            raise ValueError("invalid university slug")
        review = json.loads(path.read_text(encoding="utf-8"))
        hashes = {}
        for source in review["sources"]:
            body = source["bodyPath"]
            if not re.fullmatch(r"[0-9a-f]{16}\.body", body) or {"extractText", "textPath"} & source.keys():
                raise ValueError("expected a local extractor response body")
            metadata = json.loads((path.parent / body).with_suffix(".meta.json").read_text(encoding="utf-8"))
            if metadata.get("error") or any(metadata.get(key) != source.get(key) for key in ("url", "bodyPath", "encoding", "checkedAt")):
                raise ValueError("cached response metadata does not match review: " + body)
            hashes[source["id"]] = metadata["sourceSha256"]
        profile, sources = IMPORTER.build_profile(slug, review, path.parent)
        for source in sources:
            if source["sourceSha256"] != hashes[source["id"].split(":", 1)[1]]:
                raise ValueError("cached response SHA-256 mismatch: " + source["url"])
    except (AttributeError, KeyError, OSError, TypeError, ValueError) as error:
        raise ValueError(f"Cannot reuse cached review for {slug}: {error}") from error
    return review, profile, sources


def write_daily(output, daily):
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.write_text(json.dumps(daily, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(output)


def apply_reviews(slugs, cache, output, existing=None, *, reuse_reviews=False):
    daily = json.loads(output.read_text(encoding="utf-8")) if output.exists() else None
    already_applied = {profile["universitySlug"] for profile in daily["profiles"]} if daily else set()
    ready = [slug for slug in dict.fromkeys(slugs) if slug not in already_applied and (reuse_reviews or (cache / slug / "review.json").exists())]
    rebuilt = {slug: load_cached_review(slug, cache / slug / "review.json") for slug in ready} if reuse_reviews else {}
    if existing is None:
        existing = existing_offerings(ready) if ready else {}
    applied = []
    for slug in ready:
        path = cache / slug / "review.json"
        if reuse_reviews:
            review, profile, sources = rebuilt[slug]
            data = profile
        else:
            review = json.loads(path.read_text(encoding="utf-8"))
            data = review["profile"]
        known = {program_key(*row) for row in existing.get(slug, [])}
        offerings = data["offerings"]
        fresh = [row for row in offerings if program_key(row["code"], row["title"], row["profile"], row["forms"]) not in known]
        if len(fresh) < len(offerings):
            data["offerings"] = fresh
            review["issues"].append({"kind": "offerings_already_in_catalog", "count": len(offerings) - len(fresh),
                                     "note": "Строки, которые карточка уже показывает (то же направление, профиль и форма), не добавлены повторно."})
        if not reuse_reviews:
            profile, sources = IMPORTER.build_profile(slug, review, path.parent)
        daily = IMPORTER.merge_daily(daily, slug, review, profile, sources)
        if not reuse_reviews:
            write_daily(output, daily)
        applied.append(slug)
    if reuse_reviews and applied:
        write_daily(output, daily)
    return applied


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("slugs", nargs="*")
    parser.add_argument("--queue", type=int, metavar="N", help="next N «ждёт» rows of docs/catalog-fill/QUEUE.md")
    parser.add_argument("--all", action="store_true", help="every «ждёт» row of the queue")
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--delay", type=float, default=1.0, help="seconds between requests to one host")
    parser.add_argument("--timeout", type=int, default=40)
    parser.add_argument("--max-pages", type=int, default=25, help="education pages per university")
    parser.add_argument("--refresh", action="store_true", help="refetch even when cached")
    parser.add_argument("--offline", action="store_true", help="rebuild from cache, no network")
    parser.add_argument("--no-proxy", action="store_true", help="bypass HTTP(S)_PROXY for university sites")
    parser.add_argument("--cache-dir", type=Path, default=CACHE)
    parser.add_argument("--apply", action="store_true", help="merge accepted reviews via fill_university.py")
    parser.add_argument("--reuse-reviews", action="store_true", help="verify and apply already rebuilt offline reviews without extracting pages again")
    parser.add_argument("--output", type=Path, help="daily file for --apply")
    args = parser.parse_args()

    if args.reuse_reviews:
        if not (args.offline and args.apply and args.slugs) or args.all or args.queue is not None or args.refresh:
            parser.error("--reuse-reviews requires explicit slugs with --offline --apply")
        output = args.output or ROOT / f"data-sources/russia/fill-{IMPORTER.moscow_batch_date()}.json"
        try:
            applied = apply_reviews(args.slugs, args.cache_dir, output, reuse_reviews=True)
        except (OSError, RuntimeError, ValueError) as error:
            parser.exit(1, f"{error}\n")
        print("applied:", ", ".join(applied) or "nothing", "→", output)
        return

    slugs = list(args.slugs)
    if args.queue or args.all:
        queued = queue_slugs(QUEUE.read_text(encoding="utf-8"))
        slugs += queued if args.all else queued[: args.queue]
    slugs = list(dict.fromkeys(slugs))
    if not slugs:
        parser.error("name slugs, --queue N or --all")
    catalog = universities()
    fetcher = Fetcher(args.cache_dir, args.refresh, args.offline, args.delay, args.timeout, args.no_proxy)
    started = now()
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        reports = []
        for report in pool.map(lambda slug: run_one(slug, catalog, fetcher, args.max_pages), slugs):
            counts = report.get("counts", {})
            print(f"{report['universitySlug']:<18} {report.get('status', '?'):<17} поля {counts.get('fields', 0):>2}  подразд. {counts.get('faculties', 0):>3}  программ {counts.get('offerings', 0):>4}", flush=True)
            reports.append(report)
    totals = {
        "universities": len(reports),
        "withReview": sum(1 for r in reports if (args.cache_dir / r["universitySlug"] / "review.json").exists()),
        "byStatus": {status: sum(1 for r in reports if r.get("status") == status) for status in sorted({r.get("status") for r in reports})},
        "fields": sum(r.get("counts", {}).get("fields", 0) for r in reports),
        "faculties": sum(r.get("counts", {}).get("faculties", 0) for r in reports),
        "offerings": sum(r.get("counts", {}).get("offerings", 0) for r in reports),
    }
    summary = {"startedAt": started, "finishedAt": now(), "totals": totals,
               "universities": [{k: r.get(k) for k in ("universitySlug", "name", "status", "counts", "error", "importerError")} for r in reports]}
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    stamp = re.sub(r"[:.]", "-", started)
    (args.cache_dir / f"summary-{stamp}.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(totals, ensure_ascii=False), flush=True)
    if args.apply:
        day = datetime.now(timezone.utc).astimezone(MOSCOW).date().isoformat()
        output = args.output or ROOT / f"data-sources/russia/fill-{day}.json"
        print("applied:", ", ".join(apply_reviews(slugs, args.cache_dir, output)) or "nothing", "→", output)


if __name__ == "__main__":
    main()

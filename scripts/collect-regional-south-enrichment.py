"""Dated southern/far-eastern batch using the shared official-source collector.

VVGU marks its implementation overview on the table, not each row. Read only
that explicitly linked overview; never its student-count or cohort-plan tables.
All other universities keep the shared parser and the same gap-only policy.
CLI arguments are identical to collect-regional-enrichment.py.
"""

import hashlib
import importlib.util
from pathlib import Path
import re
from urllib.parse import urlparse


SPEC = importlib.util.spec_from_file_location(
    "regional_enrichment", Path(__file__).with_name("collect-regional-enrichment.py")
)
base = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(base)
SHARED_OFFERINGS = base.offerings
SHARED_OVERVIEW_LINKS = base.education_overview_links
SHARED_STRUCTURAL_ROWS = base.structural_rows
SHARED_REVIEW = base.review

UNCERTAIN_VVGU_UNITS = {
    "Институт подготовки иностранных граждан",
    "Институт военно-патриотического воспитания",
    "Институт постдипломного образования",
}


def vvsu_overview(url):
    parsed = urlparse(url)
    return base.host(url) == "vvsu.ru" and parsed.path == "/sveden/education/1/"


def education_overview_links(document, url):
    result = SHARED_OVERVIEW_LINKS(document, url)
    if base.host(url) == "vvsu.ru" and urlparse(url).path.rstrip("/") == "/sveden/education":
        for label, target in base.links(document, url):
            if vvsu_overview(target) and label == "Информация о сроке действия государственной аккредитации, о языках, на которых осуществляется образование (обучение)":
                result.append(target)
    return list(dict.fromkeys(result))


def offerings(document, metadata, university, issues=None):
    if university["slug"] != "russia-28" or not vvsu_overview(metadata["url"]):
        return SHARED_OFFERINGS(document, metadata, university, issues)
    result, seen, durations, duration_issues = [], {}, {}, {}
    for table in document.xpath('//table[@itemprop="eduAccred"]'):
        carries = {}
        header = base.clean(" ".join(table.xpath(".//th//text()")))
        if re.search(r"численност|трудоустройств|результат[ыа] при[её]ма", header, re.I):
            continue
        for row in table.xpath(".//tr"):
            if row.xpath("ancestor::table[1]")[0] is not table:
                continue
            fields = {key: value for key, (value, remaining) in carries.items()}
            carries = {key: (value, remaining - 1) for key, (value, remaining) in carries.items() if remaining > 1}
            for node in row.xpath(".//*[@itemprop]"):
                value = base.clean(node.text_content())
                prop = node.get("itemprop")
                if value:
                    fields[prop] = value
                    carries.pop(prop, None)
                    span = node.get("rowspan", "1")
                    if span.isdigit() and int(span) > 1:
                        carries[prop] = (value, int(span) - 1)
            code, title, level, forms = (fields.get(key, "") for key in ["eduCode", "eduName", "eduLevel", "eduForm"])
            if not re.fullmatch(r"\d{2}\.(?:03|04|05)\.\d{2}", code) or not title or not level or not forms:
                continue
            if "�" in title + level + forms or len(title) > 450:
                continue
            if not re.search(r"бакалавр|магистрат|специалитет|специалист|высшее", level, re.I) or not re.search(r"очн|заочн", forms, re.I):
                continue
            if re.search(r"среднее профессиональн|дополнительн|аспирант|ординат|ассистент", level, re.I):
                continue
            profile = fields.get("eduProf") or None
            values = [code, title, profile or "", level, forms]
            identity = tuple(base.clean(value).casefold().replace("ё", "е") for value in values)
            duration = fields.get("learningTerm") or fields.get("eduNorm") or fields.get("eduSrok") or None
            if identity in seen:
                if duration and base.normalize_duration(duration) not in {base.normalize_duration(value) for value in durations[identity]}:
                    durations[identity].append(duration)
                if len(durations[identity]) > 1:
                    seen[identity]["duration"] = None
                    if issues is not None and identity not in duration_issues:
                        issue = {"kind": "offering_duration_conflict", "code": code, "title": title, "profile": profile, "level": level, "forms": forms, "values": durations[identity], **base.provenance(metadata), "sourceYear": None, "note": "Одинаковая программа и форма имеют разные сроки в официальном обзоре; общий срок оставлен неизвестным."}
                        issues.append(issue)
                        duration_issues[identity] = issue
                continue
            durations[identity] = [duration] if duration else []
            entry = {"id": university["slug"] + "-official-" + hashlib.sha256("|".join(values).encode()).hexdigest()[:16], "code": code, "title": title, "profile": profile, "level": level, "forms": forms, "duration": duration, "admissionsStatus": "pending_review", **base.provenance(metadata), "sourceYear": None}
            seen[identity] = entry
            result.append(entry)
    return result


def structural_rows(document, metadata, university):
    rows = SHARED_STRUCTURAL_ROWS(document, metadata, university)
    excluded = {issue["name"] for issue in other_city_unit_issues(document, metadata, university)}
    rows = [row for row in rows if row["name"] not in excluded]
    for row in rows:
        if row.get("url"):
            row["url"] = row["url"].strip()
    return rows


def other_city_unit_issues(document, metadata, university):
    """Keep the disclosed Ussuriysk unit out of the Vladivostok card."""
    if university["slug"] != "russia-28" or document is None:
        return []
    result = []
    for row in document.xpath('//tr[@itemprop="structOrgUprav"]'):
        names = row.xpath('.//*[@itemprop="name"]')
        addresses = row.xpath('.//*[@itemprop="addressStr"]')
        name = base.clean(names[0].text_content()) if names else ""
        address = base.clean(addresses[0].text_content()) if addresses else ""
        if name == "Педагогический институт" and re.search(r"\bУссурийск\b", address):
            result.append({"universitySlug": university["slug"], "kind": "other_city_unit_excluded", "name": name, "publishedAddress": address, **base.provenance(metadata), "note": "Подразделение опубликовано в Уссурийске и не добавлено в список учебных подразделений владивостокской карточки. Это ограничение географического охвата, а не отсутствие подразделения или высшего образования; нужна отдельная проверка кампуса."})
    return result


def review(university):
    output, pages, issues = SHARED_REVIEW(university)
    if university["slug"] == "russia-28":
        for metadata in pages:
            if urlparse(metadata["url"]).path.rstrip("/") != "/sveden/struct" or metadata.get("httpStatus") != "200" or metadata.get("exitCode"):
                continue
            digest = hashlib.sha256(metadata["requestedUrl"].encode()).hexdigest()[:16]
            raw = (base.RAW / university["slug"] / (digest + ".html")).read_bytes()
            if hashlib.sha256(raw).hexdigest() != metadata["sourceSha256"]:
                raise ValueError("Structure evidence SHA-256 mismatch")
            issues.extend(other_city_unit_issues(base.tree(raw), metadata, university))
    return output, pages, issues


def install_overrides():
    base.UNCERTAIN_UNITS["russia-28"] = UNCERTAIN_VVGU_UNITS
    base.education_overview_links = education_overview_links
    base.offerings = offerings
    base.structural_rows = structural_rows
    base.review = review


if __name__ == "__main__":
    install_overrides()
    base.main()

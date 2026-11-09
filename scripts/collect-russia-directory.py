"""Collect a dated, historical directory from Ministry monitoring 2025.

This source is not an admissions campaign or a license registry. The collector
creates no admissions programs and does not infer dormitories or military centers.
Raw responses remain in ignored tmp/russia-research, with hashes in provenance.
Requires Python 3.12 and lxml. Supply a trusted UTC --checked-at timestamp.
"""

import argparse
import concurrent.futures
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import parse_qs, urljoin, urlparse

from lxml import html


BASE = "https://monitoring.miccedu.ru/"
INDEX_URL = BASE + "?m=vpo&year=2025"
PROFILE_BASE = BASE + "iam/2025/_vpo/inst.php?id="
CACHE = Path("tmp/russia-research")
OUTPUT = Path("data-sources/russia")
DISTRICTS = {
    "ЦФО": "Центральный федеральный округ",
    "СЗФО": "Северо-Западный федеральный округ",
    "ПФО": "Приволжский федеральный округ",
    "ЮФО": "Южный федеральный округ",
    "СКФО": "Северо-Кавказский федеральный округ",
    "УФО": "Уральский федеральный округ",
    "СФО": "Сибирский федеральный округ",
    "ДФО": "Дальневосточный федеральный округ",
}
STATE_AUTHORITIES = {
    "Министерство науки и высшего образования Российской Федерации",
    "Правительство Российской Федерации",
    "Министерство сельского хозяйства Российской Федерации",
    "Министерство здравоохранения Российской Федерации",
    "Муниципалитеты и субъекты РФ",
    "Министерство просвещения Российской Федерации",
    "Министерство культуры Российской Федерации",
    "Федеральное агентство железнодорожного транспорта",
    "Федеральное агентство морского и речного транспорта",
    "Министерство спорта Российской Федерации",
    "Министерство юстиции Российской Федерации",
    "Верховный суд Российской Федерации",
    "Министерство цифрового развития, связи и массовых коммуникаций Российской Федерации",
    "Федеральное агентство по рыболовству",
    "Федеральная таможенная служба",
    "Федеральное агентство воздушного транспорта",
    "Министерство иностранных дел Российской Федерации",
    "Федеральная служба по интеллектуальной собственности",
    "Министерство экономического развития Российской Федерации",
}
NOTE = (
    "Наименование, адрес, сайт и ведомственная принадлежность — по мониторингу "
    "Минобрнауки 2025, обновлённому 3 февраля 2026 года. Это историческая "
    "справочная запись, а не подтверждение действующего приёма. Статус лицензии, "
    "аккредитация, факультеты и условия приёма требуют отдельной проверки."
)


def clean(value):
    return " ".join(value.split())


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def fetch(url, filename, checked_at, refresh=False):
    path = CACHE / filename
    metadata_path = path.with_suffix(path.suffix + ".meta.json")
    if path.exists() and metadata_path.exists() and not refresh:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata.get("httpStatus") == "200" and metadata.get("exitCode") == 0:
            return path, metadata
    run = subprocess.run(
        [
            "curl.exe", "-sS", "-L", "--max-time", "30", "--connect-timeout", "8",
            "--proto", "=http,https", "-A", "Mozilla/5.0", "-o", str(path),
            "-w", "%{http_code}\n%{url_effective}", url,
        ],
        capture_output=True,
        timeout=35,
    )
    parts = [part.strip() for part in run.stdout.decode("utf-8", errors="replace").strip().split("\n")]
    metadata = {
        "sourceUrl": url,
        "url": parts[-1] if len(parts) > 1 else url,
        "httpStatus": parts[0] if parts else "000",
        "exitCode": run.returncode,
        "checkedAt": checked_at,
    }
    if path.exists():
        metadata["sourceSha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    if run.returncode:
        metadata["error"] = run.stderr.decode("utf-8", errors="replace")[:300]
    dump(metadata_path, metadata)
    return path, metadata


def page(path, metadata):
    if metadata["httpStatus"] != "200" or metadata["exitCode"]:
        raise ValueError("source_http_error: " + json.dumps(metadata, ensure_ascii=False))
    raw = path.read_bytes()
    encoding = "windows-1251" if re.search(br"charset=['\"\s]*windows-1251", raw[:16000], re.I) else "utf-8"
    return html.fromstring(raw.decode(encoding, errors="replace"))


def city_name(raw):
    # Strip source settlement type without assigning a region capital to a branch.
    return re.sub(r"^(?:г\.?\s*|город\s+)", "", clean(raw), flags=re.I)


def address_city(source_city, address):
    """Resolve only explicit municipality text, never the region's capital."""
    settlement = re.sub(r"^(?:г\.?|город|пгт\.?|рп\.?|п\.?|с\.?|д\.?|х\.?)\s*", "", source_city, flags=re.I)
    if settlement.casefold().replace("ё", "е") in address.casefold().replace("ё", "е"):
        return city_name(source_city), False
    # A settlement explicitly nested in an urban municipality is the more precise
    # location (e.g. г Солнечногорск, рп Менделеево).
    settlement_marker = re.search(r"(?:^|[,\s])(рп\.?|пгт\.?|пос(?:елок)?\.?|д(?:еревня)?\.?)\s+([А-ЯЁ][^,;]+)", address, re.I)
    if settlement_marker:
        return clean(settlement_marker[1] + " " + settlement_marker[2]), True
    marker = re.search(
        r"(?:^|[,\s])(?:город\s+|г\.\s*(?!о\.)|г\s+)([А-ЯЁA-Z][^,;]+)", address,
        re.I,
    )
    if marker:
        named_city = re.split(r"\s+(?:ул(?:ица)?\.?|проспект|пр-кт|пер(?:еулок)?\.?)\s+", marker[1], flags=re.I)[0].strip()
        if named_city and len(named_city) < 80:
            if named_city.isupper():
                named_city = named_city.title()
            return named_city, True
    return city_name(source_city), False


def display_name(legal_name, kind):
    if kind == "branch":
        return legal_name
    # Presentation normalization only; the exact legal name remains in provenance.
    prefix = re.compile(
        r"^(?:(?:федеральное|государственное|автономная|автономное|негосударственное|"
        r"некоммерческое|частное|бюджетное|муниципальное|образовательное|казенное|"
        r"аккредитованное|частная|некоммерческая|религиозная)\s+)+"
        r"(?:образовательная\s+)?(?:учреждение|организация)\s+"
        r"(?:(?:высшего|профессионального|высшего профессионального)\s+образования\s+)?",
        re.I,
    )
    title = prefix.sub("", legal_name).strip()
    # Remove only one enclosing pair: nested quotes belong to the published name.
    quote_pairs = {'"': '"', '«': '»'}
    if len(title) >= 2 and quote_pairs.get(title[0]) == title[-1]:
        opener, closer = title[0], title[-1]
        balanced = (
            title.count(opener) % 2 == 0
            if opener == closer
            else title.count(opener) == title.count(closer)
        )
        if balanced:
            title = title[1:-1].strip()
    return title or legal_name


def collect_region(region, checked_at, refresh):
    path, metadata = fetch(region["sourceUrl"], "region-" + region["id"] + ".html", checked_at, refresh)
    document = page(path, metadata)
    rows = []
    for cell in document.xpath('//td[@class="inst"][a]'):
        link = cell.xpath('./a[contains(@href,"inst.php?id=")]')
        if not link:
            continue
        monitoring_id = parse_qs(urlparse(link[0].get("href")).query)["id"][0]
        address_nodes = cell.xpath('./div[contains(@class,"inst_add")]/div[@class="adr"]/p[2]')
        rows.append({
            "monitoringId": monitoring_id,
            "legalName": clean(link[0].text_content()),
            "sourceCity": clean(cell.get("city", "")),
            "listAddress": clean(address_nodes[0].text_content()) if address_nodes else "",
            "kind": "branch" if cell.get("icon") == "_0" else "university" if cell.get("icon") == "_2" else "unknown",
            "sourceIcon": cell.get("icon"),
            "region": region["name"],
            "federalDistrict": region["federalDistrict"],
            "listSourceUrl": region["sourceUrl"],
            "listSourceSha256": metadata["sourceSha256"],
        })
    if not rows and "0организаци" not in clean(document.text_content()):
        # Empty source tables remain explicit report evidence, not a fabricated roster.
        region["note"] = "В опубликованной региональной таблице не найдены строки организаций."
    return region, metadata, rows


def website_url(raw):
    candidates = re.findall(r"(?:https?://|www\.)[^\s;,<>]+", raw, flags=re.I)
    if not candidates:
        if "@" in raw:
            return None
        # Some Ministry entries publish only a host name. Add a URL scheme for
        # linking; the source's literal value is retained in the collection audit.
        candidates = re.findall(r"(?:[a-zа-яё0-9_-]+\.)+[a-zа-яё]{2,}(?:/[^\s;,<>]*)?", raw, flags=re.I)
    for candidate in candidates:
        candidate = candidate.rstrip(".\"')")
        if not candidate.lower().startswith(("http://", "https://")):
            candidate = "http://" + candidate
        parsed = urlparse(candidate)
        if parsed.scheme in ("http", "https") and parsed.hostname and "." in parsed.hostname and not parsed.username and not parsed.password:
            return candidate
    return None


def collect_institution(row, checked_at, refresh):
    monitoring_id = row["monitoringId"]
    source_url = PROFILE_BASE + monitoring_id
    path, metadata = fetch(source_url, "inst-" + monitoring_id + ".html", checked_at, refresh)
    document = page(path, metadata)
    fields = {}
    for tr in document.xpath("//tr[td[@class='tt']]"):
        cells = tr.xpath("./td")
        if len(cells) == 2:
            # Branch pages append a second table describing the parent. Preserve
            # the first organization's identity instead of replacing the branch.
            fields.setdefault(clean(cells[0].text_content()), clean(cells[1].text_content()))
    legal_name = fields.get("Наименование образовательной организации", "")
    address_node = document.xpath('//*[@id="post"]')
    address = clean(address_node[0].text_content()) if address_node else ""
    authority = fields.get("Ведомственная принадлежность", "")
    raw_site = fields.get("web-сайт", "")
    website = website_url(raw_site)
    if not legal_name or not address or not authority or not website:
        raise ValueError("incomplete_profile: " + json.dumps({"name": legal_name, "address": address, "authority": authority, "websiteAsPublished": raw_site}, ensure_ascii=False))
    if re.fullmatch(r"\d{6}", address) or re.match(r"https?://", address):
        raise ValueError("invalid_or_incomplete_source_address: " + address)
    if row["kind"] == "unknown":
        raise ValueError("unmapped_kind_icon: " + str(row["sourceIcon"]))
    source_city, city_corrected = address_city(row["sourceCity"], address)
    if not source_city:
        raise ValueError("missing_explicit_city")
    # Ownership is read from the Ministry's explicit authority category.
    if authority == "Частные организации":
        ownership = "private"
    elif authority in STATE_AUTHORITIES:
        ownership = "state"
    else:
        raise ValueError("unmapped_source_authority: " + authority)
    areas = []
    for cell in document.xpath('//table[@id="analis_reg"]//tr/td[1]'):
        match = re.fullmatch(r"(\d{2}\.00\.00)\s*-\s*(.+)", clean(cell.text_content()))
        if match:
            areas.append({"code": match[1], "title": match[2], "sourceUrl": source_url, "sourceYear": 2025, "checkedAt": metadata["checkedAt"]})
    name = display_name(legal_name, row["kind"])
    description = "Справочная запись организации высшего образования из мониторинга Минобрнауки 2025."
    if areas:
        titles = ", ".join(area["title"].lower() for area in areas[:4])
        description += " Области подготовки по мониторингу: " + titles + (" и другие." if len(areas) > 4 else ".")
    slug = "russia-" + monitoring_id
    university = {
        "id": slug, "slug": slug, "shortName": name, "name": name,
        "color": "#355b7e", "description": description, "city": source_city,
        "address": address, "website": website, "programsCount": 0,
        # Required legacy field points to evidence; there is deliberately no logoUrl.
        "logoSourceUrl": source_url,
        "militaryCenter": None, "factsSourceUrl": source_url,
        "directory": {
            "monitoringId": monitoring_id, "sourceUrl": source_url, "sourceYear": 2025,
            "checkedAt": metadata["checkedAt"], "ownership": ownership,
            "kind": row["kind"], "legalName": legal_name, "authority": authority,
            "websiteSourceUrl": source_url, "addressSourceUrl": source_url,
            "region": row["region"], "federalDistrict": row["federalDistrict"],
            "sourceSha256": metadata["sourceSha256"],
            "listSourceUrl": row["listSourceUrl"],
            "note": NOTE + (" Населённый пункт приведён по явно указанному адресу организации; метка населённого пункта в региональной таблице отличается (" + row["sourceCity"] + ")." if city_corrected else ""),
        },
    }
    profile = {
        "universitySlug": slug,
        "fields": {},
        "educationAreas": areas,
        "licenseRegistry": {"value": "not_checked", "checkedAt": metadata["checkedAt"], "note": "Актуальный статус в реестре Рособрнадзора не подтверждён. Наличие записи в мониторинге 2025 не подтверждает действующую лицензию или приём."},
        "licenseExtract": None, "documents": [], "offerings": [],
    }
    audit = {**row, "sourceUrl": source_url, "sourceSha256": metadata["sourceSha256"], "authority": authority, "websiteAsPublished": raw_site, "address": address, "educationAreas": len(areas)}
    return university, profile, audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checked-at", required=True, help="Trusted UTC ISO timestamp for this collection run")
    parser.add_argument("--workers", type=int, default=10)
    parser.add_argument("--refresh", action="store_true", help="Fetch sources again instead of reusing successful cached responses")
    args = parser.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z", args.checked_at):
        raise ValueError("--checked-at must be a UTC ISO timestamp ending in Z")
    CACHE.mkdir(parents=True, exist_ok=True)
    path, index_metadata = fetch(INDEX_URL, "nation.html", args.checked_at, args.refresh)
    document = page(path, index_metadata)
    regions = []
    excluded_regions = []
    for link in document.xpath('//a[contains(@href,"iam/2025/_vpo/material.php")]'):
        source_url = urljoin(BASE, link.get("href"))
        region_id = parse_qs(urlparse(source_url).query)["id"][0]
        district_labels = link.getparent().getparent().xpath('./div[@class="n_fo_name"]/text()')
        region = {"id": region_id, "name": clean(link.text_content()), "sourceUrl": source_url}
        if not district_labels or district_labels[0] not in DISTRICTS:
            excluded_regions.append({**region, "reason": "source_outside_eight_federal_district_tables"})
        elif region_id == "10301":
            excluded_regions.append({**region, "reason": "existing_moscow_directory"})
        else:
            regions.append({**region, "federalDistrict": DISTRICTS[district_labels[0]]})
    existing = json.loads(Path("data-sources/moscow/universities.json").read_text(encoding="utf-8"))["universities"]
    excluded_ids = {u["directory"]["monitoringId"] for u in existing if "directory" in u}
    moscow_index = json.loads(Path("data-sources/moscow/monitoring-index-2025.json").read_text(encoding="utf-8"))
    excluded_ids.update(u["monitoringId"] for u in moscow_index)
    errors = []
    region_results = []
    roster = {}
    excluded_rows = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(collect_region, region, args.checked_at, args.refresh): region for region in regions}
        for future in concurrent.futures.as_completed(futures):
            region = futures[future]
            try:
                source_region, metadata, rows = future.result()
                region_results.append({**source_region, **metadata, "sourceRowCount": len(rows)})
                for row in rows:
                    if row["monitoringId"] in excluded_ids:
                        excluded_rows.append({**row, "reason": "existing_monitoring_id"})
                    elif row["sourceCity"] == "г. Москва":
                        excluded_rows.append({**row, "reason": "existing_moscow_city_scope"})
                    elif row["monitoringId"] in roster:
                        excluded_rows.append({**row, "reason": "duplicate_monitoring_id"})
                    else:
                        roster[row["monitoringId"]] = row
                print("REGION", region["name"], len(rows), flush=True)
            except Exception as error:
                errors.append({"stage": "region", "sourceUrl": region["sourceUrl"], "error": str(error)[:1500]})
    dump(CACHE / "roster.json", list(roster.values()))
    universities, profiles, audits = [], [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(collect_institution, row, args.checked_at, args.refresh): row for row in roster.values()}
        for future in concurrent.futures.as_completed(futures):
            row = futures[future]
            try:
                university, profile, audit = future.result()
                universities.append(university)
                profiles.append(profile)
                audits.append(audit)
            except Exception as error:
                errors.append({"stage": "institution", "monitoringId": row["monitoringId"], "sourceUrl": PROFILE_BASE + row["monitoringId"], "error": str(error)[:1500]})
            if (len(universities) + len(errors)) % 100 == 0:
                print("INSTITUTIONS", len(universities), "errors", len(errors), flush=True)
    universities.sort(key=lambda row: (row["city"], row["name"], row["slug"]))
    profiles.sort(key=lambda row: row["universitySlug"])
    city_counts = Counter(row["city"] for row in universities)
    district_counts = Counter(row["directory"]["federalDistrict"] for row in universities)
    report = {
        "checkedAt": args.checked_at, "sourceUrl": INDEX_URL, "sourceYear": 2025,
        "sourceSha256": index_metadata["sourceSha256"],
        "scope": "Опубликованные региональные таблицы восьми федеральных округов мониторинга Минобрнауки 2025, кроме существующих московских записей. Это перечень участников мониторинга, а не полный реестр всех действующих вузов России.",
        "sourceLimitations": "Мониторинг исключает ряд организаций обороны, безопасности и правопорядка и организации, не предоставившие сведения. Данные относятся к 2025 году; обновление источника 03.02.2026. Условия приёма, факультеты, контакты, лицензии, аккредитация, общежития и военные центры в этой партии не проверялись.",
        "counts": {"regionsRequested": len(regions), "regionsCollected": len(region_results), "sourceRosterAfterExclusions": len(roster), "universitiesAdded": len(universities), "cities": len(city_counts), "educationAreas": sum(len(profile["educationAreas"]) for profile in profiles), "branches": sum(row["directory"]["kind"] == "branch" for row in universities), "state": sum(row["directory"]["ownership"] == "state" for row in universities), "private": sum(row["directory"]["ownership"] == "private" for row in universities)},
        "districtCounts": dict(sorted(district_counts.items())),
        "cityCounts": dict(sorted(city_counts.items())),
        "regions": sorted(region_results, key=lambda row: row["name"]),
        "excludedRegions": excluded_regions, "excludedRows": excluded_rows,
        "errors": sorted(errors, key=lambda row: row["sourceUrl"]),
        "nextWork": "Проверять действующий сайт каждого вуза, страницы сведений об образовательной организации, структуру/факультеты и официальную приёмную кампанию с отдельной фиксацией года и источника. Не преобразовывать исторические УГН(С) в программы поступления.",
    }
    dump(CACHE / "institution-audit.json", audits)
    dump(OUTPUT / "universities.json", {"checkedAt": args.checked_at, "sourceUrl": INDEX_URL, "universities": universities})
    dump(OUTPUT / "profiles.json", {"checkedAt": args.checked_at, "profiles": profiles})
    dump(OUTPUT / "collection-report-2026-10-09.json", report)
    print("COMPLETE", json.dumps(report["counts"], ensure_ascii=False), "errors", len(errors), flush=True)


if __name__ == "__main__":
    main()

"""Collect conservative, source-backed supplements for the existing Moscow directory.

Raw responses remain under ignored tmp/russia-research; this script never edits the
baseline directory, invents admission facts, or changes existing collected values.
"""
import concurrent.futures
import argparse
from copy import deepcopy
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

from lxml import html
import requests

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--collection-date", default=datetime.now(timezone(timedelta(hours=3))).date().isoformat())
parser.add_argument("--output", type=Path)
parser.add_argument("--cache-dir", type=Path)
parser.add_argument("--refresh", action="store_true", help="Fetch again instead of reusing snapshots; prefer a new collection date for a new batch.")
OPTIONS = parser.parse_args() if __name__ == "__main__" else parser.parse_known_args()[0]
datetime.strptime(OPTIONS.collection_date, "%Y-%m-%d")
RAW = OPTIONS.cache_dir or ROOT / ("tmp/russia-research/moscow-enrichment-" + OPTIONS.collection_date)
OUT = OPTIONS.output or ROOT / ("data-sources/russia/moscow-enrichment-" + OPTIONS.collection_date + ".json")
UNIVERSITIES = json.loads((ROOT / "data-sources/moscow/universities.json").read_text(encoding="utf-8"))["universities"]
PROFILES = {p["universitySlug"]: p for p in json.loads((ROOT / "data-sources/moscow/profiles.json").read_text(encoding="utf-8"))["profiles"]}
YEAR = int(OPTIONS.collection_date[:4])


def clean(value):
    return " ".join(value.replace("\xa0", " ").replace("\u200b", "").replace("\ufeff", "").split()).strip()


def now():
    return datetime.now(timezone.utc).isoformat()


def host(url):
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def secure(url):
    p = urlparse(url)
    return urlunparse(p._replace(scheme="https", fragment=""))


def read_tree(raw):
    if raw[:3] == b"\xef\xbb\xbf":
        raw = raw[3:]
    charset = re.search(br'charset\s*=\s*["\']?\s*([A-Za-z0-9_-]+)', raw[:15000], re.I)
    enc = charset.group(1).decode("ascii") if charset else "utf-8"
    try:
        text = raw.decode(enc)
    except (UnicodeDecodeError, LookupError):
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("windows-1251", errors="replace")
    return html.fromstring(text)


def fetch(url, folder):
    """A failed request is retained as an issue rather than becoming a fact."""
    digest = hashlib.sha256(url.encode()).hexdigest()[:14]
    path = folder / (digest + ".html")
    meta_path = folder / (digest + ".meta.json")
    if meta_path.exists() and not OPTIONS.refresh:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    else:
        result = subprocess.run([
            "curl.exe", "-sS", "-L", "--max-time", "14", "--connect-timeout", "5",
            "--proto", "=http,https", "-A", "Mozilla/5.0", "-o", str(path),
            "-w", "%{http_code}\n%{url_effective}", url,
        ], capture_output=True, timeout=19)
        lines = result.stdout.decode("utf-8", errors="replace").strip().splitlines()
        meta = {"requestedUrl": url, "url": lines[-1] if lines else url,
                "httpStatus": lines[0] if lines else "000", "exitCode": result.returncode,
                "checkedAt": now(), "sourceKind": "official_university_page"}
        if path.exists():
            meta["sourceSha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        if result.returncode:
            meta["error"] = clean(result.stderr.decode("utf-8", errors="replace"))[:250]
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if meta.get("httpStatus") != "200" or meta.get("exitCode") or not path.exists():
        # Python's verified HTTPS stack is a useful alternative when Windows
        # curl's direct connection times out. Certificate verification stays on.
        if not meta.get("requestsAttempted"):
            try:
                response = requests.get(url, timeout=(4, 11), headers={"User-Agent": "Mozilla/5.0"})
                path.write_bytes(response.content)
                meta = {"requestedUrl": url, "url": response.url, "httpStatus": str(response.status_code),
                        "exitCode": 0, "checkedAt": now(), "sourceKind": "official_university_page",
                        "sourceSha256": hashlib.sha256(response.content).hexdigest(), "requestsAttempted": True}
            except Exception as error:
                meta["requestsAttempted"] = True
                meta["requestsError"] = clean(str(error))[:250]
            meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if meta.get("httpStatus") != "200" or meta.get("exitCode") or not path.exists():
            return None, meta
    try:
        tree = read_tree(path.read_bytes())
        visible = clean(" ".join(tree.xpath("//body//text()[not(ancestor::script) and not(ancestor::style)]")))
        if len(visible) < 180 or re.search(r"checking your browser|ddos.guard|just a moment|доступ.{0,15}ограничен|подтвердите.{0,15}человек", visible[:2000], re.I):
            meta["rejected"] = "empty_or_access_challenge"
            return None, meta
        return tree, meta
    except Exception as error:
        meta["rejected"] = str(error)[:150]
        return None, meta


def provenance(meta):
    return {"sourceUrl": meta["url"], "sourceYear": int(meta["checkedAt"][:4]),
            "checkedAt": meta["checkedAt"], "sourceSha256": meta["sourceSha256"]}


def links(tree, base):
    result = []
    if tree is not None:
        for a in tree.xpath("//a[@href]"):
            url = urljoin(base, a.get("href"))
            if urlparse(url).scheme in ("http", "https"):
                result.append((clean(a.text_content()), url))
    return result


def is_academic(name, university):
    lower = name.lower().strip(' «»"')
    if not 8 <= len(name) <= 240 or "�" in name:
        return False
    if not re.search(r"\b(?:факультет|институт|школа)\b", lower):
        return False
    if re.search(r"\b(?:центр|отдел|управление|департамент|дирекция|совет|кафедра|комиссия|библиотека|колледж|училище|аспирантура|военный|профсоюз|ректорат|ректор|конференция|президиум|нии|научно-исследовательский|лаборатория|филиал)\b", lower):
        return False
    if re.search(r"дополнительн|повышени[яе]|переподготов|довузов|подготовитель|непрерывного образования|среднего профессионального|деканат|отделени[ея]|научно.{0,12}исследов|структур|положени[ея]|факультет[ыа].{0,10}институт|учебно.{0,6}научный центр|научная школа|общеобразовательная|средняя школа|лицей|артстарт|наукоград|цифровая школа|вечерняя химическая школа|художественная школа|раст[её]м вместе|институт качества высшего образования|профессионального развития работников|корпоративный институт|содержания, методов и технологий образования|развития профильного обучения|гражданской идентичности|открытого образования и развития компетенций", lower):
        return False
    if "исследован" in lower and "факультет" not in lower:
        return False
    if university["slug"] == "fa" and "факультет" not in lower:
        return False
    if university["slug"] == "hse" and "факультет" not in lower and lower not in {
        "московский институт электроники и математики им. а.н. тихонова",
        "высшая школа бизнеса", "международный институт экономики и финансов",
        "институт образования", "школа инноватики и предпринимательства",
    }:
        return False
    if university["slug"] == "sechenov" and lower not in {
        "клинический институт детского здоровья имени н.ф. филатова",
        "институт клинической медицины им. н.в. склифосовского",
        "институт иностранных языков для профессиональных целей",
        "институт общественного здоровья им. ф.ф. эрисмана", "институт социальных наук",
        "институт фармации им. а.п. нелюбина", "институт бионических технологий и инжиниринга",
        "институт компьютерных наук и математического моделирования", "институт стоматологии им. е.в. боровского",
    }:
        return False
    if lower in {"институт", "высшая школа", "факультет"}:
        return False
    if (university["slug"], lower) in {
        ("inpsycho", "московская школа практической психологии"),
        ("inpsycho", "высшая школа логотерапии"),
        ("marhi", "высшая школа ландшафтной архитектуры и дизайна (вшлаид)"),
        ("marhi", "высшая школа средового дизайна (вшсд)"),
    }:
        # Independently checked: the Moscow school and both MARHI schools are
        # DPO/retraining units. Logotherapy's degree-teaching role is unresolved.
        return False
    for value in (university["name"], university["shortName"], university["directory"]["legalName"]):
        if lower == value.lower().strip(' «»"'):
            return False
    return True


def faculties(tree, meta, university):
    result = []
    seen = set()
    for element in tree.xpath('//*[@itemprop="name" or @itemprop="divisionName" or @itemprop="structName"]'):
        rows = element.xpath('ancestor::tr[1]')
        if not rows:
            continue
        row = rows[0]
        name = clean(element.text_content())
        if not is_academic(name, university):
            continue
        addresses = [clean(e.text_content()) for e in row.xpath('.//*[@itemprop="addressStr"]')]
        if addresses and not any(re.search(r"москв|зеленоград|долгопрудн|химки|балаших|мытищ|красногорск|пушкин|корол[её]в|одинцово", address, re.I) for address in addresses):
            if any(re.search(r"санкт|петербург|нижн.{0,8}новгород|пермь|самар|воронеж|калуг|тверь|обнинск|тул[аы]|казан|рязань", address, re.I) for address in addresses):
                continue
        sites = row.xpath('.//*[@itemprop="site"]//a/@href') + element.xpath('.//a/@href')
        if not sites:
            sites = [clean(e.text_content()) for e in row.xpath('.//*[@itemprop="site"]') if clean(e.text_content()).startswith(("http://", "https://"))]
        url = urljoin(meta["url"], sites[0]) if sites else None
        if url and urlparse(url).scheme not in ("http", "https"):
            url = None
        if url and host(url) == host(meta["url"]) and urlparse(url).path in ("", "/"):
            url = None
        if url and re.search("dovuz|schoolchildren|secondary-school|licey", urlparse(url).path, re.I):
            continue
        key = name.casefold()
        if key not in seen:
            seen.add(key)
            result.append({"name": name, "url": url, **provenance(meta)})
    return result


def offerings(tree, meta, university):
    """Implemented higher-education programs, never intake/graduate statistics."""
    result = []
    seen = set()
    for row in tree.xpath('//tr'):
        fields = {}
        for element in row.xpath('.//*[@itemprop]'):
            key = element.get("itemprop")
            isolated = deepcopy(element)
            for nested in isolated.xpath('.//*[@itemprop]'):
                if nested.get("itemprop") != key:
                    nested.drop_tree()
            value = clean(" ".join(isolated.itertext()))
            if value and key not in fields:
                fields[key] = value
        code = fields.get("eduCode", "")
        title = fields.get("eduName", "")
        level = fields.get("eduLevel", "")
        forms = fields.get("eduForm", "")
        tables = row.xpath('ancestor::table[1]')
        table = tables[0] if tables else None
        context = " ".join([row.get("itemprop", ""), table.get("itemprop", "") if table is not None else ""])
        if not re.fullmatch(r"\d{2}\.(?:03|04|05|06|07|08|09)\.\d{2}", code):
            continue
        if not title or len(title) > 450 or "�" in title or not level or not forms:
            continue
        if re.search(r"филиал|тараз|республика казахстан", title + " " + fields.get("eduProf", ""), re.I):
            continue
        if re.search(r"edu(?:Priem|Perevod|Stud|Trud|Graduate|Fin|Chislen|Vypusk|Employment)|graduate|employment", context, re.I):
            continue
        if any(re.search(r"edu(?:Priem|Perevod|Stud|Trud)|graduate|employment|number", key, re.I) for key in fields):
            continue
        header = clean(" ".join(table.xpath('.//th//text()'))) if table is not None else ""
        if re.search(r"численност|число (?:студент|обучающ|выпускн)|трудоустройств|результат[ыа] при[её]ма", header, re.I):
            continue
        implemented_context = bool(re.search(r"edu(?:Accred|Op)\b", context, re.I) or any(key in fields for key in ["eduPred", "eduPrac", "eduPlan", "educationPlan"]))
        if not implemented_context:
            # Pure lists of numbers and form/level names cannot establish a
            # current implemented program; ambiguous layouts need manual review.
            continue
        if not re.search(r"бакалавр|магистр|специалитет|аспирант|ординатур|высшее", level, re.I):
            continue
        if not re.search(r"очн|заочн", forms, re.I):
            continue
        profile = fields.get("eduProf") or None
        terms = row.xpath('.//*[@itemprop="learningTerm"]')
        duration = fields.get("eduNorm") or fields.get("eduSrok") or (fields.get("learningTerm") if len(terms) == 1 else None)
        identity = "|".join([code, title, profile or "", level, forms])
        if identity in seen:
            continue
        seen.add(identity)
        priority = 0 if re.search(r"eduAccred\b", context, re.I) or any(key in fields for key in ["eduPred", "eduPrac"]) else 1
        result.append({"id": university["slug"] + "-official-" + hashlib.sha256(identity.encode()).hexdigest()[:16],
                       "code": code, "title": title, "profile": profile, "level": level,
                       "forms": forms, "duration": duration, "admissionsStatus": "pending_review",
                       **provenance(meta), "sourceYear": None, "_priority": priority})
    # Universities repeat the same programs in overview, curriculum, adapted-
    # program and cohort document tables. Prefer the implemented overview for
    # each code; detailed curricula do not create additional directory programs.
    best = {}
    for item in result:
        best[item["code"]] = min(best.get(item["code"], 1), item["_priority"])
    selected = []
    identities = set()
    for item in result:
        priority = item.pop("_priority")
        if priority != best[item["code"]]:
            continue
        key = "|".join(clean(str(item[k] or "")).casefold() for k in ["code", "title", "profile", "level", "forms"])
        if key not in identities:
            identities.add(key)
            selected.append(item)
    def form_set(value):
        text = value.casefold().replace("–", "-")
        forms = set()
        for pattern, label in [(r"очно[ -]заочн[а-я]*", "очно-заочная"), (r"заочн[а-я]*", "заочная"), (r"очн[а-я]*", "очная")]:
            if re.search(pattern, text):
                forms.add(label)
                text = re.sub(pattern, "", text)
        return forms

    final = []
    for item in selected:
        current_forms = form_set(item["forms"])
        group = tuple(clean(str(item[k] or "")).casefold() for k in ["code", "title", "profile", "level"])
        covered = set()
        if len(current_forms) > 1:
            for other in selected:
                other_group = tuple(clean(str(other[k] or "")).casefold() for k in ["code", "title", "profile", "level"])
                other_forms = form_set(other["forms"])
                if other_group == group and other_forms and other_forms < current_forms:
                    covered.update(other_forms)
        if not current_forms or covered != current_forms:
            final.append(item)
    return final


def common_fields(tree, meta, old):
    result = {}
    for key in ["fullName", "shortName", "regDate", "address", "telephone", "email"]:
        if key in old:
            continue
        values = [clean(e.text_content()) for e in tree.xpath('//*[@itemprop="' + key + '"]')]
        values = [v for v in values if v and "�" not in v and len(v) <= 600 and not re.fullmatch(r"отсутствует|нет|не имеется|не предусмотрено|-|—", v, re.I)]
        if not values:
            continue
        value = values[0]
        if key == "regDate":
            dated = [v for v in values if re.search(r"\b(?:17|18|19|20)\d{2}\b", v)]
            if not dated:
                continue
            value = dated[0]
        if key == "email" and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            continue
        if key == "telephone" and not re.search(r"\d.{0,5}\d.{0,5}\d.{0,5}\d.{0,5}\d", value):
            continue
        if key == "fullName" and not re.search("институт|университет|академи|образован", value, re.I):
            continue
        result[key] = {"value": value, **provenance(meta)}
    return result


def review(university):
    slug = university["slug"]
    folder = RAW / slug
    folder.mkdir(parents=True, exist_ok=True)
    old = PROFILES[slug]["fields"]
    supplement = {"universitySlug": slug, "fields": {}, "faculties": [], "offerings": [], "collectionIssues": []}
    manifest = []
    official = [university["website"]] + [v["sourceUrl"] for v in old.values() if "monitoring.miccedu.ru" not in v["sourceUrl"]]
    official = [secure(u) for u in official if "�" not in u]
    if not official:
        supplement["collectionIssues"].append({"kind": "invalid_official_url", "note": "Официальный URL в исходном каталоге повреждён; нужен ручной поиск."})
        return supplement, manifest
    allowed = {host(u) for u in official}

    def is_allowed(url):
        return any(host(url) == domain or host(url).endswith("." + domain) for domain in allowed)
    common_candidates = [v["sourceUrl"] for v in old.values() if re.search(r"(?:/common(?:/|\.|$)|/sveden/)$", urlparse(v["sourceUrl"]).path)]
    common_candidates = [v["sourceUrl"] for v in old.values() if "/common" in urlparse(v["sourceUrl"]).path] + common_candidates
    if slug == "hse":
        common_candidates.insert(0, "https://hse.ru/sveden/common/")
    base = common_candidates[0] if common_candidates else official[0]
    struct_candidates = [re.sub(r"/common(?:/.*|\.html)?$", "/struct/", secure(base))] if "/common" in base else []
    struct_candidates += [urljoin(official[0], "/sveden/struct/")]
    homepage_tree = None
    homepage_meta = None
    common_tree = None
    common_meta = None
    newlinks = []

    def get(url):
        tree, meta = fetch(secure(url), folder)
        manifest.append({"universitySlug": slug, **meta})
        if not is_allowed(meta["url"]):
            supplement["collectionIssues"].append({"kind": "external_redirect", "sourceUrl": url, "note": "Перенаправление на другой домен: " + meta["url"]})
            return None, meta
        return tree, meta

    # A verified basic-information source usually exposes the right custom path.
    if any(k not in old for k in ["fullName", "shortName", "regDate", "address", "telephone", "email", "admissionsUrl"]):
        candidates = list(dict.fromkeys([secure(u) for u in common_candidates] + [urljoin(official[0], "/sveden/common/")]))
        for url in candidates[:2]:
            common_tree, common_meta = get(url)
            if common_tree is not None:
                supplement["fields"].update(common_fields(common_tree, common_meta, old))
                newlinks.extend((label, link, common_meta) for label, link in links(common_tree, common_meta["url"]))
                struct_candidates = [link for _, link, _ in newlinks if re.search(r"/struct(?:/|\.|$)", urlparse(link).path)] + struct_candidates
                break
    struct_ok = False
    attempted = set()
    for url in list(dict.fromkeys(struct_candidates))[:2]:
        attempted.add(secure(url))
        tree, meta = get(url)
        if tree is not None and re.search(r"структур|факультет|институт", clean(tree.text_content()), re.I):
            supplement["faculties"] = faculties(tree, meta, university)
            struct_ok = True
            if supplement["faculties"]:
                break
    if not supplement["faculties"] or "admissionsUrl" not in old:
        homepage_url = urljoin(official[0], "/")
        homepage_tree, homepage_meta = get(homepage_url)
        if homepage_tree is not None:
            newlinks.extend((label, link, homepage_meta) for label, link in links(homepage_tree, homepage_meta["url"]))
            structural = [link for label, link, _ in newlinks if re.search(r"/struct(?:/|\.|$)", urlparse(link).path)]
            for url in list(dict.fromkeys(structural))[:3]:
                if secure(url) in attempted or not is_allowed(url):
                    continue
                tree, meta = get(url)
                if tree is not None:
                    found = faculties(tree, meta, university)
                    struct_ok = True
                    if found:
                        supplement["faculties"] = found
                        break
    if "admissionsUrl" not in old:
        admission_links = [(label, link, meta) for label, link, meta in newlinks if re.fullmatch(r"(?:абитуриент(?:у|ам|ы)?|поступающим|поступление|при[её]мная комиссия|при[её]мная кампания(?: 2026)?|бакалавриат и специалитет)", label, re.I) and is_allowed(link)]
        if admission_links:
            _, url, meta = admission_links[0]
            supplement["fields"]["admissionsUrl"] = {"value": url, **provenance(meta)}
    if slug == "mgu":
        # The current main MSU site is client-rendered. Its official open-day
        # directory contains exact unit names and linked informational pages.
        tree, meta = get("https://openday.msu.ru/")
        if tree is not None:
            supplement["faculties"] = [{"name": name, "url": url, **provenance(meta)}
                for name, url in links(tree, meta["url"]) if is_academic(name, university)]
        tree, meta = get("https://cpk.msu.ru/pk")
        if tree is not None:
            visible = clean(" ".join(tree.xpath("//body//text()[not(ancestor::script) and not(ancestor::style)]")))
            # Manually inspected central commission block, before faculty blocks.
            for key, value in {"admissionsUrl": "https://cpk.msu.ru/",
                               "admissionsEmail": "cpk@org.msu.ru",
                               "admissionsPhone": "+7 (495) 939-33-98 (с 10:00 до 18:00)"}.items():
                if key not in old and value in visible:
                    supplement["fields"][key] = {"value": value, **provenance(meta)}
    if not PROFILES[slug].get("offerings"):
        education_candidates = [re.sub(r"/common(?:/.*|\.html)?$", "/education/", secure(base))] if "/common" in base else []
        education_candidates = [link for _, link, _ in newlinks if re.search(r"/education(?:/|\.|$)", urlparse(link).path)] + education_candidates + [urljoin(official[0], "/sveden/education/")]
        for url in list(dict.fromkeys(education_candidates))[:2]:
            if not is_allowed(url):
                continue
            tree, meta = get(url)
            if tree is not None:
                supplement["offerings"] = offerings(tree, meta, university)
                if supplement["offerings"]:
                    break
        if not supplement["offerings"]:
            supplement["collectionIssues"].append({"kind": "offerings_unresolved", "note": "Структурированный перечень реализуемых программ не подтверждён в доступных таблицах; условия приёма остаются неизвестными."})
    if not supplement["faculties"]:
        supplement["collectionIssues"].append({"kind": "faculties_unresolved", "note": "Не найдены достаточно однозначные строки факультетов/учебных институтов." if struct_ok else "Страница структуры недоступна либо путь не установлен."})
    supplement["reviewStatus"] = "collected_pending_review"
    (folder / "parsed.json").write_text(json.dumps(supplement, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(slug, "faculties", len(supplement["faculties"]), "new fields", len(supplement["fields"]), flush=True)
    return supplement, manifest


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        tasks = {pool.submit(review, u): u for u in UNIVERSITIES}
        for future in concurrent.futures.as_completed(tasks):
            try:
                results.append(future.result())
            except Exception as error:
                print("COLLECTION ERROR", str(error)[:250], flush=True)
                results.append(({"universitySlug": tasks[future]["slug"], "fields": {}, "faculties": [], "offerings": [],
                                 "collectionIssues": [{"kind": "collection_error", "note": str(error)[:250]}]}, []))
    order = {u["slug"]: i for i, u in enumerate(UNIVERSITIES)}
    profiles = sorted([p for p, _ in results], key=lambda p: order[p["universitySlug"]])
    manifest = [meta for _, pages in results for meta in pages]
    issues = [{"universitySlug": p["universitySlug"], **issue} for p in profiles for issue in p.pop("collectionIssues", [])]
    for p in profiles:
        p.pop("reviewStatus", None)
    data = {"schemaVersion": 1, "checkedAt": now(), "sourceYear": YEAR,
            "status": "incomplete", "scope": "Existing Moscow directory only; current official structural pages and missing basic fields",
            "note": "Faculty/institute lists are a conservative partial collection. Absence from a list does not establish that a unit does not exist. Current legal status and admission conditions are not inferred.",
            "profiles": profiles, "sourceManifest": manifest, "collectionIssues": issues,
            "summary": {"universitiesAttempted": len(UNIVERSITIES), "universitiesReviewed": len(profiles),
                        "universitiesWithFaculties": sum(bool(p["faculties"]) for p in profiles),
                        "faculties": sum(len(p["faculties"]) for p in profiles),
                        "newFields": sum(len(p["fields"]) for p in profiles),
                        "universitiesWithNewOfferings": sum(bool(p["offerings"]) for p in profiles),
                        "newOfferings": sum(len(p["offerings"]) for p in profiles), "pagesRequested": len(manifest)}}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("COMPLETE", json.dumps(data["summary"]), flush=True)


if __name__ == "__main__":
    main()

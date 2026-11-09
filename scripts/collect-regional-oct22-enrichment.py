"""Reproduce the 22 October regional batch with conservative editorial scope.

The shared regional collector stays unchanged. This wrapper removes explicitly
reviewed non-HE/uncertain units and aliases from its dated output. It never adds
facts from curriculum plans, statistics or unassociated duration columns.
"""

import importlib.util
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlparse


SPEC = importlib.util.spec_from_file_location(
    "regional_collector", Path(__file__).with_name("collect-regional-enrichment.py")
)
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)

# These exact source spellings are excluded, never rewritten as HE faculties.
# A structural listing alone does not establish a unit's HE teaching scope.
EXCLUDED_UNITS = {
    "russia-4": {
        "Школа ИТ-превосходства «Digital Up»": "Цифровые компетенции; самостоятельное высшее образование подразделения не подтверждено.",
        "Школа бакалавриата": "Вложенная административная единица Института гуманитарных наук, с тем же URL; не отдельный факультет.",
        "Школа современных компетенций «Профессиональный Ренессанс»": "Дополнительные компетенции; самостоятельное высшее образование подразделения не подтверждено.",
    },
    "russia-111": {
        "Институт профессионального образования": "Профессиональное образование; высшее образование подразделения не подтверждено, требуется отдельная проверка.",
    },
    "russia-16": {
        "Институт развития человеческого капитала": "Смешанное административное/дополнительное образование; самостоятельное высшее образование подразделения не подтверждено.",
    },
    "russia-79": {
        "Институт международных образовательных программ": "Подготовка и международные программы; высшее образование подразделения отдельно не подтверждено.",
        "Институт непрерывного профессионального образования": "Непрерывное профессиональное образование не принимается за факультет высшего образования без отдельного подтверждения.",
        "Институт образовательных технологий": "Образовательные технологии; самостоятельное высшее образование подразделения не подтверждено.",
        'Научное подразделение "Институт механики имени профессора Гольдфарба В.И."': "В источнике прямо названо научным подразделением.",
    },
    "russia-187": {
        "ИНСТИТУТ НЕПРЕРЫВНОГО ПРОФЕССИОНАЛЬНОГО ОБРАЗОВАНИЯ": "Непрерывное профессиональное образование; высшее образование подразделения отдельно не подтверждено.",
        "Школа китайского языка": "Языковая школа/кафедра не считается самостоятельным факультетом высшего образования.",
        "ФАКУЛЬТЕТ ПОДГОТОВКИ ИНОСТРАННЫХ ГРАЖДАН": "Подготовительный факультет.",
        "Университетская физико-математическая школа": "Школьное образование.",
        "Институт биоэлементологии": "Научная единица; самостоятельное высшее образование подразделения не подтверждено.",
        "Институт управления проектами": "Управление проектами; самостоятельное высшее образование подразделения не подтверждено.",
    },
    "russia-197": {
        "Факультет иностранных студентов": "Высшее образование подразделения отдельно не подтверждено; подготовительные/сопровождающие функции не считаются факультетом.",
    },
    "russia-302": {
        "Международная школа предпринимательства": "Бизнес-школа; самостоятельные программы высшего образования подразделения в этой партии не подтверждены.",
        "Региональный институт международного сотрудничества": "Международное сотрудничество; административная/языковая деятельность не считается подтверждением высшего образования подразделения.",
        "Школа метапредметных компетенций": "Общие компетенции и сопровождение учебного процесса; самостоятельное высшее образование подразделения не подтверждено.",
    },
}


def faculty_key(item):
    """HTTP/HTTPS and www aliases describe the same explicitly linked unit."""
    if item.get("url"):
        parsed = urlparse(item["url"])
        return (collector.host(item["url"]), parsed.path.rstrip("/"), parsed.query)
    return (collector.clean(item["name"]).casefold(),)


def duration_rows(document):
    """Associate all overview continuation rows, including unmarked rowspan rows."""
    result = {}
    for table in document.xpath('//table[.//tr[@itemprop="eduAccred"]]'):
        header = collector.clean(" ".join(table.xpath('.//th//text()')))
        if re.search(r"численност|трудоустройств|результат[ыа] при[её]ма", header, re.I):
            continue
        carried = {}
        for row in table.xpath('.//tr'):
            if row.xpath('ancestor::table[1]')[0] is not table:
                continue
            values = {key: value for key, (value, _) in carried.items()}
            carried = {key: (value, remaining - 1) for key, (value, remaining) in carried.items() if remaining > 1}
            for node in row.xpath('.//*[@itemprop]'):
                prop = node.get("itemprop")
                if prop not in ["eduCode", "eduName", "eduProf", "eduLevel", "eduForm", "eduNorm", "eduSrok", "learningTerm"]:
                    continue
                value = collector.clean(node.text_content())
                if not value:
                    continue
                values[prop] = value
                carried.pop(prop, None)
                span = node.get("rowspan", "1")
                if span.isdigit() and int(span) > 1:
                    carried[prop] = (value, int(span) - 1)
            key = tuple(collector.clean(values.get(prop) or "").casefold().replace("ё", "е") for prop in ["eduCode", "eduName", "eduProf", "eduLevel", "eduForm"])
            duration = values.get("eduNorm") or values.get("eduSrok") or values.get("learningTerm")
            if duration and re.search(r"год|года|лет|месяц|недел|дн(?:я|ей)|час", duration, re.I):
                result.setdefault(key, set()).add(duration)
    return result


def verify_duration_scope(data, documents):
    """A full-time-only duration column cannot establish a part-time duration."""
    duration_maps = {}
    for profile in data["profiles"]:
        for offering in profile["offerings"]:
            source_key = (offering["sourceUrl"], offering["sourceSha256"])
            document = documents.get(source_key)
            if document is None:
                raise ValueError("Missing HTTP 200 source for " + offering["id"])
            if source_key not in duration_maps:
                duration_maps[source_key] = duration_rows(document)
            provenance = {field: offering[field] for field in ["sourceUrl", "sourceYear", "checkedAt", "sourceSha256"]}
            identity = {field: offering.get(field) for field in ["code", "title", "profile", "level", "forms"]}
            if profile["universitySlug"] == "russia-187" and offering["forms"].casefold() != "очная":
                existing = [issue for issue in data["issues"] if issue.get("kind") == "offering_duration_other_form_column" and issue.get("universitySlug") == profile["universitySlug"] and all(issue.get(field) == value for field, value in identity.items())]
                if offering["duration"] is None and existing:
                    continue
                column = "Нормативный срок обучения по очной форме"
                if column.casefold() not in collector.clean(document.text_content()).casefold():
                    raise ValueError("Expected Orenburg duration header missing")
                issue = {"universitySlug": profile["universitySlug"], "kind": "offering_duration_other_form_column", **identity, "publishedColumn": column, "publishedValue": offering["duration"], **provenance, "note": "Колонка источника указывает срок только очной формы. Она не подтверждает срок этой неочной формы; duration=null."}
                offering["duration"] = None
                if issue not in data["issues"]:
                    data["issues"].append(issue)
                continue
            key = tuple(collector.clean(offering.get(field) or "").casefold().replace("ё", "е") for field in ["code", "title", "profile", "level", "forms"])
            values = sorted(duration_maps[source_key].get(key, set()))
            if len(values) > 1:
                offering["duration"] = None
                existing = [issue for issue in data["issues"] if issue.get("kind") == "offering_duration_conflict" and issue.get("universitySlug") == profile["universitySlug"] and all(issue.get(field) == value for field, value in identity.items())]
                if not existing:
                    data["issues"].append({"universitySlug": profile["universitySlug"], "kind": "offering_duration_conflict", **identity, "values": values, **provenance, "note": "Одна и та же программа, профиль, уровень и форма имеют разные сроки в опубликованных строках. Общий срок оставлен неизвестным; продолжения строк с rowspan проверены отдельно."})
    return data


def source_documents():
    documents = {}
    for path in collector.RAW.rglob("*.meta.json"):
        metadata = json.loads(path.read_text(encoding="utf-8"))
        body = path.with_suffix("").with_suffix(".html")
        if metadata.get("httpStatus") == "200" and metadata.get("exitCode") == 0 and body.exists():
            raw = body.read_bytes()
            if hashlib.sha256(raw).hexdigest() != metadata.get("sourceSha256"):
                raise ValueError("Raw source SHA mismatch")
            documents[(metadata["url"], metadata["sourceSha256"])] = collector.tree(raw)
    return documents


def finalize(data):
    """Pure, idempotent editorial transform; source facts keep their dates."""
    data = json.loads(json.dumps(data, ensure_ascii=False))
    editorial = []
    for profile in data["profiles"]:
        slug = profile["universitySlug"]
        kept, seen = [], set()
        for unit in profile["faculties"]:
            reason = EXCLUDED_UNITS.get(slug, {}).get(unit["name"])
            key = faculty_key(unit)
            if not reason and key in seen:
                reason = "Повтор той же учебной единицы по URL с алиасом протокола/www; сохранено первое точное официальное название."
            if reason:
                editorial.append({"universitySlug": slug, "kind": "academic_unit_excluded_after_source_review", "name": unit["name"], "unitUrl": unit.get("url"), **{field: unit[field] for field in ["sourceUrl", "sourceYear", "checkedAt", "sourceSha256"]}, "note": reason})
                continue
            seen.add(key)
            kept.append(unit)
        profile["faculties"] = kept
        for offering in profile["offerings"]:
            duration = offering.get("duration")
            if duration and not re.search(r"год|года|лет|месяц|недел|дн(?:я|ей)|час", duration, re.I):
                editorial.append({"universitySlug": slug, "kind": "offering_duration_without_units", "code": offering["code"], "title": offering["title"], "profile": offering.get("profile"), "forms": offering["forms"], "value": duration, **{field: offering[field] for field in ["sourceUrl", "sourceYear", "checkedAt", "sourceSha256"]}, "note": "В исходной строке нет единиц срока; duration оставлен неизвестным."})
                offering["duration"] = None
    for issue in editorial:
        if issue not in data["issues"]:
            data["issues"].append(issue)
    data["stats"].update({
        "universitiesWithCurrentFields": sum(bool(profile["fields"]) for profile in data["profiles"]),
        "universitiesWithFaculties": sum(bool(profile["faculties"]) for profile in data["profiles"]),
        "fields": sum(len(profile["fields"]) for profile in data["profiles"]),
        "faculties": sum(len(profile["faculties"]) for profile in data["profiles"]),
        "implementedOfferings": sum(len(profile["offerings"]) for profile in data["profiles"]),
    })
    scope_note = " Редакционный фильтр 22 октября исключает неоднозначные административные, научные, подготовительные и дополнительные единицы, а также URL-алиасы подразделений. ПНИПУ с колонками сроков без единиц и неподдержанные динамические перечни оставлены на отдельную проверку. Эта партия содержит бакалавриат и специалитет; неполнота не означает отсутствия других программ."
    if scope_note not in data["scope"]:
        data["scope"] += scope_note
    return data


def main():
    collector.main()
    data = json.loads(collector.OUT.read_text(encoding="utf-8"))
    data = finalize(data)
    data = verify_duration_scope(data, source_documents())
    collector.dump(collector.OUT, data)
    print("EDITORIAL COMPLETE", json.dumps(data["stats"]), flush=True)


if __name__ == "__main__":
    main()

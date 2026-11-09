"""Editorial scope regressions for the isolated 22 October regional wrapper."""

import importlib.util
import json
from pathlib import Path
import unittest


SPEC = importlib.util.spec_from_file_location("oct22", Path(__file__).with_name("collect-regional-oct22-enrichment.py"))
batch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(batch)
PROVENANCE = {"sourceUrl": "https://example.edu.ru/sveden/struct/", "sourceYear": 2026, "checkedAt": "2026-10-22T08:23:27Z", "sourceSha256": "a" * 64}


def fixture(slug, faculties=None, offerings=None):
    return {"profiles": [{"universitySlug": slug, "fields": {}, "faculties": faculties or [], "offerings": offerings or []}], "issues": [], "stats": {}, "scope": "Исходный объём."}


class October22ScopeTests(unittest.TestCase):
    def test_full_time_duration_header_cannot_establish_part_time_duration(self):
        markup = '<html><body><table><tr><th>Нормативный срок обучения по очной форме</th></tr><tr itemprop="eduAccred"><td itemprop="eduCode">09.03.01</td><td itemprop="eduName">Информатика</td><td itemprop="eduLevel">Бакалавриат</td><td itemprop="eduForm">Заочная</td><td itemprop="learningTerm">4 года</td></tr></table></body></html>'
        row = {"id": "example", "code": "09.03.01", "title": "Информатика", "profile": None, "level": "Бакалавриат", "forms": "Заочная", "duration": "4 года", **PROVENANCE, "sourceYear": None}
        data = fixture("russia-187", offerings=[row])
        documents = {(PROVENANCE["sourceUrl"], PROVENANCE["sourceSha256"]): batch.collector.tree(markup.encode())}
        result = batch.verify_duration_scope(data, documents)
        self.assertIsNone(result["profiles"][0]["offerings"][0]["duration"])
        self.assertEqual(result["issues"][0]["publishedValue"], "4 года")
        self.assertEqual(result["issues"][0]["publishedColumn"], "Нормативный срок обучения по очной форме")
        expected = json.loads(json.dumps(result))
        self.assertEqual(batch.verify_duration_scope(result, documents), expected)

    def test_unmarked_rowspan_continuation_can_reveal_conflicting_duration(self):
        markup = '<html><body><table><tr itemprop="eduAccred"><td itemprop="eduCode" rowspan="2">09.03.01</td><td itemprop="eduName" rowspan="2">Информатика</td><td itemprop="eduLevel" rowspan="2">Бакалавриат</td><td itemprop="eduForm" rowspan="2">Очная</td><td itemprop="learningTerm">4 года</td></tr><tr><td itemprop="learningTerm">5 лет</td></tr></table></body></html>'
        row = {"id": "example", "code": "09.03.01", "title": "Информатика", "profile": None, "level": "Бакалавриат", "forms": "Очная", "duration": "4 года", **PROVENANCE, "sourceYear": None}
        result = batch.verify_duration_scope(fixture("russia-123", offerings=[row]), {(PROVENANCE["sourceUrl"], PROVENANCE["sourceSha256"]): batch.collector.tree(markup.encode())})
        self.assertIsNone(result["profiles"][0]["offerings"][0]["duration"])
        self.assertEqual(result["issues"][0]["values"], ["4 года", "5 лет"])

    def test_distinct_longer_profile_does_not_conflict_with_its_name_prefix(self):
        markup = '<html><body><table><tr itemprop="eduAccred"><td itemprop="eduCode">09.03.01</td><td itemprop="eduName">Информатика</td><td itemprop="eduProf">Системы</td><td itemprop="eduLevel">Бакалавриат</td><td itemprop="eduForm">Очная</td><td itemprop="learningTerm">4 года</td></tr><tr itemprop="eduAccred"><td itemprop="eduCode">09.03.01</td><td itemprop="eduName">Информатика</td><td itemprop="eduProf">Системы Индустрии 4.0</td><td itemprop="eduLevel">Бакалавриат</td><td itemprop="eduForm">Очная</td><td itemprop="learningTerm">5 лет</td></tr></table></body></html>'
        row = {"id": "example", "code": "09.03.01", "title": "Информатика", "profile": "Системы", "level": "Бакалавриат", "forms": "Очная", "duration": "4 года", **PROVENANCE, "sourceYear": None}
        result = batch.verify_duration_scope(fixture("russia-123", offerings=[row]), {(PROVENANCE["sourceUrl"], PROVENANCE["sourceSha256"]): batch.collector.tree(markup.encode())})
        self.assertEqual(result["profiles"][0]["offerings"][0]["duration"], "4 года")
        self.assertEqual(result["issues"], [])

    def test_scientific_preparatory_and_dpo_units_are_removed_without_renaming(self):
        for slug, names in batch.EXCLUDED_UNITS.items():
            units = [{"name": name, "url": None, **PROVENANCE} for name in names]
            units.append({"name": "Физический факультет", "url": None, **PROVENANCE})
            data = batch.finalize(fixture(slug, faculties=units))
            self.assertEqual([row["name"] for row in data["profiles"][0]["faculties"]], ["Физический факультет"])
            self.assertEqual(len(data["issues"]), len(names))
            self.assertEqual(data["issues"][0]["sourceSha256"], PROVENANCE["sourceSha256"])

    def test_same_faculty_http_www_alias_keeps_first_exact_source_spelling(self):
        units = [{"name": "Радиотехнический факультет (РТФ)", "url": "http://www.example.edu.ru/radio/", **PROVENANCE}, {"name": "Радиотехнический факультет", "url": "https://example.edu.ru/radio/", **PROVENANCE}, {"name": "Химический факультет", "url": "https://example.edu.ru/chem/", **PROVENANCE}]
        result = batch.finalize(fixture("russia-183", faculties=units))
        self.assertEqual([row["name"] for row in result["profiles"][0]["faculties"]], [units[0]["name"], units[2]["name"]])
        self.assertEqual(result["stats"]["faculties"], 2)
        self.assertEqual(result["profiles"][0]["faculties"][0]["checkedAt"], PROVENANCE["checkedAt"])

    def test_duration_requires_explicit_units_without_guessing_years(self):
        rows = [{"code": "09.03.01", "title": "Информатика", "profile": None, "forms": "Очная", "duration": duration, **PROVENANCE, "sourceYear": None} for duration in ["4", "4 года", "5 лет 6 месяцев"]]
        result = batch.finalize(fixture("russia-123", offerings=rows))
        self.assertEqual([row["duration"] for row in result["profiles"][0]["offerings"]], [None, "4 года", "5 лет 6 месяцев"])
        self.assertEqual(result["issues"][0]["kind"], "offering_duration_without_units")
        self.assertIsNone(result["issues"][0]["sourceYear"])
        self.assertEqual(rows[0]["duration"], "4")
        self.assertEqual(batch.finalize(result), result)

    def test_distinct_official_unit_urls_are_not_deduplicated_by_similar_names(self):
        units = [{"name": "Институт энергетики", "url": "https://example.edu.ru/a", **PROVENANCE}, {"name": "Институт энергетики и связи", "url": "https://example.edu.ru/b", **PROVENANCE}]
        result = batch.finalize(fixture("russia-123", faculties=units))
        self.assertEqual(result["profiles"][0]["faculties"], units)
        self.assertEqual(result["issues"], [])


if __name__ == "__main__":
    unittest.main()

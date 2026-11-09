"""Offline regressions for actual October 25 source layout differences."""

import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("oct25", Path(__file__).with_name("collect-regional-oct25-education.py"))
batch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(batch)
META = {"url": "https://kuzstu.ru/sveden/education/", "sourceSha256": "a" * 64, "checkedAt": "2026-10-25T07:02:00Z"}


def document(markup):
    return batch.shared.html.fromstring(markup)


def values(**changes):
    return {"eduCode": "09.03.01", "eduName": "Информатика", "eduProf": "Программирование", "eduLevel": "Бакалавриат", "eduForm": "Очная", **changes}


class RegionalOctober25Tests(unittest.TestCase):
    def test_mixed_specialist_master_level_is_excluded_despite_specialist_code(self):
        issues = []
        self.assertIsNone(batch.fact("russia-330", values(eduCode="10.05.01", eduLevel="Высшее образование — специалитет, магистратура"), META, {}, issues))
        self.assertEqual(issues[0]["kind"], "source_level_conflict")

    def test_conflicting_invalid_level_also_removes_otherwise_valid_identity(self):
        issues = []
        valid = batch.fact("russia-111", values(), META, {}, issues)
        self.assertIsNone(batch.fact("russia-111", values(eduLevel="Специалитет"), META, {}, issues))
        kept, _ = batch.deduplicate([(valid, {})], "russia-111", issues)
        self.assertEqual(kept, [])
        self.assertEqual(issues[-1]["kind"], "offering_level_conflict_excluded")

    def test_pnipu_uses_each_mode_own_cell_and_does_not_invent_term_units(self):
        markup = '<table><caption>Бакалавриат, специалитет, магистратура</caption><tr><th itemprop="eduForm">Очная форма обучения</th><th itemprop="eduForm">Очно-заочная форма обучения</th><th itemprop="eduForm">Заочная форма обучения</th></tr><tr><td itemprop="eduCode">09.03.02</td><td>Цифровые технологии</td><td>Бакалавриат</td><td>4</td><td>-</td><td>5</td><td>Бессрочно</td></tr></table>'
        issues = []
        rows = batch.pstu_rows(document(markup), META, issues)
        self.assertEqual([item["forms"] for item, _ in rows], ["Очная", "Заочная"])
        self.assertEqual([item["duration"] for item, _ in rows], [None, None])
        self.assertEqual([locator["formColumnIndex"] for _, locator in rows], [3, 5])
        self.assertEqual([issue["publishedValue"] for issue in issues], ["4", "5"])
        self.assertIsNone(rows[0][0]["profile"])

    def test_pnipu_rejects_changed_mode_header_order(self):
        markup = '<table><caption>Бакалавриат, специалитет, магистратура</caption><tr><th itemprop="eduForm">Заочная форма обучения</th></tr></table>'
        with self.assertRaisesRegex(ValueError, "mode columns"):
            batch.pstu_rows(document(markup), META, [])

    def test_omgtu_expands_code_and_title_rowspans_in_generated_table(self):
        headers = ["Код", "Наименования специальности, направления подготовки", "Уровень образования", "Образовательная программа, направленность, профиль", "Реализуемые формы обучения"] + ["Документ"] * 7 + ["Нормативный срок обучения", "Аккредитация"]
        markup = '<table class="table table-bordered"><thead><tr>' + ''.join('<th>' + h + '</th>' for h in headers) + '</tr></thead>'
        markup += '<tr><td rowspan="2">09.03.01</td><td rowspan="2">Информатика</td><td>Бакалавриат</td><td>Профиль А</td><td>очная</td>' + '<td>Документ</td>' * 7 + '<td>4 года</td><td>Бессрочно</td></tr>'
        markup += '<tr><td>Бакалавриат</td><td>Профиль Б (2025, 2026 года набора)</td><td>очная, заочная</td>' + '<td>Документ</td>' * 7 + '<td>4 года</td><td>Бессрочно</td></tr></table>'
        issues = []
        rows = batch.omgtu_rows(document(markup), META, issues)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1][0]["code"], "09.03.01")
        self.assertEqual(rows[1][0]["title"], "Информатика")
        self.assertEqual(rows[1][0]["profile"], "Профиль Б (2025, 2026 года набора)")
        self.assertIsNone(rows[1][0]["sourceYear"])
        self.assertIsNone(rows[1][0]["duration"])
        self.assertEqual(rows[0][0]["duration"], "4 года")

    def test_microdata_continuation_keeps_own_form_and_duration(self):
        markup = '<h3>Программы бакалавриата</h3><table><tr itemprop="eduAccred"><td itemprop="eduCode" rowspan="2">09.03.01</td><td itemprop="eduName" rowspan="2">Информатика</td><td itemprop="eduProf" rowspan="2">Профиль</td><td itemprop="eduLevel" rowspan="2">Бакалавриат</td><td itemprop="eduForm">Очная</td><td itemprop="learningTerm">4 года</td></tr><tr><td itemprop="eduForm">Заочная</td><td itemprop="learningTerm">5 лет</td></tr></table>'
        rows = batch.microdata_rows("russia-111", document(markup), META, [])
        self.assertEqual([(r["forms"], r["duration"]) for r, _ in rows], [("Очная", "4 года"), ("Заочная", "5 лет")])

    def test_statistics_table_with_familiar_properties_is_excluded(self):
        markup = '<table><tr><th>Численность обучающихся</th></tr><tr itemprop="eduAccred"><td itemprop="eduCode">09.03.01</td><td itemprop="eduName">Информатика</td><td itemprop="eduLevel">Бакалавриат</td><td itemprop="eduForm">Очная</td></tr></table>'
        self.assertEqual(batch.microdata_rows("russia-111", document(markup), META, []), [])

    def test_altgu_uses_overview_fields_without_reading_cohort_plan_rows(self):
        markup = '<h2>09.03.01. Информатика</h2><table class="table_light"><tr><td>Уровень подготовки</td><td>Бакалавриат</td></tr><tr><td>Профиль</td><td>Прикладной анализ</td></tr><tr><td>Формы обучения</td><td>Очная</td></tr><tr><td>Учебное подразделение</td><td>Институт</td></tr></table><h3>Учебные планы</h3><table><tr><td>2026</td><td>Заочная</td></tr></table>'
        rows = batch.asu_rows(document(markup), META, [])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][0]["profile"], "Прикладной анализ")
        self.assertEqual(rows[0][0]["forms"], "Очная")
        self.assertIsNone(rows[0][0]["duration"])

    def test_branch_and_source_form_typo_are_not_silently_normalized(self):
        issues = []
        self.assertIsNone(batch.fact("russia-4", values(unit="Ишимский филиал"), META, {}, issues))
        self.assertIsNone(batch.fact("russia-183", values(eduForm="очнаz"), META, {}, issues))
        self.assertEqual([issue["kind"] for issue in issues], ["offering_other_campus_excluded", "offering_form_unrecognized_excluded"])

    def test_detail_collection_stops_at_first_rate_limited_response(self):
        discovered = {"russia-4": [{"url": "one"}, {"url": "two"}, {"url": "three"}]}
        with patch.object(batch, "fetch", side_effect=[{"httpStatus": "200"}, {"httpStatus": "429"}]) as fetch:
            batch.collect_details(Path("unused"), discovered)
            self.assertEqual(fetch.call_count, 2)

    def test_fetch_checks_redirect_domain_before_second_request(self):
        def fake_run(argv, **kwargs):
            Path(argv[argv.index("-D") + 1]).write_text("HTTP/1.1 302 Found\nLocation: https://unrelated.example/\n", encoding="ascii")
            Path(argv[argv.index("-o") + 1]).write_bytes(b"redirect")
            return SimpleNamespace(stdout=b"302", stderr=b"", returncode=0)
        with tempfile.TemporaryDirectory() as temp, patch.object(batch.guard, "require_public_resolution"), patch.object(batch.subprocess, "run", side_effect=fake_run) as run:
            result = batch.fetch(Path(temp), "russia-111", "https://kuzstu.ru/sveden/education/")
            self.assertIn("outside the official", result["error"])
            self.assertEqual(run.call_count, 1)
            self.assertNotIn("-L", run.call_args.args[0])

    def test_cp1251_ajax_fragment_decodes_using_response_charset(self):
        markup = '<html><body>' + 'Реализуемые программы высшего образования ' * 10 + '</body></html>'
        tree = batch.load_document(markup.encode("cp1251"), "text/html; charset=cp1251")
        self.assertIn("Реализуемые программы", tree.text_content())
        self.assertNotIn("�", tree.text_content())

    def test_cached_evidence_rejects_changed_body_hash(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            url = "https://kuzstu.ru/sveden/education/"
            body, metadata = batch.paths(work, "russia-111", url)
            body.parent.mkdir(parents=True)
            body.write_text("tampered", encoding="utf-8")
            batch.dump(metadata, {**META, "universitySlug": "russia-111", "requestedUrl": url, "httpStatus": "200", "exitCode": 0})
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                batch.evidence(work, "russia-111", url)


if __name__ == "__main__":
    unittest.main()

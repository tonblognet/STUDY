"""Regressions for source defects and conservative regional program collection."""

import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    "regional_collector", Path(__file__).with_name("collect-regional-enrichment.py")
)
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)


class RegionalSourceRegressionTests(unittest.TestCase):
    def test_bare_host_fallback_stays_on_same_https_official_domain(self):
        self.assertEqual(collector.bare_host_url("https://www.nspu.ru/sveden/common/?lang=ru"), "https://nspu.ru/sveden/common/?lang=ru")
        self.assertEqual(collector.host(collector.bare_host_url("https://www.nspu.ru:443/")), collector.host("https://www.nspu.ru:443/"))
        for url in ["https://nspu.ru/", "https://www2.nspu.ru/", "http://www.nspu.ru/", "https://user:secret@www.nspu.ru/"]:
            self.assertIsNone(collector.bare_host_url(url))

    def test_legacy_level_form_overview_link_excludes_stats_dpo_and_cohort_plans(self):
        markup = '<html><body><a href="/table?part=levels">Информация о реализуемых уровнях образования, о формах обучения, нормативных сроках обучения</a>'
        markup += '<a href="/stats">Информация о численности обучающихся</a><a href="/dpo">Реализуемые дополнительные профессиональные программы</a>'
        markup += '<a href="/plans">Учебные планы по годам приёма</a><a href="/phd">Образовательные программы аспирантуры</a></body></html>'
        self.assertEqual(collector.education_overview_links(collector.tree(markup.encode()), "https://example.edu.ru/"), ["https://example.edu.ru/table?part=levels"])

    def test_tsuab_project_and_international_administration_are_not_teaching_units(self):
        university = {"slug": "russia-292", "name": "ТГАСУ", "directory": {"legalName": "ТГАСУ"}}
        for name in collector.UNCERTAIN_UNITS["russia-292"]:
            self.assertFalse(collector.academic(name, university))
        self.assertTrue(collector.academic("Архитектурный факультет", university))

    def test_failed_www_attempt_is_preserved_and_structure_child_stays_official(self):
        university = {"slug": "russia-123", "name": "Университет", "website": "https://www.example.edu.ru", "directory": {"legalName": "Университет"}}
        root = '<html><body><a href="/sveden/struct/">Структура</a></body></html>'
        overview = '<html><body><a href="/actual-structure">Структура и органы управления образовательной организацией</a><a href="https://external.invalid/structure">Структура и органы управления образовательной организацией</a><a href="/regulations">Положения о подразделениях</a></body></html>'
        structure = '<html><body><table><tr><td itemprop="name">Физический факультет</td></tr><tr><td itemprop="name">Ректор</td></tr></table></body></html>'
        fixtures = {"https://example.edu.ru/": root, "https://example.edu.ru/sveden/struct/": overview, "https://example.edu.ru/actual-structure": structure}
        requested = []
        def fake_fetch(url, folder):
            requested.append(url)
            normalized = url.rstrip("/") + "/" if url == "https://example.edu.ru" else url
            markup = fixtures.get(normalized)
            meta = {"requestedUrl": url, "url": normalized, "httpStatus": "200" if markup else "000", "exitCode": 0 if markup else 28, "checkedAt": "2026-10-20T10:03:22Z", "sourceSha256": "a" * 64}
            return (collector.tree(markup.encode()) if markup else None), meta
        with TemporaryDirectory() as directory, patch.object(collector, "RAW", Path(directory)), patch.object(collector, "TRY_BARE_HOST", True), patch.object(collector, "fetch", side_effect=fake_fetch):
            profile, pages, _ = collector.review(university)
        self.assertEqual(requested[:2], ["https://www.example.edu.ru", "https://example.edu.ru"])
        self.assertEqual(pages[0]["httpStatus"], "000")
        self.assertEqual(pages[1]["httpStatus"], "200")
        self.assertEqual([row["name"] for row in profile["faculties"]], ["Физический факультет"])
        self.assertEqual(profile["faculties"][0]["sourceUrl"], "https://example.edu.ru/actual-structure")
        self.assertNotIn("https://external.invalid/structure", requested)
        self.assertNotIn("https://example.edu.ru/regulations", requested)

    def test_invalid_script_byte_does_not_corrupt_declared_utf8_profile(self):
        raw = '<html><head><meta charset="UTF-8"><title>Томский университет</title></head><body><span itemprop="address">г. Томск, пр. Ленина, 36</span><script>'.encode("utf-8")
        raw += b"\xf1</script></body></html>"
        document = collector.tree(raw)
        self.assertEqual(document.xpath("//title/text()"), ["Томский университет"])
        self.assertEqual(document.xpath('//*[@itemprop="address"]/text()'), ["г. Томск, пр. Ленина, 36"])

    def test_curriculum_only_profile_is_not_added_when_overview_exists(self):
        row = '<td itemprop="eduCode">09.03.01</td><td itemprop="eduName">Информатика и вычислительная техника</td><td itemprop="eduProf">{profile}</td><td itemprop="eduLevel">Высшее образование — бакалавриат</td><td itemprop="eduForm">Очная</td>'
        markup = '<html><body><h3>Реализуемые образовательные программы</h3><table><tr itemprop="eduAccred">' + row.format(profile="Программное обеспечение") + '</tr></table><h3>Учебные планы по годам приёма</h3><table><tr itemprop="eduOp">' + row.format(profile="Исторический профиль из плана 2015 года") + '</tr></table></body></html>'
        metadata = {"url": "https://example.edu.ru/sveden/education/", "checkedAt": "2026-10-09T20:14:18Z", "sourceSha256": "a" * 64}
        result = collector.offerings(collector.tree(markup.encode("utf-8")), metadata, {"slug": "russia-123"})
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["profile"], "Программное обеспечение")
        self.assertEqual(result[0]["sourceSection"], "Реализуемые образовательные программы")
        self.assertIsNone(result[0]["sourceYear"])
        self.assertEqual(result[0]["admissionsStatus"], "pending_review")

    def test_dpo_research_and_schoolchildren_are_not_faculties(self):
        university = {"name": "Университет", "directory": {"legalName": "Университет"}}
        for name in ["Высшая школа безопасности труда", "Физико-математическая школа-интернат", "Базовая профориентационная школа", "Институт среднего профессионального образования", "Институт социально-политических исследований", "Факультет филологии филиала в г. Бирск"]:
            with self.subTest(name=name):
                self.assertFalse(collector.academic(name, university))
        self.assertTrue(collector.academic("Физический факультет", university))

    def test_separate_degree_overviews_are_all_read_without_curriculum_rows(self):
        def row(code, title, level, kind="eduAccred"):
            return '<tr itemprop="' + kind + '"><td itemprop="eduCode">' + code + '</td><td itemprop="eduName">' + title + '</td><td itemprop="eduLevel">' + level + '</td><td itemprop="eduForm">Очная</td></tr>'
        markup = '<html><body><table>' + row("09.02.07", "СПО", "Среднее профессиональное образование") + '</table>'
        markup += '<h3>Бакалавриат</h3><table>' + row("09.03.01", "Информатика", "Бакалавриат") + '</table>'
        markup += '<h3>Специалитет</h3><table>' + row("38.05.01", "Экономическая безопасность", "Специалитет") + '</table>'
        markup += '<h3>Учебные планы 2015 года</h3><table>' + row("09.03.02", "Архивный план", "Бакалавриат", "eduOp") + '</table></body></html>'
        metadata = {"url": "https://example.edu.ru/sveden/education/", "checkedAt": "2026-10-09T21:06:27Z", "sourceSha256": "a" * 64}
        result = collector.offerings(collector.tree(markup.encode("utf-8")), metadata, {"slug": "russia-123"})
        self.assertEqual([row["code"] for row in result], ["09.03.01", "38.05.01"])
        self.assertEqual([row["sourceSection"] for row in result], ["Бакалавриат", "Специалитет"])

    def test_curriculum_without_current_overview_is_not_an_implemented_listing(self):
        markup = '<html><body><table><tr itemprop="eduOp"><td itemprop="eduCode">09.03.01</td><td itemprop="eduName">Архивный план</td><td itemprop="eduLevel">Бакалавриат</td><td itemprop="eduForm">Очная</td></tr></table></body></html>'
        metadata = {"url": "https://example.edu.ru/sveden/education/", "checkedAt": "2026-10-09T21:06:27Z", "sourceSha256": "a" * 64}
        self.assertEqual(collector.offerings(collector.tree(markup.encode("utf-8")), metadata, {"slug": "russia-123"}), [])

    def test_common_email_preserves_first_explicit_address(self):
        document = collector.tree('<html><body><span itemprop="email">office@university.ru; admissions@university.ru</span></body></html>'.encode("utf-8"))
        metadata = {"url": "https://example.edu.ru/sveden/common/", "checkedAt": "2026-10-09T21:06:27Z", "sourceSha256": "a" * 64}
        self.assertEqual(collector.common_fields(document, metadata)["email"]["value"], "office@university.ru")

    def test_explicit_anti_spam_email_tokens_are_decoded(self):
        document = collector.tree('<html><body><span itemprop="email">office [at] sfu-kras [dot] ru</span></body></html>'.encode("utf-8"))
        metadata = {"url": "https://www.sfu-kras.ru/sveden/common/", "checkedAt": "2026-10-11T07:58:17Z", "sourceSha256": "a" * 64}
        result = collector.common_fields(document, metadata)["email"]
        self.assertEqual(result["value"], "office@sfu-kras.ru")
        self.assertEqual(result["sourceUrl"], metadata["url"])
        self.assertEqual(result["checkedAt"], metadata["checkedAt"])

    def test_explicit_implemented_overview_link_excludes_cohorts_and_dpo(self):
        markup = '<html><body><a href="/node/13687">Информация о реализуемых образовательных программах, в том числе о реализуемых адаптированных образовательных программах</a>'
        markup += '<a href="/node/13728">Информация об описании образовательной программы с приложением учебных планов</a>'
        markup += '<a href="/node/32598">Реализуемые дополнительные профессиональные программы</a>'
        markup += '<a href="/cohort.pdf">Реализуемые образовательные программы</a><a href="/sveden/education/eduAccred">Аккредитация программ</a></body></html>'
        self.assertEqual(collector.education_overview_links(collector.tree(markup.encode("utf-8")), "https://www.kubsu.ru/sveden/education/"), ["https://www.kubsu.ru/node/13687", "https://www.kubsu.ru/sveden/education/eduAccred"])

    def test_hostel_counts_keep_labels_and_ignore_internat_column(self):
        markup = '<html><body><table><tr><th>Показатель</th><th>Общежития</th><th>Интернаты</th></tr><tr><td>Количество общежитий</td><td itemprop="hostelInfo">30</td><td itemprop="interInfo">0</td></tr><tr><td>Количество мест</td><td itemprop="hostelNum">11904</td><td itemprop="interNum">0</td></tr></table></body></html>'
        metadata = {"url": "https://www.sfu-kras.ru/sveden/objects", "checkedAt": "2026-10-11T08:02:00Z", "sourceSha256": "a" * 64}
        result = collector.hostel_fields(collector.tree(markup.encode("utf-8")), metadata)
        self.assertEqual(result["hostelInfo"]["value"], "Количество общежитий: 30; Количество мест: 11904")
        self.assertEqual(result["hostelInfo"]["sourceSha256"], "a" * 64)
        self.assertEqual(collector.hostel_fields(collector.tree(b'<html><body><span itemprop="hostelInfo">30</span></body></html>'), metadata), {})

    def test_conflicting_residence_counts_keep_literal_text_and_raise_issue(self):
        markup = '<html><body><table><tr><td>Количество</td><td itemprop="hostelInfo">3</td></tr><tr><td>Количество жилых помещений для иногородних обучающихся</td><td itemprop="hostelNum">Нет</td></tr></table></body></html>'
        metadata = {"url": "https://www.cspu.ru:443/sveden/objects/", "checkedAt": "2026-10-11T08:01:03Z", "sourceSha256": "a" * 64}
        issues = []
        result = collector.hostel_fields(collector.tree(markup.encode("utf-8")), metadata, issues)
        self.assertEqual(result["hostelInfo"]["value"], "Количество: 3; Количество жилых помещений для иногородних обучающихся: Нет")
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["kind"], "source_inconsistent_residence_counts")
        self.assertEqual(issues[0]["sourceUrl"], metadata["url"])
        self.assertEqual(issues[0]["sourceSha256"], metadata["sourceSha256"])
        self.assertEqual(issues[0]["values"]["hostelNum"]["value"], "Нет")

    def test_checked_at_rejects_future_and_invalid_calendar_dates(self):
        now = datetime(2026, 10, 11, 8, 1, 3, tzinfo=timezone.utc)
        collector.validate_checked_at("2026-10-11T07:58:17Z", now)
        collector.validate_checked_at("2026-10-11T08:01:03Z", now)
        with self.assertRaisesRegex(ValueError, "future"):
            collector.validate_checked_at("2026-10-11T08:05:00Z", now)
        with self.assertRaises(ValueError):
            collector.validate_checked_at("2026-02-30T08:01:03Z", now)

    def test_rowspan_keeps_explicit_profiles_and_separate_forms(self):
        markup = '<html><body><table><tr itemprop="eduAccred"><td itemprop="eduCode" rowspan="3">09.03.01</td><td itemprop="eduName" rowspan="3">Информатика</td><td itemprop="eduLevel" rowspan="3">Бакалавриат</td><td itemprop="eduProf" rowspan="2">Системы</td><td itemprop="eduForm">Очная</td><td itemprop="eduPred">Дисциплины</td></tr>'
        markup += '<tr><td itemprop="eduForm">Заочная</td><td itemprop="eduPred">Дисциплины</td></tr>'
        markup += '<tr><td itemprop="eduProf">Программирование</td><td itemprop="eduForm">Очная</td><td itemprop="eduPred">Дисциплины</td></tr></table></body></html>'
        metadata = {"url": "https://example.edu.ru/sveden/education/", "checkedAt": "2026-10-09T21:06:27Z", "sourceSha256": "a" * 64}
        result = collector.offerings(collector.tree(markup.encode("utf-8")), metadata, {"slug": "russia-123"})
        self.assertEqual([(row["profile"], row["forms"]) for row in result], [("Системы", "Очная"), ("Системы", "Заочная"), ("Программирование", "Очная")])

    def test_structural_tree_uses_unit_link_instead_of_surrounding_layout_row(self):
        markup = '<html><body><table><tr><td><a href="/wrong">Layout</a><li itemprop="”structOrgUprav”"><span itemprop="name"><a href="/faculty">Физический факультет</a></span><span itemprop="site">https://example.edu.ru/faculty</span></li></td></tr></table></body></html>'
        metadata = {"url": "https://example.edu.ru/sveden/struct/", "checkedAt": "2026-10-09T21:06:27Z", "sourceSha256": "a" * 64}
        result = collector.structural_rows(collector.tree(markup.encode("utf-8")), metadata, {"slug": "russia-123", "name": "Университет", "directory": {"legalName": "Университет"}})
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["url"], "https://example.edu.ru/faculty")

    def test_cohort_duration_conflict_stays_unknown_without_splitting_program(self):
        def row(duration, forms="Заочная"):
            return '<tr itemprop="eduAccred"><td itemprop="eduCode">09.03.03</td><td itemprop="eduName">Прикладная информатика</td><td itemprop="eduProf">Корпоративные системы</td><td itemprop="eduLevel">Бакалавриат</td><td itemprop="eduForm">' + forms + '</td><td itemprop="learningTerm">' + duration + '</td></tr>'
        markup = '<html><body><table>' + row("5 лет") + row("4 года11 месяцев") + row("6 лет") + row("5 лет") + row("4 года", "Очная") + '</table></body></html>'
        metadata = {"url": "https://example.edu.ru/sveden/education/", "checkedAt": "2026-10-09T21:06:27Z", "sourceSha256": "a" * 64}
        issues = []
        result = collector.offerings(collector.tree(markup.encode("utf-8")), metadata, {"slug": "russia-123"}, issues)
        self.assertEqual(len(result), 2)
        self.assertIsNone(result[0]["duration"])
        self.assertEqual(result[1]["duration"], "4 года")
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["values"], ["5 лет", "4 года11 месяцев", "6 лет"])
        self.assertEqual(issues[0]["forms"], "Заочная")
        self.assertIsNone(result[0]["sourceYear"])
        self.assertIsNone(issues[0]["sourceYear"])
        self.assertEqual(issues[0]["checkedAt"], metadata["checkedAt"])
        self.assertEqual(issues[0]["sourceUrl"], metadata["url"])
        self.assertEqual(issues[0]["sourceSha256"], "a" * 64)

    def test_basic_higher_level_keeps_literal_source_level(self):
        markup = '<html><body><table><tr itemprop="eduAccred"><td itemprop="eduCode">09.03.01</td><td itemprop="eduName">Информатика</td><td itemprop="eduLevel">Базовое высшее образование</td><td itemprop="eduForm">Очная</td><td itemprop="learningTerm">4 года</td></tr></table></body></html>'
        metadata = {"url": "https://example.edu.ru/sveden/education/", "checkedAt": "2026-10-09T21:06:27Z", "sourceSha256": "a" * 64}
        result = collector.offerings(collector.tree(markup.encode("utf-8")), metadata, {"slug": "russia-123"})
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["level"], "Базовое высшее образование")
        self.assertEqual(result[0]["admissionsStatus"], "pending_review")
        self.assertIsNone(result[0]["sourceYear"])

    def test_daily_gap_batch_preserves_filled_sections_and_keeps_new_field_provenance(self):
        old_field = {"value": "Previously covered name", "sourceUrl": "https://example.edu.ru/common"}
        new_field = {"value": "office@example.edu.ru", "sourceUrl": "https://example.edu.ru/common", "checkedAt": "2026-10-11T08:01:03Z", "sourceSha256": "a" * 64}
        profile = {"universitySlug": "russia-1507", "fields": {"fullName": old_field, "email": new_field}, "faculties": [{"name": "Renamed alias in an already filled structure"}], "offerings": [{"id": "new-implemented-program"}]}
        kept, omitted = collector.retain_missing_sections(profile, {"missing": ["email", "educationalListings"]})
        self.assertEqual(kept["fields"], {"email": new_field})
        self.assertEqual(kept["faculties"], [])
        self.assertEqual(kept["offerings"], profile["offerings"])
        self.assertEqual(omitted, {"fields": 1, "faculties": 1, "offerings": 0})
        self.assertEqual(len(profile["fields"]), 2)
        self.assertEqual(len(profile["faculties"]), 1)

    def test_dated_gap_baseline_survives_coverage_after_publication(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            coverage = root / "coverage.json"
            output = root / "batch.json"
            coverage.write_text(json.dumps({"universities": [{"slug": "russia-1507", "missing": ["email", "educationalListings"]}]}), encoding="utf-8")
            baseline = collector.resolve_gap_baseline(output, coverage)
            output.write_text(json.dumps({"gapBaseline": baseline}), encoding="utf-8")
            coverage.write_text(json.dumps({"universities": [{"slug": "russia-1507", "missing": []}]}), encoding="utf-8")
            repeated = collector.resolve_gap_baseline(output, coverage)
            self.assertEqual(repeated, baseline)
            self.assertEqual(repeated["russia-1507"], ["email", "educationalListings"])
            self.assertEqual(collector.resolve_gap_baseline(root / "replay.json", coverage, output), baseline)
            profile = {"fields": {"email": {"value": "office@sfu-kras.ru"}}, "faculties": [], "offerings": [{"id": "preserved"}]}
            kept, omitted = collector.retain_missing_sections(profile, {"missing": repeated["russia-1507"]})
            self.assertEqual(kept, profile)
            self.assertEqual(omitted, {"fields": 0, "faculties": 0, "offerings": 0})

    def test_explicit_gap_baseline_cannot_silently_use_new_coverage(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            coverage = root / "coverage.json"
            coverage.write_text(json.dumps({"universities": []}), encoding="utf-8")
            legacy_batch = root / "legacy.json"
            legacy_batch.write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "must contain"):
                collector.resolve_gap_baseline(root / "replay.json", coverage, legacy_batch)
            legacy_batch.write_text(json.dumps({"gapBaseline": {"russia-1507": "educationalListings"}}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "must map"):
                collector.resolve_gap_baseline(root / "replay.json", coverage, legacy_batch)

    def test_case_yo_and_spacing_duplicates_keep_first_spelling_and_separate_forms(self):
        def row(profile, forms, title="Педагогическое образование"):
            return '<tr itemprop="eduAccred"><td itemprop="eduCode">44.03.05</td><td itemprop="eduName">' + title + '</td><td itemprop="eduProf">' + profile + '</td><td itemprop="eduLevel">бакалавриат</td><td itemprop="eduForm">' + forms + '</td></tr>'

        first = row("Информационные технологии и Математика", "Очная")
        markup = '<html><body><table>' + first
        markup += row("информационные   технологии и математика", "очная", "педагогическое образование")
        markup += row("Информационные технологии и Математика", "Заочная")
        markup += row("Прикладная математика и Учёт", "Очная")
        markup += row("прикладная математика и учет", "очная")
        markup += '</table></body></html>'
        metadata = {"url": "https://example.edu.ru/sveden/education/", "checkedAt": "2026-10-09T20:14:18Z", "sourceSha256": "a" * 64}
        result = collector.offerings(collector.tree(markup.encode("utf-8")), metadata, {"slug": "russia-123"})
        first_result = collector.offerings(collector.tree(('<html><body><table>' + first + '</table></body></html>').encode("utf-8")), metadata, {"slug": "russia-123"})
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0], first_result[0])
        self.assertEqual(result[0]["profile"], "Информационные технологии и Математика")
        self.assertEqual(result[0]["forms"], "Очная")
        self.assertEqual(result[1]["forms"], "Заочная")
        self.assertEqual(result[2]["profile"], "Прикладная математика и Учёт")

    def test_link_with_credentials_is_not_collected(self):
        document = collector.tree(b'<html><body><a href="https://user:pass@example.edu.ru/">bad</a><a href="/sveden/struct/">Structure</a></body></html>')
        self.assertEqual(collector.links(document, "https://example.edu.ru/"), [("Structure", "https://example.edu.ru/sveden/struct/")])


if __name__ == "__main__":
    unittest.main()

"""Regressions for the reviewed Moscow batch's applicant-facing distinctions."""
import runpy
import unittest
from pathlib import Path

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
M = runpy.run_path(str(ROOT / "scripts/collect-moscow-reviewed-enrichment.py"))
META = {"url": "https://mgppu.ru/sveden/education", "checkedAt": "2026-10-22T08:24:15+00:00", "sourceSha256": "a" * 64}


def row(code="37.03.01", title="Психология", profile="Консультирование", level="Высшее образование - бакалавриат", forms="очная", duration="4 года"):
    return '<tr>' + ''.join('<td itemprop="' + k + '">' + v + '</td>' for k, v in zip(
        ["eduCode", "eduName", "eduProf", "eduLevel", "eduForm", "learningTerm"],
        [code, title, profile, level, forms, duration])) + '</tr>'


class EducationalAssociationTests(unittest.TestCase):
    def parse(self, rows):
        return M["education_rows"](html.fromstring('<table>' + rows + '</table>'), META, "mgppu")

    def test_forms_keep_their_own_terms(self):
        rows, evidence, issues = self.parse(row(forms="очная", duration="4 года") + row(forms="очно-заочная", duration="4 года 6 месяцев"))
        self.assertEqual([(r["forms"], r["duration"]) for r in rows], [("очная", "4 года"), ("очно-заочная", "4 года 6 месяцев")])
        self.assertEqual(len(evidence), 2)
        self.assertEqual(issues, [])
        self.assertTrue(all(r["sourceYear"] is None and r["admissionsStatus"] == "pending_review" for r in rows))
        self.assertTrue(all(r["checkedAt"] == META["checkedAt"] for r in rows))

    def test_rowspan_never_borrows_identity_from_adjacent_program(self):
        first = row(profile="Исследования").replace('itemprop="eduCode"', 'rowspan="2" itemprop="eduCode"')
        incomplete = '<tr><td itemprop="eduProf">Практика</td><td itemprop="eduLevel">Бакалавриат</td><td itemprop="eduForm">заочная</td><td itemprop="learningTerm">5 лет</td></tr>'
        rows, _, _ = self.parse(first + incomplete)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["profile"], "Исследования")

    def test_unpaired_forms_and_bare_term_remain_unknown(self):
        rows, _, issues = self.parse(row(forms="очная, заочная", duration="4 года") + row(profile="Иное", duration="4"))
        self.assertTrue(all(r["duration"] is None for r in rows))
        self.assertEqual({i["kind"] for i in issues}, {"unpaired_multiple_forms", "duration_missing_unit"})

    def test_cohort_duration_disagreement_is_not_resolved_by_first_row(self):
        rows, _, _ = self.parse(row(profile="Практика (2025)", duration="4 года") + row(profile="Практика (2026)", duration="5 лет"))
        collapsed, issues = M["HELPERS"]["collapse_rows"](rows, "mgppu")
        self.assertEqual(len(collapsed), 1)
        self.assertIsNone(collapsed[0]["duration"])
        self.assertEqual(issues[0]["kind"], "duration_conflict")

    def test_conflicting_levels_are_excluded_before_identity_collapse(self):
        rows, evidence, _ = self.parse(
            row(code="38.05.01", title="Экономическая безопасность", level="Бакалавр", duration="5 лет")
            + row(code="38.05.01", title="Экономическая безопасность", level="Специалист", duration="5 лет")
            + row(code="38.05.01", title="Экономическая безопасность", level="Специалист", forms="заочная", duration="5 лет")
            + row(profile="Другой профиль"))
        evidence[0]["tableIndex"], evidence[1]["tableIndex"] = 2, 3
        kept, issues = M["exclude_conflicting_levels"](rows, evidence, "rsuh")
        self.assertEqual([(r["code"], r["forms"]) for r in kept], [("38.05.01", "заочная"), ("37.03.01", "очная")])
        self.assertEqual(len(issues), 1)
        issue = issues[0]
        self.assertEqual(issue["kind"], "source_level_conflict")
        self.assertEqual(set(issue["publishedLevels"]), {"Бакалавр", "Специалист"})
        self.assertEqual({r["tableIndex"] for r in issue["sourceRows"]}, {2, 3})
        self.assertEqual({r["publishedFields"]["eduLevel"] for r in issue["sourceRows"]}, {"Бакалавр", "Специалист"})
        self.assertTrue(all(r["sourceUrl"] == META["url"] and r["checkedAt"] == META["checkedAt"] and r["sourceSha256"] == META["sourceSha256"] for r in issue["sourceRows"]))
        collapsed, _ = M["HELPERS"]["collapse_rows"](kept, "rsuh")
        self.assertEqual(len(collapsed), 2)

    def test_level_synonyms_do_not_conflict_or_infer_a_level_from_code(self):
        rows, evidence, _ = self.parse(row(code="38.05.01", level="Бакалавр") + row(code="38.05.01", level="Высшее образование - бакалавриат"))
        kept, issues = M["exclude_conflicting_levels"](rows, evidence, "rsuh")
        self.assertEqual(kept, rows)
        self.assertEqual(issues, [])

    def test_different_profiles_and_equivalent_mixed_labels_do_not_conflict(self):
        rows, evidence, _ = self.parse(row(profile="Первый", level="Бакалавр") + row(profile="Второй", level="Специалист")
            + row(profile="Смешанный", level="Специалитет, магистратура") + row(profile="Смешанный", level="Высшее образование - магистратура / специалитет"))
        kept, issues = M["exclude_conflicting_levels"](rows, evidence, "rsuh")
        self.assertEqual(kept, rows)
        self.assertEqual(issues, [])

    def test_published_code_punctuation_is_traceable(self):
        rows, evidence, _ = self.parse(row(code="02.03.03.", title="Математическое обеспечение и администрирование информационных систем"))
        self.assertEqual(rows[0]["code"], "02.03.03")
        self.assertEqual(evidence[0]["publishedFields"]["eduCode"], "02.03.03.")

    def test_specialist_qualification_is_an_eligible_he_level(self):
        rows, _, issues = self.parse(row(code="37.05.01", title="Клиническая психология", level="Специалист", duration="5 лет 6 месяцев"))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["level"], "Специалист")
        self.assertEqual(rows[0]["duration"], "5 лет 6 месяцев")
        self.assertEqual(issues, [])

    def test_non_offered_form_annotation_does_not_create_a_listing(self):
        rows, evidence, _ = self.parse(row(forms="очная (не реализуется)"))
        self.assertEqual(rows, [])
        self.assertEqual(evidence, [])

    def test_code_title_conflict_and_non_degree_row_are_excluded(self):
        rows, _, issues = self.parse(row(code="46.03.01", title="Культурология") + row(code="37.06.01", level="Аспирантура"))
        self.assertEqual(rows, [])
        self.assertEqual(issues[0]["kind"], "source_code_title_conflict")


class StructureScopeTests(unittest.TestCase):
    def test_main_campus_address_is_required(self):
        content = '<table><tr><td itemprop="name">Факультет психологии</td><td itemprop="addressStr">г. Нижний Новгород</td></tr></table>'
        with self.assertRaisesRegex(ValueError, "main-city address"):
            M["structural_units"](html.fromstring(content), META, "mgppu")

    def test_additional_and_other_city_selections_are_not_degree_schools(self):
        self.assertFalse(M["selected_unit"]("mgppu", "Факультет повышения квалификации"))
        self.assertFalse(M["selected_unit"]("mirea", "Институт международного образования"))
        self.assertFalse(M["selected_unit"]("mipt", "Физтех-школа авиационных и цифровых технологий (ПИШ ФАЛТ)"))
        self.assertFalse(M["selected_unit"]("mpei", "Институт дистанционного и дополнительного образования"))
        self.assertFalse(M["selected_unit"]("mpei", "Военно-инженерный институт"))
        self.assertFalse(M["selected_unit"]("rudn", "Факультет непрерывного медицинского образования"))

    def test_duplicate_leaders_do_not_duplicate_the_unit(self):
        r = '<tr><td itemprop="name">Факультет психологии</td><td itemprop="addressStr">Москва, Сретенка, 29</td></tr>'
        units, evidence = M["structural_units"](html.fromstring('<table>' + r + r + '</table>'), META, "mgppu")
        self.assertEqual(len(units), 1)
        self.assertEqual(len(evidence), 2)
        self.assertIsNone(units[0]["url"])


class GeneralFieldTests(unittest.TestCase):
    def test_mtuci_label_is_not_imported_as_name(self):
        tree = html.fromstring('<div><b itemprop="fullName">Полное наименование:</b><span>Московский университет</span></div>')
        fields = M["general_fields"](tree, META, {}, "mtuci")
        self.assertEqual(fields["fullName"]["value"], "Московский университет")

    def test_info_email_keeps_exact_role_from_source_and_prior_facts(self):
        tree = html.fromstring('<div><span itemprop="email">справочная: info@mipt.ru; ректор: rector@mipt.ru</span><span itemprop="telephone">+7 (495) 000-00-00</span></div>')
        fields = M["general_fields"](tree, META, {"telephone": {"value": "earlier value"}}, "mipt")
        self.assertEqual(fields["email"]["value"], "info@mipt.ru")
        self.assertNotIn("telephone", fields)


if __name__ == "__main__":
    unittest.main()

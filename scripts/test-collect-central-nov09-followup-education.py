"""Normative row, cohort, campus and HTML-base provenance regressions."""
import importlib.util
from pathlib import Path
import unittest

from lxml import html

SPEC = importlib.util.spec_from_file_location("central_followup", Path(__file__).with_name("collect-central-nov09-followup-education.py"))
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)
META = {"url": "https://ulstu.ru/sveden/education/", "sourceSha256": "a" * 64, "checkedAt": "2026-11-09T16:00:00Z"}
PROPS = ["eduCode", "eduName", "eduProf", "eduLevel", "eduForm", "learningTerm"]


def norm_row(code="09.03.01", title="Информатика и вычислительная техника", profile="Программные системы, 2026", level="Бакалавриат", form="Очная", duration="4 года"):
    values = [code, title, profile, level, form, duration]
    return '<tr itemprop="eduAccred">' + "".join('<td itemprop="' + prop + '">' + value + '</td>' for prop, value in zip(PROPS, values)) + '<td>Дисциплины</td><td>Практики</td></tr>'


def norm_table(rows, prefix="", heading=collector.NORMATIVE_SECTION):
    headers = ["Код", "Наименование", "Профиль", "Уровень", "Формы", "Нормативный срок обучения", "Дисциплины", "Практики"]
    return html.fromstring('<html><body>' + prefix + '<h2>' + heading + '</h2><table><thead><tr>' + "".join('<th>' + value + '</th>' for value in headers) + '</tr></thead><tbody>' + rows + '</tbody></table></body></html>')


def lstu_table(cohorts):
    headers = ["Год начала подготовки", "Код", "Наименование", "Уровень", "Профиль", "Реализуемые формы обучения"] + ["Документ"] * 9
    rows = []
    for cohort in cohorts:
        props = ["eduCode", "eduName", "eduLevel", "eduProf", "eduForm"]
        vals = ["09.03.01", "Информатика и вычислительная техника", "Высшее образование - бакалавриат", "Программные системы", "очная"]
        rows.append('<tr itemprop="eduOp"><td>' + cohort + '</td>' + "".join('<td itemprop="' + prop + '">' + value + '</td>' for prop, value in zip(props, vals)) + '</tr>')
    return html.fromstring('<html><body><h2>' + collector.LSTU_SECTION + '</h2><table><tr>' + "".join('<th>' + value + '</th>' for value in headers) + '</tr>' + "".join(rows) + '</table></body></html>')


class NormativeTests(unittest.TestCase):
    def parse(self, rows):
        issues, exclusions = [], []
        result, scope = collector.read_rows("russia-305", norm_table(rows), META, issues, exclusions)
        return result, issues, exclusions, scope

    def test_same_row_single_form_owns_normative_duration_and_unknown_admission_year(self):
        rows, issues, _, _ = self.parse(norm_row())
        item, locator = rows[0]
        self.assertEqual(item["duration"], "4 года")
        self.assertEqual(item["profile"], "Программные системы, 2026")
        self.assertIsNone(item["sourceYear"])
        self.assertEqual(item["admissionsStatus"], "pending_review")
        self.assertEqual(locator["durationRelation"]["publishedValue"], "4 года")
        self.assertTrue(locator["propertyXPaths"]["learningTerm"].endswith("td[6]"))
        self.assertEqual(issues, [])

    def test_two_form_row_is_preserved_once_and_duration_stays_unknown(self):
        rows, issues, _, _ = self.parse(norm_row(form="очная; заочная"))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][0]["forms"], "очная, заочная")
        self.assertIsNone(rows[0][0]["duration"])
        self.assertEqual(rows[0][1]["literalCells"]["eduForm"], "очная; заочная")
        self.assertEqual(issues[0]["kind"], "offering_duration_multiple_forms")

    def test_duration_without_units_is_not_promoted_to_years(self):
        rows, issues, _, _ = self.parse(norm_row(duration="4"))
        self.assertIsNone(rows[0][0]["duration"])
        self.assertEqual(issues[0]["kind"], "offering_duration_without_units")

    def test_source_decimal_spacing_is_not_repaired_by_guessing(self):
        rows, issues, _, _ = self.parse(norm_row(duration="5 ,5 лет"))
        self.assertIsNone(rows[0][0]["duration"])
        self.assertEqual(rows[0][1]["literalCells"]["learningTerm"], "5 ,5 лет")
        self.assertEqual(issues[0]["kind"], "malformed_decimal_duration")

    def test_bachelor_code_does_not_override_contradictory_level(self):
        rows, issues, _, _ = self.parse(norm_row(level="Специалитет, магистратура"))
        self.assertEqual(rows, [])
        self.assertEqual(issues[0]["kind"], "source_level_conflict")

    def test_master_row_excluded_before_import(self):
        rows, _, excluded, _ = self.parse(norm_row(code="09.04.01", level="Магистратура"))
        self.assertEqual(rows, [])
        self.assertEqual(excluded[0]["kind"], "outside_bachelor_specialist_scope")

    def test_explicit_other_campus_row_excluded(self):
        rows, _, excluded, _ = self.parse(norm_row(profile="Программные системы, Инзенский филиал"))
        self.assertEqual(rows, [])
        self.assertEqual(excluded[0]["kind"], "other_or_unclear_campus")

    def test_territorial_name_without_branch_word_is_still_reviewed(self):
        for city in ["Новоспасское", "Димитровград"]:
            with self.subTest(city=city):
                rows, _, excluded, _ = self.parse(norm_row(profile="Программные системы, " + city))
                self.assertEqual(rows, [])
                self.assertEqual(excluded[0]["kind"], "other_or_unclear_campus")

    def test_branch_section_cannot_hide_behind_generic_program_title(self):
        tree = norm_table(norm_row())
        body = tree.xpath('//body')[0]
        section = html.Element("section")
        heading = html.Element("h1")
        heading.text = "Инзенский филиал"
        section.append(heading)
        for node in list(body):
            section.append(node)
        body.append(section)
        with self.assertRaisesRegex(ValueError, "other-campus"):
            collector.selected_table("russia-305", tree)

    def test_statistics_heading_cannot_be_used_as_normative_inventory(self):
        with self.assertRaisesRegex(ValueError, "reviewed implementation section"):
            collector.selected_table("russia-305", norm_table(norm_row(), heading="Результаты приема"))

    def test_explicit_form_list_has_no_guessed_mode(self):
        node = html.fromstring('<td><ul><li>очная</li><li>очно-заочная</li></ul></td>')
        self.assertEqual(collector.form_value(node), ("очная, очно-заочная", "очная очно-заочная", ["очная", "очно-заочная"]))
        with self.assertRaisesRegex(ValueError, "unscoped extra text"):
            collector.form_value(html.fromstring('<td>Заочная<ul><li>очная</li></ul></td>'))


class CohortAssociationTests(unittest.TestCase):
    def test_start_of_study_filter_preserves_source_marker_without_admission_year(self):
        issues, exclusions = [], []
        meta = {**META, "url": collector.DETAILS["russia-117"]}
        rows, _ = collector.read_rows("russia-117", lstu_table(["2025", "2026"]), meta, issues, exclusions)
        self.assertEqual(len(rows), 1)
        self.assertIsNone(rows[0][0]["sourceYear"])
        self.assertIsNone(rows[0][0]["duration"])
        self.assertEqual(rows[0][1]["publishedStartOfStudy"], "2026")
        self.assertIn("год приёма не установлен", rows[0][0]["sourceSection"])
        self.assertEqual(exclusions[0]["kind"], "other_start_of_study_cohort")

    def test_actual_html_base_is_required_for_relative_detail_link(self):
        meta = {**META, "url": collector.INDEXES["russia-117"]}
        tree = html.fromstring('<html><head><base href="https://www.stu.lipetsk.ru/"></head><body><a href="sveden/education/edu_op/minobr/">Образовательные программы</a></body></html>')
        proof = collector.detail_association("russia-117", meta, tree, collector.DETAILS["russia-117"])
        self.assertEqual(proof["rawHref"], "sveden/education/edu_op/minobr/")
        self.assertEqual(proof["htmlBaseUrl"], "https://www.stu.lipetsk.ru/")
        tree.xpath('//base')[0].getparent().remove(tree.xpath('//base')[0])
        with self.assertRaisesRegex(ValueError, "explicit index link"):
            collector.detail_association("russia-117", meta, tree, collector.DETAILS["russia-117"])

    def test_html_base_cannot_escape_official_host(self):
        meta = {**META, "url": collector.INDEXES["russia-117"]}
        tree = html.fromstring('<html><head><base href="https://external.invalid/"></head><body><a href="sveden/education/edu_op/minobr/">Программы</a></body></html>')
        with self.assertRaisesRegex(ValueError, "official university domain"):
            collector.detail_association("russia-117", meta, tree, collector.DETAILS["russia-117"])


if __name__ == "__main__":
    unittest.main()

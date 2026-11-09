import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

from lxml import html

SPEC = importlib.util.spec_from_file_location("south", Path(__file__).with_name("collect-regional-south-enrichment.py"))
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)
META = {"url": "https://www.vvsu.ru/sveden/education/1/", "checkedAt": "2026-10-20T10:06:07Z", "sourceSha256": "a" * 64}
UNIVERSITY = {"slug": "russia-28"}


def parse(content, issues=None):
    return collector.offerings(html.fromstring(content), META, UNIVERSITY, issues)


def row(code="09.04.01", title="Информатика", profile="Анализ данных", level="Высшее образование - Магистратура", form="очная", term="2 года"):
    return "<tr>" + "".join('<td itemprop="' + prop + '">' + value + "</td>" for prop, value in [("eduCode", code), ("eduName", title), ("eduProf", profile), ("eduLevel", level), ("eduForm", form), ("learningTerm", term)]) + "</tr>"


class SouthernBatchTests(unittest.TestCase):
    def test_explicit_table_overview_keeps_masters_and_unknown_intake(self):
        entries = parse('<table itemprop="eduAccred">' + row() + "</table>")
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["duration"], "2 года")
        self.assertIsNone(entries[0]["sourceYear"])
        self.assertEqual(entries[0]["admissionsStatus"], "pending_review")

    def test_student_statistics_and_cohort_curricula_do_not_add_volume(self):
        self.assertEqual(parse('<table itemprop="eduStud">' + row() + '</table><table itemprop="eduOp">' + row() + '</table>'), [])
        self.assertEqual(parse('<table itemprop="eduAccred"><tr><th>Численность обучающихся</th></tr>' + row() + "</table>"), [])

    def test_spo_postgraduate_and_dpo_are_excluded(self):
        cases = [row(code="09.02.01", level="Среднее профессиональное образование"), row(code="2.3.1", level="Аспирантура"), row(level="Дополнительное профессиональное образование")]
        self.assertEqual(parse('<table itemprop="eduAccred">' + "".join(cases) + "</table>"), [])

    def test_rowspan_preserves_form_specific_terms(self):
        content = '<table itemprop="eduAccred"><tr><td itemprop="eduCode" rowspan="2">09.04.01</td><td itemprop="eduName" rowspan="2">Информатика</td><td itemprop="eduProf" rowspan="2">Анализ данных</td><td itemprop="eduLevel" rowspan="2">Высшее образование - Магистратура</td><td itemprop="eduForm">очная</td><td itemprop="learningTerm">2 года</td></tr><tr><td itemprop="eduForm">заочная</td><td itemprop="learningTerm">2 года 6 месяцев</td></tr></table>'
        entries = parse(content)
        self.assertEqual([(r["forms"], r["duration"]) for r in entries], [("очная", "2 года"), ("заочная", "2 года 6 месяцев")])

    def test_conflicting_duration_is_unknown_with_source_issue(self):
        issues = []
        entries = parse('<table itemprop="eduAccred">' + row() + row(term="2 года 6 месяцев") + "</table>", issues)
        self.assertEqual(len(entries), 1)
        self.assertIsNone(entries[0]["duration"])
        self.assertEqual(issues[0]["values"], ["2 года", "2 года 6 месяцев"])

    def test_only_explicitly_linked_vvgu_overview_is_followed(self):
        doc = html.fromstring('<div><a href="/sveden/education/1/">Информация о сроке действия государственной аккредитации, о языках, на которых осуществляется образование (обучение)</a><a href="/sveden/education/2/">Информация о численности обучающихся</a><a href="/sveden/education/5/">Информация по образовательным программам</a></div>')
        self.assertEqual(collector.education_overview_links(doc, "https://www.vvsu.ru/sveden/education/"), [META["url"]])

    def test_questionable_units_are_omitted_only_for_vvgu(self):
        collector.install_overrides()
        university = {"slug": "russia-28", "name": "ВВГУ", "directory": {"legalName": "Владивостокский государственный университет"}}
        for name in collector.UNCERTAIN_VVGU_UNITS:
            self.assertFalse(collector.base.academic(name, university))
        self.assertTrue(collector.base.academic("Институт права", university))

    def test_unit_link_whitespace_does_not_change_fact_provenance(self):
        unit = {"name": "Инженерная школа", "url": " https://engineer.vvsu.ru ", "sourceUrl": "https://www.vvsu.ru/sveden/struct/", "sourceSha256": "b" * 64}
        with patch.object(collector, "SHARED_STRUCTURAL_ROWS", return_value=[unit]):
            entries = collector.structural_rows(None, META, UNIVERSITY)
        self.assertEqual(entries[0]["url"], "https://engineer.vvsu.ru")
        self.assertEqual(entries[0]["sourceUrl"], "https://www.vvsu.ru/sveden/struct/")
        self.assertEqual(entries[0]["sourceSha256"], "b" * 64)

    def test_ussuriysk_unit_is_excluded_with_its_own_address_and_provenance(self):
        document = html.fromstring('<table><tr itemprop="structOrgUprav"><td itemprop="name">Педагогический институт </td><td itemprop="addressStr">692500, Приморский край, г. Уссурийск, ул. Володарского, 67 </td></tr></table>')
        metadata = {**META, "url": "https://www.vvsu.ru/sveden/struct/"}
        with patch.object(collector, "SHARED_STRUCTURAL_ROWS", return_value=[{"name": "Педагогический институт", "url": None}, {"name": "Институт права", "url": None}]):
            entries = collector.structural_rows(document, metadata, UNIVERSITY)
        self.assertEqual([row["name"] for row in entries], ["Институт права"])
        issue = collector.other_city_unit_issues(document, metadata, UNIVERSITY)[0]
        self.assertEqual(issue["publishedAddress"], "692500, Приморский край, г. Уссурийск, ул. Володарского, 67")
        self.assertEqual(issue["kind"], "other_city_unit_excluded")
        self.assertEqual(issue["sourceSha256"], META["sourceSha256"])
        self.assertEqual(issue["checkedAt"], META["checkedAt"])

    def test_same_name_in_vladivostok_or_another_university_is_not_excluded(self):
        for address, university in [("г. Владивосток, ул. Гоголя, 41", UNIVERSITY), ("г. Уссурийск, ул. Володарского, 67", {"slug": "russia-other"})]:
            document = html.fromstring('<table><tr itemprop="structOrgUprav"><td itemprop="name">Педагогический институт</td><td itemprop="addressStr">' + address + '</td></tr></table>')
            self.assertEqual(collector.other_city_unit_issues(document, META, university), [])


if __name__ == "__main__":
    unittest.main()

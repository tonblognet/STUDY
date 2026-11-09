"""Scope and per-row provenance regressions for continuation structure evidence."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

from lxml import html

SPEC = importlib.util.spec_from_file_location("continuation_structure", Path(__file__).with_name("collect-regional-nov09-continuation-structure.py"))
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)
META = {"url": "https://volsu.ru/sveden/struct/", "sourceSha256": "a" * 64, "checkedAt": "2026-11-09T10:00:00Z"}
NAME = "Институт естественных наук"


def document(markup):
    return html.fromstring("<html><body>" + markup + "</body></html>")


def row(name=NAME, city="Волгоград", site="/struct/institutes/ien/", marked_address=True):
    prop = ' itemprop="addressStr"' if marked_address else ""
    return '<tr><td itemprop="name">' + name + '</td><td>Директор</td><td>Должность</td><td' + prop + '>г. ' + city + ', Университетский, 100</td><td itemprop="site"><a href="' + site + '">Сайт института</a></td></tr>'


class UnitScopeTests(unittest.TestCase):
    def parse(self, markup):
        with patch.dict(collector.REVIEWED_UNITS, {"russia-36": [NAME]}):
            return collector.academic_units("russia-36", document(markup), META, "г. Волгоград")

    def test_whole_table_itemprop_never_changes_unit_url_to_rectors_url(self):
        markup = '<table itemprop="structOrgUprav">' + row("Ректор", site="/rector/") + row() + '</table>'
        units, evidence = self.parse(markup)
        self.assertEqual(units[0]["url"], "https://volsu.ru/struct/institutes/ien/")
        self.assertNotIn("Ректор", evidence[0]["literalRowText"])
        self.assertTrue(evidence[0]["rowXPath"].endswith("tr[2]"))

    def test_other_city_branch_is_rejected_despite_reviewed_name(self):
        with self.assertRaisesRegex(ValueError, "main-city"):
            self.parse('<table>' + row(city="Волжский") + '</table>')

    def test_duplicate_exact_unit_is_rejected_instead_of_choosing_a_url(self):
        with self.assertRaisesRegex(ValueError, "duplicated"):
            self.parse('<table>' + row() + row(site="/changed/") + '</table>')

    def test_missing_unit_is_rejected_instead_of_silent_partial_success(self):
        with self.assertRaisesRegex(ValueError, "changed"):
            self.parse('<table>' + row(name="Новый институт") + '</table>')

    def test_other_faculty_and_preparatory_unit_are_not_automatically_approved(self):
        units, _ = self.parse('<table>' + row() + row(name="Факультет довузовской подготовки") + row(name="Другой факультет") + '</table>')
        self.assertEqual([unit["name"] for unit in units], [NAME])

    def test_unmarked_address_uses_same_rows_fourth_column(self):
        units, evidence = self.parse('<table>' + row(marked_address=False) + '</table>')
        self.assertEqual(len(units), 1)
        self.assertEqual(evidence[0]["address"], "г. Волгоград, Университетский, 100")

    def test_foreign_unit_link_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "official university domain"):
            self.parse('<table>' + row(site="https://external.invalid/faculty/") + '</table>')

    def test_lipetsk_cityless_street_requires_exact_main_campus_match(self):
        self.assertIn("Липецке", collector.verify_campus("russia-117", "ул. Московская, 30, к5-291", "398055, Россия, г. Липецк, ул. Московская, д. 30"))
        with self.assertRaisesRegex(ValueError, "main-city"):
            collector.verify_campus("russia-117", "ул. Московская, 31, к5-291", "398055, Россия, г. Липецк, ул. Московская, д. 30")
        with self.assertRaisesRegex(ValueError, "main-city"):
            collector.verify_campus("russia-117", "ул. Московская, 30, к5-291", "г. Елец, ул. Московская, д. 30")


class CommonFieldTests(unittest.TestCase):
    def markup(self, email="rector@volsu.ru"):
        values = {"fullName": "Федеральный университет", "shortName": "ВолГУ", "regDate": "1980 г.", "address": "г. Волгоград", "telephone": "+7 (8442) 460-263", "email": email}
        return "".join('<p itemprop="' + key + '">' + value + '</p>' for key, value in values.items())

    def test_literal_year_only_date_is_not_invented_as_a_day(self):
        fields, evidence = collector.common_fields(document(self.markup()), META)
        self.assertEqual(fields["regDate"]["value"], "1980 г.")
        self.assertEqual(evidence[2]["literalFieldText"], "1980 г.")
        self.assertEqual(fields["regDate"]["sourceSha256"], META["sourceSha256"])

    def test_labeled_or_multiple_email_addresses_are_not_silently_converted(self):
        with self.assertRaisesRegex(ValueError, "single address"):
            collector.common_fields(document(self.markup("Email: rector@volsu.ru")), META)

    def test_missing_email_cannot_be_taken_from_unmarked_footer(self):
        markup = self.markup().replace('<p itemprop="email">rector@volsu.ru</p>', '<footer>rector@volsu.ru</footer>')
        with self.assertRaisesRegex(ValueError, "Missing exact common field email"):
            collector.common_fields(document(markup), META)

    def test_soft_404_http_200_is_not_a_university_source(self):
        markup = "<html><head><title>Ошибка 404 (Not Found)</title></head><body>" + self.markup() + "x" * 600 + "</body></html>"
        with patch.object(collector.safe, "load_evidence", return_value=(META, html.fromstring(markup))):
            with self.assertRaisesRegex(ValueError, "soft error"):
                collector.source(Path("."), "russia-36", META["url"])


if __name__ == "__main__":
    unittest.main()

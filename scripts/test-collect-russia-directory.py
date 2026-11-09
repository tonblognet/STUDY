"""Regression checks for source irregularities found in the national collection."""

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    "russia_collector", Path(__file__).with_name("collect-russia-directory.py")
)
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)


class CollectionSourceRegressionTests(unittest.TestCase):
    def test_email_in_website_field_is_not_a_website(self):
        for value in [
            "belovokuzgtu@mail.ru",
            "http://belovokuzgtu@mail.ru",
            "https://user:password@example.edu.ru/",
        ]:
            with self.subTest(value=value):
                self.assertIsNone(collector.website_url(value))
        self.assertEqual(collector.website_url("kf.bmstu.ru"), "http://kf.bmstu.ru")

    def test_city_comes_from_explicit_address_when_source_labels_conflict(self):
        self.assertEqual(
            collector.address_city("г. Назрань", "386001, Республика Ингушетия, город Магас, пр-кт И.Зязикова, д. 7"),
            ("Магас", True),
        )
        self.assertEqual(
            collector.address_city("п. Красный Воин", "141570, Московская обл, г Солнечногорск, рп Менделеево, ш Льяловское, д 1"),
            ("рп Менделеево", True),
        )
        self.assertEqual(
            collector.address_city("г. Тверь", "ул. Спартака, д.26а"),
            ("Тверь", False),
        )

    def collect_fixture(self, authority):
        markup = f"""<html><body><table>
        <tr><td class="tt">Наименование образовательной организации</td><td>Калужский филиал университета</td></tr>
        <tr><td class="tt">Регион,адрес</td><td><span id="post">248000, г Калуга, ул Баженова, д 2</span></td></tr>
        <tr><td class="tt">Ведомственная принадлежность</td><td>{authority}</td></tr>
        <tr><td class="tt">web-сайт</td><td>kf.bmstu.ru</td></tr>
        </table><table id="analis_reg"><tr><td>09.00.00 - Информатика и вычислительная техника</td></tr></table>
        <table><tr><td class="tt">Наименование образовательной организации</td><td>Родительский университет в Москве</td></tr></table>
        </body></html>"""
        row = {
            "monitoringId": "10000479", "kind": "branch", "sourceIcon": "_0",
            "sourceCity": "г. Калуга", "region": "Калужская область",
            "federalDistrict": "Центральный федеральный округ",
            "listSourceUrl": "https://monitoring.miccedu.ru/iam/2025/_vpo/material.php?type=2&id=10307",
        }
        with tempfile.TemporaryDirectory() as folder:
            fixture = Path(folder) / "branch.html"
            fixture.write_text(markup, encoding="utf-8")
            metadata = {"httpStatus": "200", "exitCode": 0, "checkedAt": "2026-10-09T20:06:26Z", "sourceSha256": "a" * 64}
            with patch.object(collector, "fetch", return_value=(fixture, metadata)):
                return collector.collect_institution(row, metadata["checkedAt"], False)

    def test_branch_keeps_own_identity_instead_of_appended_parent(self):
        university, profile, _ = self.collect_fixture("Министерство науки и высшего образования Российской Федерации")
        self.assertEqual(university["name"], "Калужский филиал университета")
        self.assertEqual(university["directory"]["kind"], "branch")
        self.assertEqual(university["directory"]["ownership"], "state")
        self.assertEqual(profile["educationAreas"][0]["code"], "09.00.00")
        self.assertEqual(profile["educationAreas"][0]["sourceYear"], 2025)
        self.assertEqual(profile["offerings"], [])

    def test_unmapped_authority_is_not_assumed_to_be_state(self):
        with self.assertRaisesRegex(ValueError, "unmapped_source_authority"):
            self.collect_fixture("Непроверенная организация")


if __name__ == "__main__":
    unittest.main()

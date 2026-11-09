"""Semantic regressions for the reviewed regional contact batch."""

import copy
import importlib.util
from pathlib import Path
import unittest
from lxml import html

spec = importlib.util.spec_from_file_location("contacts_continuation", Path(__file__).with_name("collect-contacts-nov09-continuation.py"))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class ReviewedContactTests(unittest.TestCase):
    def row(self, key="admissionsEmail", value="cpk@sgu.ru", evidence=None):
        return collector.reviewed("russia-258", key, "https://www.sgu.ru/node/235357", "//section", evidence or value, value, "admissions-office")

    def test_contact_requires_explicit_office_context(self):
        row = self.row()
        row["context"] = "general-footer"
        with self.assertRaisesRegex(ValueError, "context"):
            collector.validate_review(row, html.fromstring("<section>cpk@sgu.ru</section>"), {})

    def test_contact_does_not_fall_back_to_neighbouring_department(self):
        row = self.row(evidence="cpk@sgu.ru")
        row["xpath"] = '//section[@id="commission"]'
        tree = html.fromstring('<div><section id="commission">Информация уточняется</section><section>cpk@sgu.ru</section></div>')
        with self.assertRaisesRegex(ValueError, "evidence missing"):
            collector.validate_review(row, tree, {})

    def test_contact_value_must_be_literal(self):
        row = self.row(value="inferred@sgu.ru", evidence="cpk@sgu.ru")
        with self.assertRaisesRegex(ValueError, "not present"):
            collector.validate_review(row, html.fromstring("<section>cpk@sgu.ru</section>"), {})

    def test_both_central_email_addresses_are_preserved(self):
        row = self.row(value="abitur@uniyar.ac.ru; priem@uniyar.ac.ru", evidence="e-mail: abitur@uniyar.ac.ru priem@uniyar.ac.ru")
        value, _ = collector.validate_review(row, html.fromstring("<section><b>e-mail</b>: abitur@uniyar.ac.ru priem@uniyar.ac.ru</section>"), {})
        self.assertEqual(value, "abitur@uniyar.ac.ru; priem@uniyar.ac.ru")

    def test_ministry_email_is_not_admissions_office(self):
        row = self.row(value="info@minobrnauki.gov.ru")
        with self.assertRaisesRegex(ValueError, "Ministry"):
            collector.validate_review(row, html.fromstring("<section>info@minobrnauki.gov.ru</section>"), {})

    def test_url_requires_reviewed_page_and_uses_actual_destination(self):
        row = self.row(key="admissionsUrl", evidence="Приёмная комиссия")
        tree = html.fromstring("<section>Приёмная комиссия</section>")
        with self.assertRaisesRegex(ValueError, "page context"):
            collector.validate_review(row, tree, {"url": row["requestedUrl"]})
        row["context"] = "admissions-page"
        actual = "https://www.sgu.ru/official-redirect/"
        value, _ = collector.validate_review(row, tree, {"url": actual})
        self.assertEqual(value, actual)

    def test_housing_retains_explicit_restriction_and_note(self):
        text = "Места предоставляются на период сессии при наличии свободных."
        row = self.row(key="hostelInfo", value=text)
        row["context"] = "housing-description"
        value, _ = collector.validate_review(row, html.fromstring(f"<section>{text}</section>"), {})
        self.assertEqual(value, text + collector.HOSTEL_NOTE)
        self.assertIn("при наличии свободных", value)

    def test_frozen_baseline_field_is_never_overwritten(self):
        baseline = {"fields": {r["universitySlug"]: {} for r in collector.REVIEWED}}
        first = collector.REVIEWED[0]
        baseline["fields"][first["universitySlug"]][first["field"]] = {"value": "old"}
        original = copy.deepcopy(baseline)
        with self.assertRaisesRegex(ValueError, "overwrite baseline"):
            collector.build(Path("no-fixtures-needed"), baseline)
        self.assertEqual(baseline, original)

    def test_review_has_unique_fields_and_no_admission_parameters(self):
        keys = [(r["universitySlug"], r["field"]) for r in collector.REVIEWED]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(len(keys), 21)
        self.assertEqual({r["field"] for r in collector.REVIEWED}, {"admissionsUrl", "admissionsPhone", "admissionsEmail", "hostelInfo"})


if __name__ == "__main__":
    unittest.main()

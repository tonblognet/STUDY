"""Regressions for follow-up contacts: exact office scope and housing restrictions."""

import copy
import importlib.util
from pathlib import Path
import unittest
from lxml import html

spec = importlib.util.spec_from_file_location("followup_contacts", Path(__file__).with_name("collect-contacts-nov09-followup.py"))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class FollowupContactTests(unittest.TestCase):
    def row(self, key="admissionsEmail", value="pk@ulsu.ru", evidence=None):
        return collector.reviewed("russia-306", key, "https://ulsu.ru/", "//section", evidence or value, value, "admissions-office")

    def test_ambiguous_office_blocks_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "exactly one"):
            collector.validate_review(self.row(), html.fromstring("<div><section>pk@ulsu.ru</section><section>pk@ulsu.ru</section></div>"), {})

    def test_neighbouring_institute_email_is_not_central_email(self):
        row = self.row(value="pk-fai@lstu.ru", evidence="Ответственный секретарь: +7 (4742) 328-223")
        with self.assertRaisesRegex(ValueError, "not present"):
            collector.validate_review(row, html.fromstring("<section>Ответственный секретарь: +7 (4742) 328-223</section>"), {})

    def test_ministry_email_is_not_central_email(self):
        row = self.row(value="priem@minobrnauki.gov.ru")
        with self.assertRaisesRegex(ValueError, "Ministry"):
            collector.validate_review(row, html.fromstring("<section>priem@minobrnauki.gov.ru</section>"), {})

    def test_housing_fund_condition_is_preserved(self):
        row = next(r for r in collector.REVIEWED if r["universitySlug"] == "russia-117" and r["field"] == "hostelInfo")
        fixture = copy.deepcopy(row)
        fixture["xpath"] = "//section"
        value, _ = collector.validate_review(fixture, html.fromstring("<section>" + row["evidence"] + "</section>"), {})
        self.assertIn("при наличии соответствующего жилищного фонда", value)
        self.assertTrue(value.endswith(collector.base.HOSTEL_NOTE))

    def test_may_be_provided_is_not_replaced_with_guarantee(self):
        row = next(r for r in collector.REVIEWED if r["universitySlug"] == "russia-305" and r["field"] == "hostelInfo")
        self.assertIn("может быть предоставлено", row["value"])
        self.assertIn("вне г.Ульяновска", row["value"])

    def test_baseline_protects_old_fact_before_reading_sources(self):
        baseline = {"fields": {slug: {} for slug in collector.TARGETS}}
        first = collector.REVIEWED[0]
        baseline["fields"][first["universitySlug"]][first["field"]] = {"value": "old"}
        before = copy.deepcopy(baseline)
        with self.assertRaisesRegex(ValueError, "overwrite baseline"):
            collector.build(Path("no-snapshots-needed"), baseline)
        self.assertEqual(baseline, before)

    def test_manifest_has_no_unknown_lgtu_email_or_admission_parameters(self):
        keys = {(r["universitySlug"], r["field"]) for r in collector.REVIEWED}
        self.assertEqual(len(keys), len(collector.REVIEWED))
        self.assertEqual(len(keys), 14)
        self.assertNotIn(("russia-117", "admissionsEmail"), keys)
        self.assertNotIn(("russia-306", "hostelInfo"), keys)
        self.assertEqual({r["field"] for r in collector.REVIEWED}, {"admissionsUrl", "admissionsPhone", "admissionsEmail", "hostelInfo"})


if __name__ == "__main__":
    unittest.main()

"""Offline regressions for reviewed November 9 educational inventories."""

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("continuation", Path(__file__).with_name("collect-regional-nov09-continuation-education.py"))
batch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(batch)
META = {
    "url": "https://isu.ru/sveden/addpages_single/edu_och_1/",
    "sourceSha256": "a" * 64,
    "checkedAt": "2026-11-09T15:43:20Z",
}


def row(code="09.03.01", level="Бакалавриат", profile="Программирование, 2026", form="Очная"):
    return (
        '<tr itemprop="eduOp">'
        f'<td itemprop="eduCode">{code}</td>'
        '<td itemprop="eduName">Информатика и вычислительная техника</td>'
        f'<td itemprop="eduLevel">{level}</td>'
        f'<td itemprop="eduProf">{profile}</td>'
        f'<td itemprop="eduForm">{form}</td></tr>'
    )


def document(rows, header=""):
    return batch.base.shared.html.fromstring(
        '<html><body><h1>Информация по образовательным программам</h1><table>'
        + header + rows + '</table></body></html>'
    )


class ContinuationEducationTests(unittest.TestCase):
    def parse(self, rows, slug="russia-83"):
        issues, exclusions = [], []
        result = batch.read_rows(slug, document(rows), META, issues, exclusions)
        return result, issues, exclusions

    def test_isu_curriculum_suffix_remains_literal_and_does_not_become_admission_year(self):
        rows, _, excluded = self.parse(row() + row(profile="Программирование, 2025"))
        self.assertEqual(len(rows), 1)
        item = rows[0][0]
        self.assertEqual(item["profile"], "Программирование, 2026")
        self.assertIsNone(item["sourceYear"])
        self.assertIsNone(item["duration"])
        self.assertEqual(item["admissionsStatus"], "pending_review")
        self.assertIn("год приёма не установлен", item["sourceSection"])
        self.assertEqual(excluded[0]["kind"], "isu_other_curriculum_cohort")

    def test_isu_does_not_accept_partial_year_or_embedded_2026(self):
        rows, _, excluded = self.parse(row(profile="Профиль 2026, 2025") + row(profile="Профиль, 20260"))
        self.assertEqual(rows, [])
        self.assertEqual(len(excluded), 2)

    def test_explicit_ystu_form_list_preserves_each_item_and_its_literal_evidence(self):
        rows, _, _ = self.parse(row(form="<ul><li>Очная</li><li>Заочная</li><li>Очно-заочная</li></ul>"), "russia-341")
        item, evidence = rows[0]
        self.assertEqual(item["forms"], "Очная, Заочная, Очно-заочная")
        self.assertEqual(evidence["publishedFormItems"], ["Очная", "Заочная", "Очно-заочная"])
        self.assertEqual(evidence["literalCells"]["eduForm"], "Очная Заочная Очно-заочная")
        self.assertIsNone(item["duration"])

    def test_form_typo_or_concatenated_text_is_not_guessed(self):
        rows, issues, _ = self.parse(row(form="очнаz") + row(form="ОчнаяЗаочная"), "russia-341")
        self.assertEqual(rows, [])
        self.assertTrue(all(i["kind"] == "offering_form_unrecognized_excluded" for i in issues))

    def test_form_list_with_unscoped_extra_text_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "outside its explicit items"):
            self.parse(row(form="<ul><li>Очная</li></ul>в филиале"), "russia-341")

    def test_specialist_code_does_not_resolve_published_mixed_level(self):
        rows, issues, _ = self.parse(row(code="10.05.01", level="Специалитет, магистратура"))
        self.assertEqual(rows, [])
        self.assertEqual(issues[0]["kind"], "source_level_conflict")

    def test_rowspan_continuation_has_its_own_form(self):
        first = row().replace('itemprop="eduCode"', 'itemprop="eduCode" rowspan="2"')
        first = first.replace('itemprop="eduName"', 'itemprop="eduName" rowspan="2"')
        first = first.replace('itemprop="eduLevel"', 'itemprop="eduLevel" rowspan="2"')
        first = first.replace('itemprop="eduProf"', 'itemprop="eduProf" rowspan="2"')
        continuation = '<tr><td itemprop="eduForm">Очно-заочная</td></tr>'
        rows, _, _ = self.parse(first + continuation)
        self.assertEqual([item["forms"] for item, _ in rows], ["Очная", "Очно-заочная"])
        self.assertEqual([item["code"] for item, _ in rows], ["09.03.01", "09.03.01"])

    def test_branch_and_unselected_levels_are_excluded(self):
        rows, _, exclusions = self.parse(row(profile="Братский филиал, 2026") + row(code="09.04.01", level="Магистратура"))
        self.assertEqual(rows, [])
        self.assertEqual([r["kind"] for r in exclusions], ["other_or_unclear_campus", "outside_bachelor_specialist_scope"])

    def test_statistics_table_is_not_interpreted_as_educational_inventory(self):
        with self.assertRaisesRegex(ValueError, "statistics"):
            batch.read_rows("russia-83", document(row(), '<tr><th>Численность обучающихся</th></tr>'), META, [], [])

    def test_missing_microdata_column_fails_closed(self):
        markup = row().replace('itemprop="eduForm"', 'itemprop="other"')
        with self.assertRaisesRegex(ValueError, "columns changed"):
            self.parse(markup)

    def test_detail_page_must_be_linked_by_official_index(self):
        meta = {"url": "https://ystu.ru/sveden/education/"}
        tree = batch.base.shared.html.fromstring('<a href="eduOp/">Реализуемые программы</a>')
        found = batch.association("russia-341", meta, tree, "https://ystu.ru/sveden/education/eduOp/")
        self.assertEqual(found["publishedLabel"], "Реализуемые программы")
        with self.assertRaisesRegex(ValueError, "absent"):
            batch.association("russia-341", meta, tree, "https://ystu.ru/guessed-path/")

    def test_frozen_baseline_rejects_already_populated_targets(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            batch.dump(work / "baseline.json", {
                "runtimeSnapshotSha256": "b" * 64,
                "universities": {slug: {"educationalListings": 1 if slug == "russia-83" else 0} for slug in batch.INDEXES},
            })
            with self.assertRaisesRegex(ValueError, "educational-listing gap"):
                batch.freeze_baseline(work)

    def test_frozen_baseline_replays_after_runtime_catalog_changes(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            expected = {
                "runtimeSnapshotSha256": "b" * 64,
                "universities": {slug: {"educationalListings": 0} for slug in batch.INDEXES},
            }
            batch.dump(work / "baseline.json", expected)
            self.assertEqual(batch.freeze_baseline(work, work / "nonexistent-new-runtime.json"), expected)

    def test_default_main_never_calls_network_fetch(self):
        with patch("sys.argv", ["collector"]), patch.object(batch, "freeze_baseline", return_value={}), patch.object(batch, "build") as build, patch.object(batch.guard, "fetch", side_effect=AssertionError("unexpected network")) as fetch:
            batch.main()
            fetch.assert_not_called()
            build.assert_called_once()

    def test_body_hash_tampering_is_rejected_before_source_parsing(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            body, metadata = batch.guard.source_paths(work, "russia-83", META["url"])
            body.parent.mkdir(parents=True)
            body.write_bytes(b"changed body")
            batch.dump(metadata, {**META, "universitySlug": "russia-83", "requestedUrl": META["url"], "httpStatus": "200", "exitCode": 0})
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                batch.evidence(work, "russia-83", META["url"])


if __name__ == "__main__":
    unittest.main()

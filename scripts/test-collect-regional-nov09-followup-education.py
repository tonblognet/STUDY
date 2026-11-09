"""Offline regressions for scoped KGTU and Baikal SU education rows."""

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("followup", Path(__file__).with_name("collect-regional-nov09-followup-education.py"))
batch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(batch)
META = {"url": "https://klgtu.ru/sveden/education/eduop", "sourceSha256": "a" * 64,
        "checkedAt": "2026-11-09T16:15:58Z"}


def tree(markup):
    return batch.education.shared.html.fromstring(markup)


def kgtu(code="09.03.01", level="Высшее образование — бакалавриат", forms="Очная<br>Заочная", heading="Программы бакалавриата", profile="Программирование"):
    return tree(f'<h2>{heading}</h2><table><tr itemprop="eduOp"><td itemprop="eduCode">{code}</td>'
                '<td itemprop="eduName">Информатика и вычислительная техника</td>'
                f'<td itemprop="eduLevel">{level}</td><td itemprop="eduProf">{profile}</td>'
                f'<td itemprop="eduForm">{forms}</td></tr></table>')


def segment(mode="Очная", term="4 года", condition=""):
    return f'<span itemprop="eduForm">{mode}</span><br>(<span itemprop="learningTerm">{term}</span>)' + condition


def bgu(forms=None, old=False, header="Форма обучения (Нормативный срок обучения)"):
    forms = segment() if forms is None else forms
    row = ('<tr itemprop="eduAccred"><td><span itemprop="eduCode">09.03.03</span>'
           '<span itemprop="eduName">Прикладная информатика</span><span itemprop="eduLevel">Высшее - Бакалавриат</span></td>'
           '<td><span itemprop="eduProf">Информационные системы</span></td>'
           f'<td>{forms}</td></tr>')
    old_pane = '<div id="course-2"><table>' + row + '</table></div>' if old else ''
    return tree('<div id="MainContent1"><h3>Бакалавриат</h3><a id="course-1-tab" href="#course-1">1 курс</a>'
                f'<div id="course-1"><table><tr><th>{header}</th></tr>{row}</table></div>{old_pane}</div>')


class FollowupEducationTests(unittest.TestCase):
    def test_kgtu_explicit_br_forms_remain_separate_and_duration_unknown(self):
        rows = batch.kgtu_rows(kgtu(), META, [], [])
        item, evidence = rows[0]
        self.assertEqual(item["forms"], "Очная, Заочная")
        self.assertIsNone(item["duration"])
        self.assertIsNone(item["sourceYear"])
        self.assertEqual(item["admissionsStatus"], "pending_review")
        self.assertEqual(evidence["publishedFormItems"], ["Очная", "Заочная"])
        self.assertEqual(evidence["literalCells"]["eduForm"], "Очная Заочная")

    def test_kgtu_does_not_guess_missing_form_separators(self):
        with self.assertRaisesRegex(ValueError, "inventory disappeared"):
            batch.kgtu_rows(kgtu(forms="ОчнаяЗаочная"), META, [], [])

    def test_kgtu_rejects_unreviewed_form_markup(self):
        with self.assertRaisesRegex(ValueError, "markup changed"):
            batch.kgtu_rows(kgtu(forms="<div>Очная</div><div>Заочная</div>"), META, [], [])

    def test_mixed_specialist_master_level_is_excluded_even_for_specialist_code(self):
        issues = []
        source = kgtu(code="10.05.03", level="Высшее образование — специалитет, магистратура", heading="Программы специалитета")
        with self.assertRaisesRegex(ValueError, "inventory disappeared"):
            batch.kgtu_rows(source, META, issues, [])
        self.assertEqual(issues[0]["kind"], "source_level_conflict")

    def test_kgtu_other_campus_row_is_excluded(self):
        exclusions = []
        with self.assertRaisesRegex(ValueError, "inventory disappeared"):
            batch.kgtu_rows(kgtu(profile="Программирование, филиал в г. Светлый"), META, [], exclusions)
        self.assertEqual(exclusions[0]["kind"], "other_or_unclear_campus")

    def test_bgu_links_each_mode_only_to_own_explicit_term(self):
        document = bgu(segment() + '<hr>' + segment("Заочная", "4 года 6 месяцев"))
        rows = batch.bgu_rows(document, META, [], [])
        self.assertEqual([(r["forms"], r["duration"]) for r, _ in rows], [("Очная", "4 года"), ("Заочная", "4 года 6 месяцев")])
        self.assertTrue(all(r["sourceYear"] is None for r, _ in rows))
        self.assertTrue(all("год приёма не установлен" in r["sourceSection"] for r, _ in rows))
        self.assertNotEqual(rows[0][1]["durationXPath"], rows[1][1]["durationXPath"])

    def test_bgu_condition_excludes_only_qualified_mode_without_losing_other_mode(self):
        qualified = segment("Очно-заочная", "4 года 6 месяцев", '<br><small>с применением дистанционных образовательных технологий</small>')
        excluded = []
        rows = batch.bgu_rows(bgu(segment() + '<hr>' + qualified), META, [], excluded)
        self.assertEqual([r["forms"] for r, _ in rows], ["Очная"])
        self.assertEqual(excluded[0]["kind"], "bgu_mode_condition_excluded")
        self.assertEqual(excluded[0]["publishedConditions"], ["с применением дистанционных образовательных технологий"])

    def test_bgu_does_not_pair_across_missing_hr_separator(self):
        with self.assertRaisesRegex(ValueError, "association is ambiguous"):
            batch.bgu_rows(bgu(segment() + segment("Заочная", "5 лет")), META, [], [])

    def test_bgu_unscoped_condition_text_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unscoped BGU condition"):
            batch.bgu_rows(bgu(segment() + 'только на платной основе'), META, [], [])

    def test_bgu_missing_duration_does_not_borrow_another_mode_term(self):
        with self.assertRaisesRegex(ValueError, "association is ambiguous"):
            batch.bgu_rows(bgu('<span itemprop="eduForm">Очная</span><hr>' + segment("Заочная", "5 лет")), META, [], [])

    def test_bgu_other_course_scope_is_excluded_without_inventing_its_admission_year(self):
        excluded = []
        rows = batch.bgu_rows(bgu(old=True), META, [], excluded)
        self.assertEqual(len(rows), 1)
        self.assertEqual(excluded[0]["kind"], "other_published_course")
        self.assertEqual(excluded[0]["rows"], 1)

    def test_bgu_statistics_panel_and_changed_normative_header_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "Statistics"):
            batch.bgu_rows(bgu(header="Численность обучающихся"), META, [], [])
        with self.assertRaisesRegex(ValueError, "column context"):
            batch.bgu_rows(bgu(header="Форма обучения"), META, [], [])

    def test_detail_source_must_be_linked_by_own_official_index(self):
        index = tree('<a href="eduop">Реализуемые программы</a>')
        meta = {"url": "https://klgtu.ru/sveden/education/"}
        found = batch.association("russia-1601", meta, index, META["url"])
        self.assertEqual(found["publishedLabel"], "Реализуемые программы")
        with self.assertRaisesRegex(ValueError, "not linked"):
            batch.association("russia-1601", meta, index, "https://klgtu.ru/guessed/")

    def test_frozen_baseline_rejects_non_gap_and_replays_without_runtime_reread(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            frozen = {"runtimeSnapshotSha256": "b" * 64, "universities": {s: {"educationalListings": 0} for s in batch.INDEXES}}
            batch.dump(work / "baseline.json", frozen)
            self.assertEqual(batch.freeze_baseline(work, work / "missing-runtime.json"), frozen)
            frozen["universities"]["russia-12"]["educationalListings"] = 1
            batch.dump(work / "baseline.json", frozen)
            with self.assertRaisesRegex(ValueError, "educational-listing gap"):
                batch.freeze_baseline(work)

    def test_default_replay_never_calls_network(self):
        with patch("sys.argv", ["collector"]), patch.object(batch, "freeze_baseline", return_value={}), patch.object(batch, "build") as build, patch.object(batch.guard, "fetch", side_effect=AssertionError("network")) as fetch:
            batch.main()
            fetch.assert_not_called()
            build.assert_called_once()


if __name__ == "__main__":
    unittest.main()

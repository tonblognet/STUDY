"""Regressions for reviewed Moscow table selection and safe cohort reduction."""
import hashlib
import json
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


COLLECTOR = runpy.run_path(str(Path(__file__).with_name("collect-moscow-targeted-enrichment.py")))
UNIVERSITY = {"slug": "sample"}
PROGRAM = """<td itemprop='eduCode'>09.03.01</td>
<td itemprop='eduName'>Информатика и вычислительная техника</td>
<td itemprop='eduProf'>Программная инженерия</td>
<td itemprop='eduLevel'>Высшее образование — бакалавриат</td>
<td itemprop='eduForm'>Очная форма обучения</td>
<td itemprop='learningTerm'>4 года</td>"""


def fixture(body):
    raw = ("<html><meta charset='utf-8'><body>" + body + "</body></html>").encode()
    meta = {"url": "https://sample.ru/sveden/education/", "requestedUrl": "https://sample.ru/sveden/education/",
            "checkedAt": "2026-10-09T21:12:54+00:00", "httpStatus": "200", "exitCode": 0,
            "sourceSha256": hashlib.sha256(raw).hexdigest()}
    return raw, COLLECTOR["LEGACY"]["read_tree"](raw), meta


def row(program=PROGRAM, kind="eduAccred"):
    return "<tr itemprop='" + kind + "'>" + program + "</tr>"


class MoscowTargetedSafetyTests(unittest.TestCase):
    def parsed(self, body, indexes=(0,), slug="sample"):
        _, tree, meta = fixture(body)
        with patch.dict(COLLECTOR["REVIEWED_EDUCATION_TABLES"], {slug: indexes}):
            return COLLECTOR["education_rows"](tree, meta, {"slug": slug})

    def test_only_explicitly_reviewed_table_is_used(self):
        body = "<table>" + row() + "</table><table>" + row(PROGRAM.replace("Программная инженерия", "Другой кампус")) + "</table>"
        selected = self.parsed(body)
        self.assertEqual([r["profile"] for r in selected], ["Программная инженерия"])
        self.assertEqual(self.parsed(body, (2,)), [])
        self.assertEqual(self.parsed(body, ()), [])

    def test_hse_requires_moscow_higher_education_and_excludes_other_campuses(self):
        body = "<h3>Москва</h3><h4>Высшее образование</h4><div><table>" + row() + "</table></div>"
        body += "<h3>Санкт-Петербург</h3><h4>Высшее образование</h4><div><table>" + row(PROGRAM.replace("Программная инженерия", "Петербургская программа")) + "</table></div>"
        self.assertEqual([r["profile"] for r in self.parsed(body, slug="hse")], ["Программная инженерия"])
        self.assertEqual(self.parsed(body.replace("Москва", "Пермь"), slug="hse"), [])

    def test_postgraduate_secondary_additional_and_statistics_do_not_become_listings(self):
        programs = [PROGRAM.replace("09.03.01", "09.02.01"),
                    PROGRAM.replace("09.03.01", "09.06.01"),
                    PROGRAM.replace("Высшее образование — бакалавриат", "Дополнительное профессиональное образование"),
                    PROGRAM.replace("Высшее образование — бакалавриат", "Высшее образование - ординатура"),
                    PROGRAM.replace("Программная инженерия", "Программа филиала в Туле")]
        body = "<table>" + "".join(row(p) for p in programs) + row(kind="eduPriem") + row(kind="eduChislen") + "</table>"
        self.assertEqual(self.parsed(body), [])

    def test_cohort_names_merge_without_choosing_conflicting_duration(self):
        one = PROGRAM.replace("Программная инженерия", "Программная инженерия (2020, 2021)")
        two = PROGRAM.replace("Программная инженерия", "программная инженерия (2022, 2023)").replace("4 года", "4 года 6 месяцев")
        parsed = self.parsed("<table>" + row(one) + row(two) + "</table>")
        collapsed, issues = COLLECTOR["collapse_rows"](parsed, "sample")
        self.assertEqual(len(collapsed), 1)
        self.assertIsNone(collapsed[0]["duration"])
        self.assertIsNone(collapsed[0]["sourceYear"])
        self.assertEqual(collapsed[0]["admissionsStatus"], "pending_review")
        self.assertEqual(issues[0]["publishedDurations"], ["4 года", "4 года 6 месяцев"])
        self.assertEqual(collapsed[0]["checkedAt"], "2026-10-09T21:12:54+00:00")

    def test_accelerated_weekend_and_distance_qualifiers_are_not_erased(self):
        forms = ["Очная форма обучения", "Очная форма обучения (ускоренное обучение на базе среднего профессионального образования)",
                 "Очная форма обучения (ускоренное обучение на базе высшего образования)",
                 "Очная форма обучения (группа выходного дня)", "Очная (с применением ЭО и ДОТ)"]
        body = "<table>" + "".join(row(PROGRAM.replace("Очная форма обучения", f).replace("4 года", "3 года" if i else "4 года")) for i, f in enumerate(forms)) + "</table>"
        collapsed, issues = COLLECTOR["collapse_rows"](self.parsed(body), "sample")
        self.assertEqual([r["forms"] for r in collapsed], forms)
        self.assertEqual(len({r["id"] for r in collapsed}), 5)
        self.assertEqual(issues, [])

    def test_missing_cohort_duration_stays_unknown_regardless_of_row_order(self):
        missing = PROGRAM.replace("<td itemprop='learningTerm'>4 года</td>", "")
        for programs in [(PROGRAM, missing), (missing, PROGRAM)]:
            with self.subTest(programs=programs):
                parsed = self.parsed("<table>" + "".join(row(p) for p in programs) + "</table>")
                collapsed, issues = COLLECTOR["collapse_rows"](parsed, "sample")
                self.assertEqual(len(collapsed), 1)
                self.assertIsNone(collapsed[0]["duration"])
                self.assertEqual(issues, [])

    def test_basic_and_specialized_higher_levels_remain_separate(self):
        programs = [PROGRAM, PROGRAM.replace("Высшее образование — бакалавриат", "Базовое высшее образование"),
                    PROGRAM.replace("Высшее образование — бакалавриат", "Специализированное высшее образование")]
        collapsed, _ = COLLECTOR["collapse_rows"](self.parsed("<table>" + "".join(row(p) for p in programs) + "</table>"), "sample")
        self.assertEqual(len(collapsed), 3)

    def test_aggregate_forms_drop_only_when_same_qualifiers_are_covered(self):
        forms = ["Очная; Заочная", "Очная", "Заочная", "Очная; Заочная (ускоренное обучение)"]
        rows = self.parsed("<table>" + "".join(row(PROGRAM.replace("Очная форма обучения", f)) for f in forms) + "</table>")
        collapsed, _ = COLLECTOR["collapse_rows"](rows, "sample")
        self.assertEqual([r["forms"] for r in collapsed], forms[1:])

    def test_msal_split_overview_keeps_education_name_and_duration(self):
        body = "<table><tr><td>Код</td><td>Уровень образования</td><td>Форма обучения</td><td>Срок обучения</td></tr>"
        body += "<tr><td itemprop='eduCode'>40.03.01</td><td itemprop='eduLevel'>Высшее образование - бакалавриат</td>"
        body += "<td itemprop='eduForm'>Очная</td><td itemprop='learningTerm'>4 года</td></tr><tr><td itemprop='eduName'>Юриспруденция</td></tr></table>"
        parsed = self.parsed(body, slug="msal")
        self.assertEqual([(r["title"], r["duration"]) for r in parsed], [("Юриспруденция", "4 года")])

    def test_offline_read_keeps_fetch_date_and_checks_original_bytes_without_network(self):
        raw, _, meta = fixture("<table>" + row() + "</table>")
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            digest = hashlib.sha256(meta["url"].encode()).hexdigest()[:14]
            raw_path = folder / (digest + ".html")
            raw_path.write_bytes(raw)
            (folder / (digest + ".meta.json")).write_text(json.dumps(meta), encoding="utf-8")
            fetch = Mock(side_effect=AssertionError("offline reads must not fetch"))
            with patch.dict(COLLECTOR["LEGACY"], {"fetch": fetch}):
                tree, actual = COLLECTOR["load_page"](meta["url"], folder, True)
                self.assertIsNotNone(tree)
                self.assertEqual(actual["checkedAt"], meta["checkedAt"])
                raw_path.write_bytes(raw + b"tampered")
                tree, actual = COLLECTOR["load_page"](meta["url"], folder, True)
                self.assertIsNone(tree)
                self.assertEqual(actual["rejected"], "cached_snapshot_sha256_mismatch")
                self.assertEqual(actual["checkedAt"], meta["checkedAt"])
                fetch.assert_not_called()


if __name__ == "__main__":
    unittest.main()

"""Safety regressions for official-directory collection (no network requests)."""
import hashlib
import runpy
import unittest
from pathlib import Path


COLLECTOR = runpy.run_path(str(Path(__file__).with_name("collect-moscow-enrichment.py")))
UNIVERSITY = {"slug": "sample", "name": "Университет Пример", "shortName": "Пример",
              "directory": {"legalName": "ФГБОУ ВО Университет Пример"}}


def fixture(body):
    raw = ("<html><meta charset='utf-8'><body>" + body + "</body></html>").encode()
    meta = {"url": "https://sample.ru/sveden/education/", "checkedAt": "2026-10-09T20:00:00+00:00",
            "sourceSha256": hashlib.sha256(raw).hexdigest()}
    return COLLECTOR["read_tree"](raw), meta


PROGRAM = """<td itemprop='eduCode'>09.03.01</td><td itemprop='eduName'>Информатика и вычислительная техника</td>
<td itemprop='eduProf'>Программная инженерия</td><td itemprop='eduLevel'>Высшее образование - бакалавриат</td>
<td itemprop='eduForm'>Очная</td><td itemprop='learningTerm'>4 года</td>"""


class CollectorSafetyTests(unittest.TestCase):
    def test_implemented_program_retains_exact_fields_and_unconfirmed_intake(self):
        tree, meta = fixture("<table><tr itemprop='eduAccred'>" + PROGRAM + "</tr></table>")
        rows = COLLECTOR["offerings"](tree, meta, UNIVERSITY)
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["duration"], "4 года")
        self.assertEqual(row["profile"], "Программная инженерия")
        self.assertEqual(row["forms"], "Очная")
        self.assertEqual(row["admissionsStatus"], "pending_review")
        self.assertIsNone(row["sourceYear"])
        self.assertEqual(row["checkedAt"], meta["checkedAt"])
        self.assertEqual(row["sourceSha256"], meta["sourceSha256"])

    def test_statistical_rows_do_not_become_programs(self):
        for category in ["eduPriem", "eduPerevod", "eduChislen", "eduStud", "eduTrud", "eduVypusk", "graduate", "employment"]:
            with self.subTest(category=category):
                tree, meta = fixture("<table itemprop='" + category + "'><tr>" + PROGRAM + "</tr></table>")
                self.assertEqual(COLLECTOR["offerings"](tree, meta, UNIVERSITY), [])

    def test_ambiguous_table_and_number_columns_need_review(self):
        for extra in ["", "<td itemprop='numberAll'>120</td>"]:
            with self.subTest(extra=extra):
                tree, meta = fixture("<table><tr>" + PROGRAM + extra + "</tr></table>")
                self.assertEqual(COLLECTOR["offerings"](tree, meta, UNIVERSITY), [])
        tree, meta = fixture("<table><tr itemprop='eduAccred'>" + PROGRAM + "<td itemprop='numberAll'>120</td></tr></table>")
        self.assertEqual(COLLECTOR["offerings"](tree, meta, UNIVERSITY), [])

    def test_units_exclude_administration_labs_secondary_schools_and_branches(self):
        names = ["Факультет права", "Институт цифровых технологий", "Лаборатория (факультет права)",
                 "Средняя общеобразовательная школа", "Институт (филиал) в Туле", "Научная школа имени И.И. Иванова",
                 'Ректор Национального исследовательского университета "Высшая школа экономики"']
        body = "<table>" + "".join("<tr><td itemprop='name'>" + name + "</td><td itemprop='site'><a href='https://sample.ru/'>Сайт</a></td></tr>" for name in names) + "</table>"
        tree, meta = fixture(body)
        rows = COLLECTOR["faculties"](tree, meta, UNIVERSITY)
        self.assertEqual([row["name"] for row in rows], names[:2])
        self.assertTrue(all(row["url"] is None for row in rows))

    def test_real_faculty_with_research_in_name_is_preserved(self):
        self.assertTrue(COLLECTOR["is_academic"]("Факультет космических исследований", UNIVERSITY))

    def test_absent_values_are_not_filled_and_existing_values_are_preserved(self):
        tree, meta = fixture("<span itemprop='shortName'>Отсутствует</span><span itemprop='email'>нет</span><span itemprop='telephone'>+7 (495) 111-11-11</span>")
        self.assertEqual(COLLECTOR["common_fields"](tree, meta, {"telephone": {"value": "old"}}), {})

    def test_overview_wins_over_repeated_curriculum_and_foreign_campus(self):
        body = "<table><tr itemprop='eduAccred'>" + PROGRAM + "</tr>"
        body += "<tr itemprop='eduOp'>" + PROGRAM.replace("Программная инженерия", "Программная инженерия (набор 2022 года)") + "</tr>"
        body += "<tr itemprop='eduAccred'>" + PROGRAM.replace("Программная инженерия", "Программная инженерия (реализуется в филиале в Таразе)") + "</tr></table>"
        tree, meta = fixture(body)
        rows = COLLECTOR["offerings"](tree, meta, UNIVERSITY)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["profile"], "Программная инженерия")

    def test_nested_hidden_form_does_not_contaminate_duration(self):
        nested = PROGRAM.replace("4 года</td>", "4 года<div itemprop='eduForm' style='display:none'>Очная</div></td>")
        tree, meta = fixture("<table><tr itemprop='eduAccred'>" + nested + "</tr></table>")
        self.assertEqual(COLLECTOR["offerings"](tree, meta, UNIVERSITY)[0]["duration"], "4 года")

    def test_reg_date_requires_published_date_rather_than_explanatory_note(self):
        tree, meta = fixture("<span itemprop='regDate'>Дата начала работы института.</span>")
        self.assertEqual(COLLECTOR["common_fields"](tree, meta, {}), {})

    def test_aggregate_forms_do_not_duplicate_complete_individual_rows(self):
        body = "<table>"
        for form, duration in [("Очная Заочная", "4 года"), ("Очная", "4 года"), ("Заочная", "5 лет")]:
            body += "<tr itemprop='eduAccred'>" + PROGRAM.replace("Очная</td>", form + "</td>").replace("4 года</td>", duration + "</td>") + "</tr>"
        tree, meta = fixture(body + "</table>")
        rows = COLLECTOR["offerings"](tree, meta, UNIVERSITY)
        self.assertEqual([(r["forms"], r["duration"]) for r in rows], [("Очная", "4 года"), ("Заочная", "5 лет")])


if __name__ == "__main__":
    unittest.main()

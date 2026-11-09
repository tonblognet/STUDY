"""Regressions for reviewed div layouts and teaching-unit scope."""
import hashlib
import runpy
import unittest
from pathlib import Path


COLLECTOR = runpy.run_path(str(Path(__file__).with_name("collect-moscow-priority-enrichment.py")))
PROGRAM = """<div itemprop='eduCode'>53.03.01</div>
<div itemprop='eduName'>Музыкальное искусство эстрады</div>
<div itemprop='eduProf'>Эстрадно-джазовое пение</div>
<div itemprop='eduLevel'>Уровень образования: Бакалавриат</div>"""


def fixture(body):
    raw = ("<html><meta charset='utf-8'><body>" + body + "</body></html>").encode()
    meta = {"url": "https://gnesin-academy.ru/sveden/education/eduaccred/",
            "checkedAt": "2026-10-11T08:02:29.118823+00:00",
            "sourceSha256": hashlib.sha256(raw).hexdigest()}
    return COLLECTOR["LEGACY"]["read_tree"](raw), meta


def gnesin_row(program=PROGRAM, forms=None):
    forms = forms or [("очной формы", "4 года"), ("очно-заочной формы", "–"), ("заочной формы", "-")]
    parts = "".join("<div class='sveden-accreed-lang-item-part-inner'><span itemprop='eduForm'>" + form
                    + "</span><span itemprop='learningTerm'>" + term + "</span></div>" for form, term in forms)
    return "<div itemprop='eduAccred' class='sveden-accreed-lang-item'>" + program + parts + "</div>"


class MoscowPrioritySafetyTests(unittest.TestCase):
    def test_gnesin_terms_remain_paired_to_their_own_form(self):
        tree, meta = fixture(gnesin_row(forms=[("очной формы", "4 года"), ("очно-заочной формы", "–"), ("заочной формы", "4 года 6 месяцев")]))
        rows, issues = COLLECTOR["div_education"](tree, meta, "gnesin")
        self.assertEqual([(r["forms"], r["duration"]) for r in rows], [("очной формы", "4 года"), ("заочной формы", "4 года 6 месяцев")])
        self.assertEqual(issues, [])
        self.assertEqual({r["checkedAt"] for r in rows}, {meta["checkedAt"]})
        self.assertEqual({r["sourceSha256"] for r in rows}, {meta["sourceSha256"]})
        self.assertTrue(all(r["sourceYear"] is None and r["admissionsStatus"] == "pending_review" for r in rows))

    def test_gnesin_dashes_and_postgraduate_secondary_additional_are_not_listings(self):
        programs = [PROGRAM.replace("53.03.01", "53.02.02"), PROGRAM.replace("53.03.01", "53.09.01"),
                    PROGRAM.replace("Бакалавриат", "Ассистентура-стажировка"),
                    PROGRAM.replace("Бакалавриат", "Дополнительное профессиональное образование")]
        tree, meta = fixture("".join(gnesin_row(p) for p in programs) + gnesin_row(forms=[("очной формы", "—")]))
        self.assertEqual(COLLECTOR["div_education"](tree, meta, "gnesin")[0], [])

    def test_gaugn_statistics_and_unreviewed_layouts_are_not_listings(self):
        one = "<div itemprop='eduAccred' style='display:table-row'>" + PROGRAM + "<span itemprop='eduForm'>Очная</span><span itemprop='learningTerm'>4 года</span></div>"
        statistics = one.replace("eduAccred", "eduChislen")
        unreviewed = one.replace("display:table-row", "display:block")
        tree, meta = fixture(one + statistics + unreviewed)
        rows, issues = COLLECTOR["div_education"](tree, meta, "gaugn")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["duration"], "4 года")
        self.assertEqual(issues, [])

    def test_gaugn_literal_code_title_conflict_is_queued_not_corrected(self):
        program = PROGRAM.replace("53.03.01", "46.03.01").replace("Музыкальное искусство эстрады", "Культурология")
        tree, meta = fixture("<div itemprop='eduAccred' style='display:table-row'>" + program + "<span itemprop='eduForm'>Очная</span></div>")
        rows, issues = COLLECTOR["div_education"](tree, meta, "gaugn")
        self.assertEqual(rows, [])
        self.assertEqual(issues[0]["kind"], "source_code_title_conflict")
        self.assertEqual(issues[0]["code"], "46.03.01")

    def test_div_cohorts_keep_unknown_duration_when_sources_conflict(self):
        tree, meta = fixture(gnesin_row() + gnesin_row(forms=[("очной формы", "5 лет")]))
        rows, _ = COLLECTOR["div_education"](tree, meta, "gnesin")
        collapsed, issues = COLLECTOR["PREVIOUS"]["collapse_rows"](rows, "gnesin")
        self.assertEqual(len(collapsed), 1)
        self.assertIsNone(collapsed[0]["duration"])
        self.assertEqual(issues[0]["publishedDurations"], ["4 года", "5 лет"])

    def test_gnesin_faculties_require_reviewed_path_and_faculty_label(self):
        body = "<a href='/sveden/struct/faculties/piano/'>Фортепианный факультет</a>"
        body += "<a href='/news/'>Новости факультетов</a><a href='/sveden/struct/faculties/office/'>Управление</a>"
        tree, meta = fixture(body)
        units = COLLECTOR["structural_units"](tree, meta, "gnesin")
        self.assertEqual([u["name"] for u in units], ["Фортепианный факультет"])

    def test_guu_excludes_administration_additional_school_and_departments(self):
        names = ["Департамент кадров", "Высшая школа бизнеса и технологий ГУУ", "Кафедра «Управления бизнес-системами»",
                 "Кафедра управления развитием бизнеса (Базовая кафедра Общероссийской общественной организации «Деловая Россия»)",
                 "Институт дополнительного образования", "Институт маркетинга", "Кафедра рекламы и связей с общественностью"]
        body = "<table><tr><td>Институт другого блока</td></tr></table><table>"
        body += "".join("<tr><td>" + name + "</td><td><a href='/regulations.pdf'>Положение</a></td></tr>" for name in names) + "</table>"
        tree, meta = fixture(body)
        units = COLLECTOR["structural_units"](tree, meta, "guu")
        self.assertEqual([u["name"] for u in units], ["Институт маркетинга", "Кафедра рекламы и связей с общественностью"])
        self.assertTrue(all(u["url"] is None for u in units))

    def test_offline_report_date_uses_actual_snapshot_time_instead_of_now(self):
        latest = "2026-10-11T08:03:39.978377+00:00"
        self.assertEqual(COLLECTOR["snapshot_checked_at"]([{"checkedAt": "2026-10-11T08:02:29.118823+00:00"}, {"checkedAt": latest}, {}]), latest)
        self.assertIsNone(COLLECTOR["snapshot_checked_at"]([]))


if __name__ == "__main__":
    unittest.main()

"""Safety regressions for the reviewed October 20 vertical and structural data."""
import hashlib
import runpy
import unittest
from pathlib import Path


C = runpy.run_path(str(Path(__file__).with_name("collect-moscow-gap-enrichment.py")))


def fixture(body, url="https://guu.ru/sveden/education/"):
    raw = ("<html><meta charset='utf-8'><body>" + body + "</body></html>").encode()
    return C["LEGACY"]["read_tree"](raw), {"url": url, "checkedAt": "2026-10-20T10:07:00+00:00", "sourceSha256": hashlib.sha256(raw).hexdigest()}


def block(code="38.04.02", title="Менеджмент", profile="Управление производством", level="Магистратура", forms="Заочная", duration="2 года 5 месяцев", heading=None):
    heading = code + " " + profile if heading is None else heading
    pairs = [("Направление", title), ("Код направления", code), ("Уровень образования", level), ("Форма обучения", forms), ("Нормативный срок обучения", duration)]
    return "<div class='toggle-wrap'><div class='toggle'><h4>" + heading + "</h4></div><ul><li><table>" + "".join("<tr><td>" + k + "</td><td>" + v + "</td></tr>" for k, v in pairs) + "</table></li></ul></div>"


class MoscowGapSafetyTests(unittest.TestCase):
    def test_guu_forms_and_terms_stay_in_their_own_vertical_block(self):
        tree, meta = fixture(block() + block(forms="Очная", duration="2 года", profile="Маркетинг"))
        rows, evidence, issues = C["guu_rows"](tree, meta)
        self.assertEqual([(r["profile"], r["forms"], r["duration"]) for r in rows], [("Управление производством", "Заочная", "2 года 5 месяцев"), ("Маркетинг", "Очная", "2 года")])
        self.assertEqual([e["tableIndex"] for e in evidence], [0, 1])
        self.assertEqual(issues, [])
        self.assertTrue(all(r["sourceYear"] is None and r["admissionsStatus"] == "pending_review" for r in rows))
        self.assertEqual({r["sourceSha256"] for r in rows}, {meta["sourceSha256"]})

    def test_guu_two_codes_are_not_guessed_into_two_programs(self):
        tree, meta = fixture(block(code="27.04.05 09.04.03"))
        rows, evidence, issues = C["guu_rows"](tree, meta)
        self.assertEqual(rows, [])
        self.assertEqual(evidence, [])
        self.assertEqual(issues[0]["publishedCode"], "27.04.05 09.04.03")

    def test_guu_statistics_and_postgraduate_tables_are_excluded(self):
        tree, meta = fixture("<table><tr><th>Код направления</th><th>Численность</th><th>Балл</th></tr><tr><td>38.04.02</td><td>25</td><td>70</td></tr></table>" + block(level="Аспирантура"))
        self.assertEqual(C["guu_rows"](tree, meta)[0], [])

    def test_guu_mismatched_or_missing_heading_does_not_borrow_a_profile(self):
        tree, meta = fixture(block(heading="38.04.01 Финансы") + block(heading=""))
        rows, _, issues = C["guu_rows"](tree, meta)
        self.assertEqual(rows, [])
        self.assertEqual(len(issues), 2)

    def test_guu_multiple_forms_cannot_receive_one_inferred_term(self):
        tree, meta = fixture(block(forms="Очная, заочная"))
        rows, _, issues = C["guu_rows"](tree, meta)
        self.assertEqual(rows[0]["forms"], "Очная, заочная")
        self.assertIsNone(rows[0]["duration"])
        self.assertEqual(issues[0]["kind"], "unpaired_multiple_forms")

    def test_mfua_uses_department_table_without_colleges_or_dpo(self):
        tree, meta = fixture("<table/><table/><table><tr><td>1</td><td>Колледж ИТ</td></tr><tr><td>2</td><td>Институт дополнительного образования</td></tr></table><table><tr><td>1</td><td>Кафедра Дизайна</td></tr><tr><td>2</td><td>Бухгалтерия</td></tr></table>")
        units = C["units"](tree, meta, "mfua")
        self.assertEqual([r["name"] for r in units], ["Кафедра Дизайна"])
        self.assertIsNone(units[0]["url"])

    def test_pushkin_preparatory_faculty_and_its_departments_are_excluded(self):
        names = ["Управление образовательной деятельности", "Филологический факультет", "Кафедра иностранных языков", "Факультет русского языка и литературы", "Подготовительный факультет", "Кафедра русского языка как иностранного"]
        tree, meta = fixture("<table/><table>" + "".join("<tr><td itemprop='name'>" + name + "</td></tr>" for name in names) + "</table>")
        self.assertEqual([r["name"] for r in C["units"](tree, meta, "pushkin")], names[1:4])

    def test_pushkin_short_course_department_keeps_uncertain_he_scope_out_of_units(self):
        names = ["Филологический факультет", C["PUSHKIN_UNCONFIRMED_HE_UNIT"], "Кафедра русского языка как иностранного", "Кафедра интенсивного обучения другим языкам"]
        tree, meta = fixture("<table/><table>" + "".join("<tr><td itemprop='name'>" + name + "</td></tr>" for name in names) + "</table>", "https://www.pushkin.institute/sveden/struct/")
        issues = []
        self.assertEqual([r["name"] for r in C["units"](tree, meta, "pushkin", issues)], [names[0], names[2], names[3]])
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["kind"], "academic_unit_scope_unresolved")
        self.assertEqual(issues[0]["name"], names[1])
        self.assertEqual(issues[0]["sourceUrl"], meta["url"])
        self.assertEqual(issues[0]["sourceSha256"], meta["sourceSha256"])
        self.assertEqual(issues[0]["checkedAt"], meta["checkedAt"])

    def test_admissions_email_must_be_literal_and_preserves_prior(self):
        url = "https://www.pushkin.institute/abitur/"
        tree, meta = fixture("Приёмная комиссия abiturient@pushkin.institute Минобрнауки priem@minobrnauki.gov.ru", url)
        fields = C["reviewed_fields"](tree, meta, "pushkin", {})
        self.assertEqual(fields["admissionsEmail"]["value"], "abiturient@pushkin.institute")
        self.assertEqual(C["reviewed_fields"](tree, meta, "pushkin", {"admissionsEmail": {"value": "old@example.invalid"}}), {})
        tree, meta = fixture("Минобрнауки priem@minobrnauki.gov.ru", url)
        self.assertEqual(C["reviewed_fields"](tree, meta, "pushkin", {}), {})

    def test_mfua_phone_requires_commission_row_and_email_is_not_promoted(self):
        phone = "+7 (499) 979-00-99, (495) 221-10-01"
        tree, meta = fixture("<table><tr><td>Приемная комиссия</td><td>" + phone + "</td><td>belenko.t@masi.ru</td></tr></table>", "https://www.mfua.ru/sveden/struct/")
        fields = C["reviewed_fields"](tree, meta, "mfua", {})
        self.assertEqual(set(fields), {"admissionsPhone"})
        self.assertEqual(fields["admissionsPhone"]["value"], phone)

    def test_hostel_field_describes_rooms_without_guessing_availability(self):
        tree, meta = fixture(C["HOSTEL_TEXT"], "https://www.pushkin.institute/institut/dormitory/")
        fields = C["reviewed_fields"](tree, meta, "pushkin", {})
        self.assertEqual(set(fields), {"hostelInfo"})
        self.assertEqual(fields["hostelInfo"]["value"], C["HOSTEL_TEXT"])


if __name__ == "__main__":
    unittest.main()

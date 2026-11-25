"""Offline regressions for the bulk /sveden/ reader (no network).

Run: python -X utf8 scripts/test_sveden_extract.py
"""

import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from lxml import html as lxml_html


spec = importlib.util.spec_from_file_location("sveden_extract", Path(__file__).with_name("sveden_extract.py"))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)

SLUG = "sample"
SITE = "https://www.sample-univ.ru"
CHECKED_AT = "2026-11-20T09:00:00Z"
FILLER = "<p>" + "Сведения об образовательной организации размещены в соответствии с требованиями. " * 4 + "</p>"
UNIVERSITY = {
    "slug": SLUG, "name": "Примерный государственный университет", "shortName": "ПГУ",
    "website": "http://www.sample-univ.ru", "directory": {"legalName": "Примерный государственный университет"},
}

COMMON = f"""<!doctype html><html><head><meta charset="utf-8"><title>Основные сведения</title></head><body>
<h1>Основные сведения</h1>{FILLER}<table>
<tr itemprop="fullName"><td>Полное наименование</td><td>Федеральное государственное бюджетное образовательное учреждение высшего образования «Примерный государственный университет»</td></tr>
<tr><td>Сокращённое</td><td itemprop="shortName">ПГУ</td></tr>
<tr itemprop="regDate"><td>Дата создания</td><td>01.09.1930</td></tr>
<tr><td>Адрес</td><td itemprop="address">123456, г. Примерск, ул. Ленина,<br>д. 1</td></tr>
<tr><td>Телефон</td><td itemprop="telephone"><a href="tel:+79991234567">+7 (999) 123-45-67</a>, +7 (999) 765-43-21</td></tr>
<tr><td>Почта</td><td itemprop="email">rector@sample-univ.ru, office@sample-univ.ru</td></tr>
</table><p>Дата последнего обновления сведений: 14.10.2025</p></body></html>"""

STRUCT = f"""<html><head><meta http-equiv="Content-Type" content="text/html; charset=windows-1251"></head><body>
<h1>Структура и органы управления образовательной организацией</h1>{FILLER}<table>
<tr itemprop="structOrgUprav"><td itemprop="name">Институт права</td><td itemprop="site"><a href="https://law.sample-univ.ru/">сайт</a></td></tr>
<tr itemprop="structOrgUprav"><td itemprop="name">Отдел кадров</td><td></td></tr>
<tr itemprop="structOrgUprav"><td itemprop="name">Кафедра истории государства</td><td></td></tr>
<tr itemprop="structOrgUprav"><td itemprop="name">Факультет экономики</td><td itemprop="site"><a href="https://evil.example.com/">сайт</a></td></tr>
<tr itemprop="structOrgUprav"><td itemprop="name">Филиал университета в г. Другой</td><td></td></tr>
</table><p>Страница обновлена: 11 ноября 2026</p></body></html>"""

EDUCATION = f"""<html><head><meta charset="utf-8"></head><body><h1>Образование</h1>{FILLER}
<p><a href="/sveden/education/eduop/">Информация о реализуемых образовательных программах</a></p>
<p><a href="/sveden/education/plans.pdf">Учебные планы</a></p>
<h2>Численность обучающихся</h2>
<table><tr><th>Код</th><th>Численность обучающихся</th></tr>
<tr itemprop="eduChislen"><td itemprop="eduCode">40.03.01</td><td itemprop="eduName">Юриспруденция</td><td itemprop="eduLevel">бакалавриат</td><td itemprop="numberAll">500</td></tr>
</table></body></html>"""

EDUOP = f"""<html><head><meta charset="utf-8"></head><body><h1>Реализуемые образовательные программы</h1>{FILLER}
<h2>Основные профессиональные образовательные программы</h2>
<table><tr><th>Код</th><th>Наименование</th><th>Уровень</th><th>Профиль</th><th>Форма</th><th>Срок</th></tr>
<tr itemprop="eduOp"><td itemprop="eduCode" rowspan="2">40.03.01</td><td itemprop="eduName" rowspan="2">Юриспруденция</td><td itemprop="eduLevel" rowspan="2">высшее образование — бакалавриат</td><td itemprop="eduProf">Гражданское право</td><td itemprop="eduForm">очная</td><td itemprop="learningTerm">4 года</td></tr>
<tr itemprop="eduOp"><td itemprop="eduProf">Уголовное право</td><td itemprop="eduForm">заочная</td><td itemprop="learningTerm">4 года 6 месяцев</td></tr>
<tr itemprop="eduOp"><td itemprop="eduCode">40.04.01</td><td itemprop="eduName">Юриспруденция</td><td itemprop="eduLevel">высшее образование — магистратура</td><td itemprop="eduProf">-</td><td itemprop="eduForm">очная</td><td itemprop="learningTerm">2 года</td></tr>
<tr itemprop="eduOp"><td itemprop="eduCode">5.1.1</td><td itemprop="eduName">Теоретико-исторические правовые науки</td><td itemprop="eduLevel">аспирантура</td><td itemprop="eduProf"></td><td itemprop="eduForm">очная</td><td itemprop="learningTerm">3</td></tr>
<tr itemprop="eduOp"><td itemprop="eduCode">38.03.01</td><td itemprop="eduName">Экономика</td><td itemprop="eduLevel">высшее образование — магистратура</td><td itemprop="eduProf">Финансы</td><td itemprop="eduForm">очная</td><td itemprop="learningTerm">4 года</td></tr>
<tr itemprop="eduOp"><td itemprop="eduCode">38.05.01</td><td itemprop="eduName">Экономическая безопасность</td><td itemprop="eduLevel">бакалавриат, магистратура</td><td itemprop="eduProf">Безопасность</td><td itemprop="eduForm">очная</td><td itemprop="learningTerm">5 лет</td></tr>
<tr itemprop="eduOp"><td itemprop="eduCode">21.05.04</td><td itemprop="eduName">Горное дело</td><td itemprop="eduLevel">Высшее образование — специалитет, магистратура</td><td itemprop="eduProf">Подземная разработка</td><td itemprop="eduForm">очная</td><td itemprop="learningTerm">5,5 лет</td></tr>
</table></body></html>"""

NON_DELIVERY_ROW = """<tr itemprop="eduOp"><td itemprop="eduCode">40.03.01</td><td itemprop="eduName">Юриспруденция</td><td itemprop="eduLevel">высшее образование — бакалавриат</td><td itemprop="eduProf">Гражданское право</td><td itemprop="eduForm">Не реализуется</td></tr>"""
EDUOP_WITH_NON_DELIVERY = EDUOP.replace("</table>", NON_DELIVERY_ROW + "</table>", 1)

OBJECTS = f"""<html><head><meta charset="utf-8"></head><body><h1>Материально-техническое обеспечение</h1>{FILLER}
<table><tr itemprop="hostelInfo"><td>Общежития</td><td itemprop="hostelNum">3</td><td itemprop="hostelLs">1200</td></tr></table></body></html>"""

HOME = f"""<html><head><meta charset="utf-8"></head><body>{FILLER}<a href="https://abitur.sample-univ.ru/">Абитуриенту</a>
<a href="https://sample-univ.example.org/">Партнёры</a></body></html>"""

ADMISSIONS = f"""<html><head><meta charset="utf-8"></head><body><h1>Приёмная комиссия</h1>{FILLER}<p>Страница опубликована: 2026-02-01</p></body></html>"""

PAGES = {
    SITE + "/sveden/common/": (COMMON, "utf-8"),
    SITE + "/sveden/struct/": (STRUCT, "cp1251"),
    SITE + "/sveden/education/": (EDUCATION, "utf-8"),
    SITE + "/sveden/education/eduop/": (EDUOP, "utf-8"),
    SITE + "/sveden/objects/": (OBJECTS, "utf-8"),
    SITE + "/": (HOME, "utf-8"),
    "https://abitur.sample-univ.ru/": (ADMISSIONS, "utf-8"),
}


def seed_cache(cache, pages=PAGES):
    fetcher = reader.Fetcher(cache, offline=True)
    for url, (text, encoding) in pages.items():
        body, meta, _ = fetcher.paths(SLUG, url)
        body.parent.mkdir(parents=True, exist_ok=True)
        raw = text.encode(encoding)
        body.write_bytes(raw)
        meta.write_text(json.dumps({
            "requestedUrl": url, "url": url, "httpStatus": "200", "checkedAt": CHECKED_AT,
            "contentType": "text/html", "encoding": reader.detect_encoding(raw, "text/html"),
            "bodyPath": body.name, "sourceSha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
        }, ensure_ascii=False), encoding="utf-8")
    return fetcher


class SvedenReaderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = Path(self.tmp.name)
        self.fetcher = seed_cache(self.cache)
        self.report = reader.run_one(SLUG, {SLUG: UNIVERSITY}, self.fetcher, max_pages=10)
        path = self.cache / SLUG / "review.json"
        self.review = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

    def tearDown(self):
        self.tmp.cleanup()

    def test_review_is_accepted_by_the_importer(self):
        self.assertEqual(self.report["status"], "ok", self.report)
        profile, sources = reader.IMPORTER.build_profile(SLUG, self.review, self.cache / SLUG)
        self.assertEqual(self.review["officialHosts"], ["sample-univ.ru"])
        self.assertTrue(all(s["sourceSha256Basis"] == "response-bytes" for s in sources))
        raw = (self.cache / SLUG / self.review["sources"][0]["bodyPath"]).read_bytes()
        self.assertEqual(sources[0]["sourceSha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(profile["fields"]["regDate"]["sourceYear"], 2025)
        self.assertEqual(profile["fields"]["admissionsUrl"]["sourceYear"], 2026)
        self.assertTrue(all(row["sourceYear"] == 2026 for row in profile["faculties"]))
        self.assertTrue(all(row["sourceYear"] is None and row["admissionsStatus"] == "pending_review" for row in profile["offerings"]))

    def test_common_fields_are_literal_value_cells(self):
        fields = {key: row["value"] for key, row in self.review["profile"]["fields"].items()}
        self.assertTrue(fields["fullName"].startswith("Федеральное государственное"))
        self.assertNotIn("Полное наименование", fields["fullName"])
        self.assertEqual(fields["regDate"], "01.09.1930")
        self.assertEqual(fields["address"], "123456, г. Примерск, ул. Ленина, д. 1")
        self.assertEqual(fields["telephone"], "+7 (999) 123-45-67")
        self.assertEqual(fields["email"], "rector@sample-univ.ru")
        self.assertEqual(fields["admissionsUrl"], "https://abitur.sample-univ.ru/")

    def test_only_teaching_units_with_official_links(self):
        units = {row["name"]: row["url"] for row in self.review["profile"]["faculties"]}
        self.assertEqual(units, {"Институт права": "https://law.sample-univ.ru/", "Факультет экономики": None})

    def test_all_levels_kept_and_unclear_rows_excluded(self):
        rows = {(row["code"], row["profile"]): row for row in self.review["profile"]["offerings"]}
        self.assertEqual(set(rows), {
            ("40.03.01", "Гражданское право"), ("40.03.01", "Уголовное право"),
            ("40.04.01", None), ("5.1.1", None), ("21.05.04", "Подземная разработка"),
        })
        spanned = rows[("40.03.01", "Уголовное право")]
        self.assertEqual((spanned["level"], spanned["forms"], spanned["duration"]), ("высшее образование — бакалавриат", "заочная", "4 года 6 месяцев"))
        self.assertIsNone(rows[("5.1.1", None)]["duration"], "a number without units is not a duration")
        # The catalog file gets editor notes plus one counted summary...
        kinds = [issue["kind"] for issue in self.review["issues"]]
        self.assertEqual(sorted(kinds), ["automatic_exclusions", "field_additional_values", "hostel_microdata"])
        counts = next(issue["counts"] for issue in self.review["issues"] if issue["kind"] == "automatic_exclusions")
        self.assertEqual(counts["offering_code_level_conflict_excluded"], 1)
        self.assertEqual(counts["offering_ambiguous_level_excluded"], 1)
        self.assertEqual(counts["statistics_table_skipped"], 1)
        # ...while every excluded row keeps its locator in the local report.
        report = json.loads((self.cache / SLUG / "extract-report.json").read_text(encoding="utf-8"))
        conflict = next(i for i in report["issues"] if i["kind"] == "offering_code_level_conflict_excluded")
        self.assertEqual(conflict["literal"]["eduCode"], "38.03.01")
        self.assertTrue(conflict["xpath"].startswith("/html/body"))

    def test_rebuild_is_stable(self):
        again = reader.run_one(SLUG, {SLUG: UNIVERSITY}, self.fetcher, max_pages=10)
        second = json.loads((self.cache / SLUG / "review.json").read_text(encoding="utf-8"))
        self.assertEqual(again["counts"], self.report["counts"])
        self.assertEqual(second, self.review)

    def test_apply_writes_the_daily_file_through_the_importer(self):
        output = self.cache / "fill-test.json"
        self.assertEqual(reader.apply_reviews([SLUG], self.cache, output, existing={}), [SLUG])
        daily = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual([p["universitySlug"] for p in daily["profiles"]], [SLUG])
        self.assertEqual(len(daily["profiles"][0]["offerings"]), 5)

    def test_apply_skips_programs_the_card_already_shows(self):
        output = self.cache / "fill-test.json"
        # Same program as an older batch wrote it: other level wording, case and form spelling.
        existing = {SLUG: [["40.03.01", "Юриспруденция", "Гражданское право", "Очная"], ["5.1.1", "Теоретико-исторические правовые науки", "5.1.1 Теоретико-исторические правовые науки", "очная"]]}
        reader.apply_reviews([SLUG], self.cache, output, existing=existing)
        daily = json.loads(output.read_text(encoding="utf-8"))
        codes = sorted((row["code"], row["profile"]) for row in daily["profiles"][0]["offerings"])
        self.assertEqual(codes, [("21.05.04", "Подземная разработка"), ("40.03.01", "Уголовное право"), ("40.04.01", None)])
        self.assertIn("offerings_already_in_catalog", [issue["kind"] for issue in daily["issues"]])

    def test_apply_replay_preserves_same_day_catalog_profile(self):
        output = self.cache / "fill-test.json"
        reader.apply_reviews([SLUG], self.cache, output, existing={})
        original = output.read_bytes()
        known = {SLUG: [["40.03.01", "Юриспруденция", "Гражданское право", "очная"]]}
        self.assertEqual(reader.apply_reviews([SLUG], self.cache, output, existing=known), [])
        self.assertEqual(output.read_bytes(), original)

    def test_reuse_verified_reviews_matches_regular_apply(self):
        output = self.cache / "fill-test.json"
        reused = self.cache / "fill-reused.json"
        known = {SLUG: [["40.03.01", "Юриспруденция", "Гражданское право", "очная"]]}
        reader.apply_reviews([SLUG], self.cache, output, existing=known)
        self.assertEqual(reader.apply_reviews([SLUG], self.cache, reused, existing=known, reuse_reviews=True), [SLUG])
        self.assertEqual(reused.read_bytes(), output.read_bytes())
        self.assertEqual(reader.apply_reviews([SLUG], self.cache, reused, existing=known, reuse_reviews=True), [])

    def test_reuse_fails_entire_batch_if_review_is_missing(self):
        output = self.cache / "fill-test.json"
        with self.assertRaisesRegex(ValueError, "Cannot reuse cached review for missing"):
            reader.apply_reviews([SLUG, "missing"], self.cache, output, existing={}, reuse_reviews=True)
        self.assertFalse(output.exists())

    def test_reuse_rejects_body_tampering_even_when_literals_survive(self):
        output = self.cache / "fill-test.json"
        body = self.cache / SLUG / self.review["sources"][0]["bodyPath"]
        body.write_bytes(body.read_bytes() + b"<!-- changed body -->")
        with self.assertRaisesRegex(ValueError, "cached response SHA-256 mismatch"):
            reader.apply_reviews([SLUG], self.cache, output, existing={}, reuse_reviews=True)
        self.assertFalse(output.exists())

    def test_non_delivery_is_evidence_and_a_real_form_survives(self):
        url = SITE + "/sveden/education/eduop/"
        seed_cache(self.cache, {url: (EDUOP_WITH_NON_DELIVERY, "utf-8")})
        reader.run_one(SLUG, {SLUG: UNIVERSITY}, self.fetcher, max_pages=10)
        review_path = self.cache / SLUG / "review.json"
        review = json.loads(review_path.read_text(encoding="utf-8"))
        forms = [row["forms"] for row in review["profile"]["offerings"] if row["profile"] == "Гражданское право"]
        self.assertEqual(forms, ["очная"])
        note = next(i for i in review["issues"] if i["kind"] == "offering_not_delivered")
        self.assertEqual((note["forms"], note["sourceUrl"], note["checkedAt"]), ("Не реализуется", url, CHECKED_AT))
        self.assertEqual(note["sourceSha256"], hashlib.sha256(EDUOP_WITH_NON_DELIVERY.encode("utf-8")).hexdigest())
        self.assertIsNone(note["sourceYear"])
        self.assertTrue(note["xpath"].startswith("/html/body"))

    def test_reuse_validates_and_prunes_older_non_delivery_rows(self):
        url = SITE + "/sveden/education/eduop/"
        seed_cache(self.cache, {url: (EDUOP_WITH_NON_DELIVERY, "utf-8")})
        reader.run_one(SLUG, {SLUG: UNIVERSITY}, self.fetcher, max_pages=10)
        review_path = self.cache / SLUG / "review.json"
        review = json.loads(review_path.read_text(encoding="utf-8"))
        review["issues"] = [i for i in review["issues"] if i["kind"] != "offering_not_delivered"]
        existing = next(row for row in review["profile"]["offerings"] if row["profile"] == "Гражданское право")
        review["profile"]["offerings"].append({**existing, "forms": "Не реализуется", "duration": None})
        review_path.write_text(json.dumps(review, ensure_ascii=False), encoding="utf-8")
        output = self.cache / "fill-test.json"
        reader.apply_reviews([SLUG], self.cache, output, existing={}, reuse_reviews=True)
        daily = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(len(daily["profiles"][0]["offerings"]), 5)
        note = next(i for i in daily["issues"] if i["kind"] == "offering_not_delivered")
        self.assertEqual(note["sourceUrl"], url)
        self.assertEqual(note["sourceSha256"], hashlib.sha256(EDUOP_WITH_NON_DELIVERY.encode("utf-8")).hexdigest())

    def test_combined_forms_require_all_exact_program_forms_before_skipping(self):
        url = SITE + "/sveden/education/eduop/"
        aggregate = NON_DELIVERY_ROW.replace("Не реализуется", "очная; заочная")
        page = EDUOP.replace("</table>", aggregate + "</table>", 1)
        seed_cache(self.cache, {url: (page, "utf-8")})
        reader.run_one(SLUG, {SLUG: UNIVERSITY}, self.fetcher, max_pages=10)
        partial = self.cache / "fill-partial.json"
        reader.apply_reviews([SLUG], self.cache, partial, existing={}, reuse_reviews=True)
        first_pass = json.loads(partial.read_text(encoding="utf-8"))
        self.assertIn("очная; заочная", {row["forms"] for row in first_pass["profiles"][0]["offerings"]})

        complete = self.cache / "fill-complete.json"
        known = {SLUG: [["40.03.01", "Юриспруденция", "Гражданское право", "Заочная"]]}
        reader.apply_reviews([SLUG], self.cache, complete, existing=known, reuse_reviews=True)
        second_pass = json.loads(complete.read_text(encoding="utf-8"))
        civil_law = [row["forms"] for row in second_pass["profiles"][0]["offerings"] if row["profile"] == "Гражданское право"]
        self.assertEqual(civil_law, ["очная"])
        self.assertEqual(next(i for i in second_pass["issues"] if i["kind"] == "offerings_already_in_catalog")["aggregateCount"], 1)

    def test_undated_facts_survive_as_evidence_even_without_offerings(self):
        common_url = SITE + "/sveden/common/"
        struct_url = SITE + "/sveden/struct/"
        undated_common = COMMON.replace("Дата последнего обновления сведений: 14.10.2025", "© 2026")
        undated_struct = STRUCT.replace("Страница обновлена: 11 ноября 2026", "")
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            fetcher = seed_cache(cache, {common_url: (undated_common, "utf-8"), struct_url: (undated_struct, "cp1251")})
            report = reader.run_one(SLUG, {SLUG: UNIVERSITY}, fetcher, max_pages=10)
            self.assertEqual(report["status"], "partial")
            self.assertEqual(report["counts"], {"fields": 0, "faculties": 0, "offerings": 0})
            output = cache / "fill-test.json"
            self.assertEqual(reader.apply_reviews([SLUG], cache, output, existing={}), [SLUG])
            daily = json.loads(output.read_text(encoding="utf-8"))

        undated_facts = [i for i in daily["issues"] if i["kind"] == "directory_fact_without_source_year"]
        date = next(i for i in undated_facts if i.get("field") == "regDate")
        self.assertEqual(date["value"], "01.09.1930")
        self.assertEqual(date["sourceUrl"], common_url)
        self.assertEqual(date["sourceSha256"], hashlib.sha256(undated_common.encode("utf-8")).hexdigest())
        self.assertEqual(date["checkedAt"], CHECKED_AT)
        self.assertIsNone(date["sourceYear"])
        law = next(i for i in undated_facts if i.get("faculty") == "Институт права")
        self.assertEqual(law["sourceUrl"], struct_url)
        self.assertEqual(law["url"], "https://law.sample-univ.ru/")
        self.assertTrue(all(s["sourceYear"] is None for s in daily["sources"]))


class FakeNetworkTests(unittest.TestCase):
    """Fetcher behaviour with a scripted curl: redirects, slow hosts, robots."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.fetcher = reader.Fetcher(Path(self.tmp.name), delay=0)
        self.calls = []
        page = ("<html><body>" + FILLER + "</body></html>").encode("utf-8")
        script = self.script = {}

        def fake(url, body, headers, max_time):
            self.calls.append(url)
            status, location, error = script.get(url, ("200", None, None))
            if error:
                return "000", "", error
            headers.write_text(f"HTTP/1.1 {status}\r\ncontent-type: text/html; charset=utf-8\r\n" + (f"location: {location}\r\n" if location else ""), encoding="iso-8859-1")
            body.write_bytes(b"User-agent: *\nDisallow: /private/\n" if url.endswith("/robots.txt") else page)
            return status, headers.read_text(encoding="iso-8859-1"), None

        self.fetcher.curl_once = fake

    def tearDown(self):
        self.tmp.cleanup()

    def test_http_redirect_is_upgraded_not_followed(self):
        self.script["https://x.ru/sveden/education/eduaccred"] = ("301", "http://x.ru/sveden/education/eduaccred/", None)
        record = self.fetcher.get("x", "https://x.ru/sveden/education/eduaccred", "x.ru")
        self.assertNotIn("error", record)
        self.assertEqual(record["url"], "https://x.ru/sveden/education/eduaccred/")
        self.assertTrue(all(not url.startswith("http://") for url in self.calls))

    def test_redirect_to_another_domain_stops(self):
        self.script["https://x.ru/sveden/common/"] = ("302", "https://other.ru/sveden/common/", None)
        record = self.fetcher.get("x", "https://x.ru/sveden/common/", "x.ru")
        self.assertTrue(record["error"].startswith("redirect_outside_official_domain"))

    def test_one_slow_page_does_not_kill_a_live_host(self):
        self.script["https://x.ru/sveden/education/"] = (None, None, "curl: (28) Operation timed out")
        self.assertIn("error", self.fetcher.get("x", "https://x.ru/sveden/education/", "x.ru"))
        self.assertNotIn("error", self.fetcher.get("x", "https://x.ru/sveden/struct/", "x.ru"))

    def test_silent_host_fails_fast_after_first_page_timeout(self):
        for url in ("https://y.ru/robots.txt", "https://y.ru/sveden/common/"):
            self.script[url] = (None, None, "curl: (28) Connection timed out")
        first = self.fetcher.get("y", "https://y.ru/sveden/common/", "y.ru")
        second = self.fetcher.get("y", "https://y.ru/sveden/struct/", "y.ru")
        self.assertTrue(first["error"].startswith("network: curl: (28)"))
        self.assertIn("unreachable earlier", second["error"])
        self.assertEqual(self.calls, ["https://y.ru/robots.txt", "https://y.ru/sveden/common/"])

    def test_unanswered_robots_txt_does_not_hide_a_live_site(self):
        self.script["https://y.ru/robots.txt"] = (None, None, "curl: (28) Connection timed out")
        record = self.fetcher.get("y", "https://y.ru/sveden/common/", "y.ru")
        self.assertNotIn("error", record)

    def test_bare_domain_is_tried_when_www_host_is_silent(self):
        for url in ("https://www.z.ru/robots.txt", "https://www.z.ru/sveden/common/"):
            self.script[url] = (None, None, "curl: (28) Connection timed out")
        university = {"slug": "z", "name": "Тестовый университет", "website": "http://www.z.ru"}
        _, report = reader.collect("z", university, self.fetcher, max_pages=2)
        fetched = [page["url"] for page in report["pages"] if not page.get("error")]
        self.assertIn("https://z.ru/sveden/common/", fetched)
        self.assertTrue(all(url.startswith("https://z.ru/") for url in fetched))

    def test_robots_disallow_is_honoured(self):
        record = self.fetcher.get("x", "https://x.ru/private/sveden/", "x.ru")
        self.assertTrue(record["error"].startswith("robots_disallowed"))

    def test_failed_page_is_retried_next_run(self):
        self.script["https://x.ru/sveden/common/"] = ("500", None, None)
        self.assertEqual(self.fetcher.get("x", "https://x.ru/sveden/common/", "x.ru")["error"], "http_500")
        del self.script["https://x.ru/sveden/common/"]
        self.assertNotIn("error", self.fetcher.get("x", "https://x.ru/sveden/common/", "x.ru"))


class HelperTests(unittest.TestCase):
    def test_non_delivery_marker_must_be_the_entire_form(self):
        self.assertTrue(reader.explicitly_not_delivered("  НЕ РЕАЛИЗУЕТСЯ.  "))
        self.assertFalse(reader.explicitly_not_delivered("очная; заочная не реализуется"))
        self.assertFalse(reader.explicitly_not_delivered(None))

    def test_long_official_labels_and_standard_paths_are_followed(self):
        page = lxml_html.fromstring("""<html><body>
          <a href="/sveden/education/eduop">Информация о реализуемых образовательных программах с указанием учебных предметов, практики, методических материалов</a>
          <a href="/sveden/education/study">Информация о численности обучающихся</a>
          <a href="/sveden/education/plans">Учебные планы образовательных программ</a>
          <a href="/sveden/education/eduaccred">Аккредитация</a>
          <a href="https://other.ru/sveden/education/eduop">Чужой сайт</a>
        </body></html>""")
        links = reader.education_links(page, "https://x.ru/sveden/education/", "x.ru")
        self.assertEqual(links, ["https://x.ru/sveden/education/eduop", "https://x.ru/sveden/education/eduaccred"])

    def test_thin_duplicates_and_repeated_profiles_are_dropped(self):
        page = lxml_html.fromstring(f"""<html><body>
          <h2>Информация о реализуемых образовательных программах</h2>
          <table><tr><th>Код</th></tr>
          <tr itemprop="eduOp"><td itemprop="eduCode">38.03.05</td><td itemprop="eduName">Бизнес-информатика</td><td itemprop="eduLevel">Высшее образование - бакалавриат</td><td itemprop="eduProf">Цифровая экономика</td><td itemprop="eduForm">Очная</td><td itemprop="learningTerm">4 года</td></tr>
          <tr itemprop="eduOp"><td itemprop="eduCode">31.02.03</td><td itemprop="eduName">Лабораторная диагностика</td><td itemprop="eduLevel">Среднее профессиональное образование</td><td itemprop="eduProf">31.02.03, Лабораторная диагностика</td><td itemprop="eduForm">Очная</td><td></td></tr>
          </table>
          <h2>Срок действия государственной аккредитации</h2>
          <table><tr><th>Код</th></tr>
          <tr itemprop="eduAccred"><td itemprop="eduCode">38.03.05</td><td itemprop="eduName">Бизнес-информатика</td><td itemprop="eduLevel">Бакалавриат</td></tr>
          <tr itemprop="eduAccred"><td itemprop="eduCode">01.03.02</td><td itemprop="eduName">Прикладная математика</td><td itemprop="eduLevel">Бакалавриат</td></tr>
          </table>
          <h2>Сведения о профессионально-общественной аккредитации образовательной программы</h2>
          <table><tr><th>Код</th></tr>
          <tr itemprop="eduAccred"><td itemprop="eduCode">40.04.01</td><td itemprop="eduName">Юриспруденция</td><td itemprop="eduLevel">Магистратура</td></tr>
          </table></body></html>""")
        issues = []
        rows = reader.deduplicate(reader.education_rows(page, "https://x.ru/sveden/education/", issues), issues)
        found = {(row["code"], row["level"], row["profile"]) for row, _ in rows}
        self.assertEqual(found, {
            ("38.03.05", "Высшее образование - бакалавриат", "Цифровая экономика"),
            ("31.02.03", "Среднее профессиональное образование", None),
            ("01.03.02", "Бакалавриат", None),
        })
        kinds = [issue["kind"] for issue in issues]
        self.assertIn("offering_subsumed_by_richer_row", kinds)
        self.assertIn("public_accreditation_table_skipped", kinds)

    def test_official_https_only(self):
        self.assertTrue(reader.allowed("https://abitur.sample-univ.ru/x", "sample-univ.ru"))
        self.assertFalse(reader.allowed("http://sample-univ.ru/", "sample-univ.ru"))
        self.assertFalse(reader.allowed("https://sample-univ.ru.evil.com/", "sample-univ.ru"))
        self.assertFalse(reader.allowed("https://notsample-univ.ru/", "sample-univ.ru"))
        self.assertEqual(reader.official_base("http://www.ursmu.ru"), "ursmu.ru")

    def test_encoding_detection(self):
        self.assertEqual(reader.detect_encoding("<meta charset=windows-1251>Привет".encode("cp1251")), "cp1251")
        self.assertEqual(reader.detect_encoding("Привет".encode("utf-8"), "text/html; charset=UTF-8"), "utf-8")

    def test_level_rules(self):
        self.assertEqual(reader.code_family("40.03.01"), "bachelor")
        self.assertEqual(reader.code_family("5.1.1"), "postgraduate")
        self.assertEqual(reader.level_family("подготовка специалистов среднего звена"), ({"spo"}, False))
        self.assertEqual(reader.level_family("базовое высшее образование"), ({"bachelor", "specialist"}, False))
        self.assertTrue(reader.level_family("бакалавриат, магистратура")[1])
        # One legal level (273-ФЗ, ст. 10), valid for .05 and .04 codes.
        self.assertEqual(reader.level_family("Высшее образование — специалитет, магистратура"), ({"specialist", "master"}, False))

    def test_queue_reads_waiting_rows_only(self):
        text = "\n".join([
            "| --: | --- | --- | --- | --- | --- |",
            "|   1 | `hse`               | ВШЭ | Москва | 7/11 | в работе |",
            "|   2 | `mgu`               | МГУ | Москва | 3/11 | ждёт     |",
            "| 715 | `russia-10000238`   | Филиал | Азов | 0/11 | ждёт |",
            "|   3 | `mephi`             | МИФИ | Москва | 3/11 | готово |",
        ])
        self.assertEqual(reader.queue_slugs(text), ["mgu", "russia-10000238"])


if __name__ == "__main__":
    unittest.main()

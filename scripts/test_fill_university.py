"""Catalog collector regressions: provenance, all levels, and safe daily replay."""

from copy import deepcopy
from datetime import date, datetime
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("fill_university", Path(__file__).with_name("fill_university.py"))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class FillUniversityTests(unittest.TestCase):
    def review(self):
        return {
            "officialHosts": ["university.ru"], "scope": "Проверенные сведения и перечни",
            "sources": [{
                "id": "education", "url": "https://university.ru/sveden/education/",
                "checkedAt": "2026-11-20T10:00:00Z", "sourceYear": None,
                "extractText": "Университет. 01.04.01 Математика магистратура. 5.1.1 Теория права аспирантура.",
            }],
            "profile": {
                "fields": {},
                "faculties": [],
                "offerings": [{
                    "code": "01.04.01", "title": "Математика", "level": "магистратура",
                    "profile": None, "forms": None, "duration": None,
                    "source": "education", "sourceSection": "Реализуемые программы",
                }, {
                    "code": "5.1.1", "title": "Теория права", "level": "аспирантура",
                    "source": "education", "sourceSection": "Научные специальности",
                }],
            }, "issues": [{"kind": "unknown_admissions", "note": "Приём не установлен"}],
        }

    def build(self, review=None):
        return collector.build_profile("sample", review or self.review(), Path("."))

    def test_extract_digest_is_not_presented_as_original_http_bytes(self):
        review = self.review()
        profile, sources = self.build(review)
        expected = hashlib.sha256(review["sources"][0]["extractText"].encode()).hexdigest()
        self.assertEqual(sources[0]["sourceSha256"], expected)
        self.assertEqual(sources[0]["sourceSha256Basis"], "extract-only")
        self.assertNotIn("bytes", sources[0])
        self.assertNotIn("sourceSha256Basis", profile["offerings"][0])
        self.assertEqual(profile["offerings"][0]["sourceSha256"], sources[0]["sourceSha256"])
        self.assertEqual(profile["offerings"][0]["sourceUrl"], sources[0]["url"])
        self.assertIsNone(profile["offerings"][0]["sourceYear"])

    def test_fact_keys_fit_the_strict_catalog_contract(self):
        review = self.review()
        review["sources"][0]["sourceYear"] = 2026
        review["profile"]["fields"]["shortName"] = {"value": "Университет", "source": "education"}
        review["profile"]["faculties"] = [{
            "name": "Математика", "url": None, "source": "education", "sourceSection": "Факультеты",
        }]
        profile, sources = self.build(review)
        provenance = {"sourceUrl", "sourceYear", "checkedAt", "sourceSha256"}
        self.assertEqual(set(profile["fields"]["shortName"]), provenance | {"value"})
        self.assertEqual(set(profile["faculties"][0]), provenance | {"name", "url", "sourceSection"})
        for row in profile["offerings"]:
            self.assertEqual(set(row), provenance | {
                "id", "code", "title", "profile", "level", "forms", "duration", "admissionsStatus", "sourceSection",
            })
        self.assertEqual(sources[0]["sourceSha256Basis"], "extract-only")

    def test_all_published_levels_remain_listings_with_unknown_intake(self):
        profile, _ = self.build()
        self.assertEqual([row["level"] for row in profile["offerings"]], ["магистратура", "аспирантура"])
        self.assertTrue(all(row["admissionsStatus"] == "pending_review" for row in profile["offerings"]))
        self.assertTrue(all(row["sourceYear"] is None for row in profile["offerings"]))

    def test_school_keeps_literal_not_applicable_code(self):
        review = self.review()
        review["sources"][0]["extractText"] = "не применимо Математика 10-11 класс Среднее общее образование очная 2 года"
        review["profile"]["offerings"] = [{
            "code": "не применимо", "title": "Математика 10-11 класс", "level": "Среднее общее образование",
            "forms": "очная", "duration": "2 года", "source": "education", "sourceSection": "Лицей",
        }]
        profile, _ = self.build(review)
        self.assertEqual(profile["offerings"][0]["code"], "не применимо")
        self.assertEqual(profile["offerings"][0]["admissionsStatus"], "pending_review")

    def test_capitalized_not_applicable_code_is_kept_literally(self):
        review = self.review()
        review["sources"][0]["extractText"] = "Не применимо Математика Дополнительное профессиональное образование"
        review["profile"]["offerings"] = [{
            "code": "Не применимо", "title": "Математика", "level": "Дополнительное профессиональное образование",
            "source": "education", "sourceSection": "ДПО",
        }]
        profile, _ = self.build(review)
        self.assertEqual(profile["offerings"][0]["code"], "Не применимо")

    def test_default_batch_day_changes_at_moscow_midnight(self):
        before_midnight = datetime.fromisoformat("2026-11-19T20:59:59+00:00")
        midnight = datetime.fromisoformat("2026-11-19T21:00:00+00:00")
        self.assertEqual(collector.moscow_batch_date(before_midnight), date(2026, 11, 19))
        self.assertEqual(collector.moscow_batch_date(midnight), date(2026, 11, 20))

    def test_offering_ids_do_not_change_with_source_fetch_metadata(self):
        review = self.review()
        first, _ = self.build(review)
        review["sources"][0]["checkedAt"] = "2026-11-21T10:01:00Z"
        review["sources"][0]["extractText"] += " Новая навигация сайта."
        second, _ = self.build(review)
        self.assertNotEqual(first["offerings"][0]["sourceSha256"], second["offerings"][0]["sourceSha256"])
        self.assertEqual([row["id"] for row in first["offerings"]], [row["id"] for row in second["offerings"]])

    def test_quote_cannot_substitute_structured_program_values(self):
        for key, value in (("profile", "Другой профиль"), ("forms", "заочная"), ("duration", "7 лет"), ("forms", "")):
            review = self.review()
            review["profile"]["offerings"][0].update({key: value, "evidence": "Математика"})
            with self.assertRaises(ValueError):
                self.build(review)

    def test_overview_may_paraphrase_an_explicit_source_quote(self):
        review = self.review()
        review["sources"][0]["sourceYear"] = 2026
        review["profile"]["fields"]["overview"] = {
            "value": "Вуз публикует магистерские программы.", "evidence": "Математика магистратура", "source": "education",
        }
        profile, _ = self.build(review)
        self.assertEqual(profile["fields"]["overview"]["value"], "Вуз публикует магистерские программы.")

    def test_reviewed_quote_must_exist_in_source(self):
        review = self.review()
        review["profile"]["fields"]["shortName"] = {"value": "Несуществующее имя", "source": "education"}
        with self.assertRaisesRegex(ValueError, "absent"):
            self.build(review)

    def test_unknown_field_year_is_not_silently_replaced_with_snapshot_year(self):
        review = self.review()
        review["profile"]["fields"]["shortName"] = {"value": "Университет", "source": "education"}
        with self.assertRaisesRegex(ValueError, "unknown sourceYear"):
            self.build(review)
        review["sources"][0]["sourceYear"] = 2026
        profile, _ = self.build(review)
        self.assertEqual(profile["fields"]["shortName"]["sourceYear"], 2026)

    def test_foreign_domain_and_fake_subdomain_are_rejected(self):
        for url in ("https://university.ru.example.org/sveden/", "https://example.org/", "file:///secret"):
            review = self.review()
            review["sources"][0]["url"] = url
            with self.assertRaises(ValueError):
                self.build(review)

    def test_naive_or_non_utc_review_date_is_rejected(self):
        for timestamp in ("2026-11-20T10:00:00", "2026-11-20T10:00:00+03:00"):
            review = self.review()
            review["sources"][0]["checkedAt"] = timestamp
            with self.assertRaisesRegex(ValueError, "UTC"):
                self.build(review)

    def test_original_snapshot_digest_uses_response_bytes(self):
        review = self.review()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "snapshot.html"
            raw = ("<html><body>" + review["sources"][0].pop("extractText") + "</body></html>").encode()
            path.write_bytes(raw)
            review["sources"][0]["bodyPath"] = str(path)
            _, sources = self.build(review)
        self.assertEqual(sources[0]["sourceSha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(sources[0]["sourceSha256Basis"], "response-bytes")
        self.assertEqual(sources[0]["bytes"], len(raw))
        self.assertNotIn("bodyPath", sources[0])

    def test_pdf_body_and_reviewed_extraction_have_separate_hashes(self):
        review = self.review()
        text = review["sources"][0].pop("extractText")
        with tempfile.TemporaryDirectory() as directory:
            raw = b"%PDF-1.7 binary fixture"
            pdf = Path(directory) / "snapshot.pdf"
            pdf.write_bytes(raw)
            text_path = Path(directory) / "snapshot.txt"
            text_path.write_text(text, encoding="utf-8")
            review["sources"][0].update(bodyPath=str(pdf), textPath=str(text_path))
            _, sources = self.build(review)
        self.assertEqual(sources[0]["sourceSha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(sources[0]["sourceSha256Basis"], "response-bytes")
        self.assertEqual(sources[0]["verificationTextBasis"], "reviewed-extraction")
        self.assertEqual(sources[0]["extractTextSha256"], hashlib.sha256(text.encode()).hexdigest())
        self.assertNotIn("bodyPath", sources[0])
        self.assertNotIn("textPath", sources[0])

    def test_daily_replay_preserves_other_universities_and_is_idempotent(self):
        review = self.review()
        profile, sources = self.build(review)
        first = collector.merge_daily(None, "sample", review, profile, sources)
        other_profile, other_sources = collector.build_profile("other", review, Path("."))
        both = collector.merge_daily(first, "other", review, other_profile, other_sources)
        original = deepcopy(both)
        replay = collector.merge_daily(both, "sample", review, profile, sources)
        self.assertEqual(both, original)
        self.assertEqual(next(p for p in replay["profiles"] if p["universitySlug"] == "other"), other_profile)
        self.assertEqual(len(replay["profiles"]), 2)
        self.assertEqual(len(replay["issues"]), 2)
        self.assertEqual(collector.merge_daily(replay, "sample", review, profile, sources), replay)


if __name__ == "__main__":
    unittest.main()

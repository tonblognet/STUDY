"""Safety regressions for the manually associated contacts batch."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from lxml import html


SPEC = importlib.util.spec_from_file_location("contacts_collector", Path(__file__).with_name("collect-contacts-enrichment.py"))
COLLECTOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(COLLECTOR)


def review(**changes):
    row = {
        "universitySlug": "sample",
        "field": "admissionsEmail",
        "url": "https://sample.ru/admission/",
        "xpath": '//*[@id="office"]',
        "evidence": "Приемная комиссия Эл. адрес: office@sample.ru",
        "value": "office@sample.ru",
        "context": "admissions-office",
    }
    return {**row, **changes}


def save_source(work, raw=None, status="200"):
    raw = raw or '<html><body><div id="office">Приемная комиссия Эл. адрес: office@sample.ru</div></body></html>'.encode()
    row = review()
    body_path, meta_path = COLLECTOR.source_paths(work, row["universitySlug"], row["url"])
    body_path.parent.mkdir(parents=True, exist_ok=True)
    body_path.write_bytes(raw)
    meta = {"universitySlug": "sample", "requestedUrl": row["url"], "url": row["url"], "httpStatus": status, "exitCode": 0, "checkedAt": "2026-10-22T08:23:54+00:00", "encoding": "utf-8", "body": body_path.relative_to(work).as_posix(), "sourceSha256": hashlib.sha256(raw).hexdigest()}
    COLLECTOR.dump(meta_path, meta)
    return meta


class ContactsSafetyTests(unittest.TestCase):
    def setUp(self):
        official = patch.dict(COLLECTOR.OFFICIAL_HOSTS, {"sample": {"sample.ru"}})
        official.start()
        self.addCleanup(official.stop)

    def test_redirect_is_checked_before_any_request_to_an_unapproved_destination(self):
        for destination in ["https://external.example/office", "https://sample.ru.attacker.example/", "http://sample.ru/office", "https://user:secret@sample.ru/", "https://127.0.0.1/", "//169.254.169.254/latest/meta-data/"]:
            response = COLLECTOR.requests.Response()
            response.status_code = 302
            response.url = review()["url"]
            response.headers["Location"] = destination
            response._content = b""
            response._content_consumed = True
            with self.subTest(destination=destination), patch.object(COLLECTOR, "require_public_resolution") as dns, patch.object(COLLECTOR.requests, "get", return_value=response) as request:
                with self.assertRaises(ValueError):
                    COLLECTOR.safe_get("sample", review()["url"])
                self.assertEqual(request.call_count, 1)
                self.assertEqual(dns.call_count, 1)
                self.assertIs(request.call_args.kwargs["allow_redirects"], False)

    def test_private_dns_destination_is_blocked_before_network_request(self):
        for address in ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]:
            with self.subTest(address=address), patch.object(COLLECTOR.socket, "getaddrinfo", return_value=[(0, 0, 0, "", (address, 443))]), patch.object(COLLECTOR.requests, "get") as request:
                with self.assertRaisesRegex(ValueError, "non-public"):
                    COLLECTOR.safe_get("sample", review()["url"])
                request.assert_not_called()

    def test_successful_same_university_redirect_is_manual_and_dns_checked_each_time(self):
        redirect = COLLECTOR.requests.Response()
        redirect.status_code = 302
        redirect.url = review()["url"]
        redirect.headers["Location"] = "https://admission.sample.ru/office"
        redirect._content = b""
        redirect._content_consumed = True
        final = COLLECTOR.requests.Response()
        final.status_code = 200
        final.url = "https://admission.sample.ru/office"
        final._content = b"official office"
        final._content_consumed = True
        with patch.object(COLLECTOR.socket, "getaddrinfo", return_value=[(0, 0, 0, "", ("93.184.216.34", 443))]) as dns, patch.object(COLLECTOR.requests, "get", side_effect=[redirect, final]) as request:
            self.assertIs(COLLECTOR.safe_get("sample", review()["url"]), final)
            self.assertEqual(request.call_count, 2)
            self.assertEqual(dns.call_count, 2)
            self.assertTrue(all(call.kwargs["allow_redirects"] is False for call in request.call_args_list))

    def test_redirect_chain_and_loop_cannot_continue_indefinitely(self):
        def redirect(url, **kwargs):
            response = COLLECTOR.requests.Response()
            response.status_code = 302
            response.url = url
            response.headers["Location"] = url + "next/"
            response._content = b""
            response._content_consumed = True
            return response
        with patch.object(COLLECTOR, "require_public_resolution"), patch.object(COLLECTOR.requests, "get", side_effect=redirect) as request:
            with self.assertRaisesRegex(ValueError, "limit"):
                COLLECTOR.safe_get("sample", review()["url"], max_redirects=2)
            self.assertEqual(request.call_count, 3)
        response = redirect(review()["url"])
        response.headers["Location"] = review()["url"]
        with patch.object(COLLECTOR, "require_public_resolution"), patch.object(COLLECTOR.requests, "get", return_value=response) as request:
            with self.assertRaisesRegex(ValueError, "loop"):
                COLLECTOR.safe_get("sample", review()["url"])
            self.assertEqual(request.call_count, 1)

    def test_frozen_metadata_rejects_unsafe_origin_failed_exit_rejection_and_bad_date(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            original = save_source(work)
            _, metadata_path = COLLECTOR.source_paths(work, "sample", review()["url"])
            for changes in [{"url": "https://external.example/"}, {"url": "http://127.0.0.1/"}, {"url": "https://user@sample.ru/"}, {"exitCode": 28}, {"exitCode": False}, {"rejected": "access_challenge"}, {"checkedAt": "not-a-date"}, {"checkedAt": "2026-10-21T09:00:00Z"}, {"sourceSha256": "invalid"}, {"requestedUrl": "https://sample.ru/other"}, {"universitySlug": "different"}]:
                with self.subTest(changes=changes):
                    COLLECTOR.dump(metadata_path, {**original, **changes})
                    with self.assertRaises(ValueError):
                        COLLECTOR.load_evidence(work, "sample", review()["url"])

    def test_checked_at_validation_has_a_deterministic_clock_and_requires_batch_utc(self):
        now = datetime(2026, 10, 22, 10, 0, 0, tzinfo=timezone.utc)
        for valid in ["2026-10-22T09:00:00Z", "2026-10-22T09:00:00.123456+00:00"]:
            COLLECTOR.validate_checked_at(valid, now=now)
        for invalid in ["2026-10-22", "2026-10-22T09:00:00", "2026-10-22T09:00:00+03:00", "2026-10-21T09:00:00Z", "2026-10-32T09:00:00Z"]:
            with self.subTest(value=invalid), self.assertRaises(ValueError):
                COLLECTOR.validate_checked_at(invalid, now=now)
        with self.assertRaisesRegex(ValueError, "future"):
            COLLECTOR.validate_checked_at("2026-10-22T10:00:01Z", now=now)

    def test_http_200_challenge_page_cannot_be_frozen_evidence(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            save_source(work, raw=b'<html><body>Just a moment. Checking your browser before accessing the university.</body></html>')
            with self.assertRaisesRegex(ValueError, "access challenge"):
                COLLECTOR.load_evidence(work, "sample", review()["url"])

    def test_source_values_outside_reviewed_office_cannot_leak_from_footer(self):
        tree = html.fromstring('<body><div id="office">Приемная комиссия Эл. адрес: office@sample.ru</div><footer>priem@minobrnauki.gov.ru</footer></body>')
        self.assertEqual(COLLECTOR.validate_review(review(), tree), "office@sample.ru")
        with self.assertRaisesRegex(ValueError, "evidence missing"):
            COLLECTOR.validate_review(review(evidence="priem@minobrnauki.gov.ru", value="priem@minobrnauki.gov.ru"), tree)

    def test_explicit_ministry_email_is_never_a_university_contact(self):
        tree = html.fromstring('<body><div id="office">Приемная комиссия priem@minobrnauki.gov.ru</div></body>')
        with self.assertRaisesRegex(ValueError, "ministry email"):
            COLLECTOR.validate_review(review(evidence="Приемная комиссия priem@minobrnauki.gov.ru", value="priem@minobrnauki.gov.ru"), tree)

    def test_personal_staff_context_does_not_become_generic_office_context(self):
        tree = html.fromstring('<body><div id="office">Секретарь: person@sample.ru</div></body>')
        with self.assertRaisesRegex(ValueError, "office context"):
            COLLECTOR.validate_review(review(evidence="Секретарь: person@sample.ru", value="person@sample.ru", context="named-staff"), tree)

    def test_supported_evidence_cannot_authorize_an_invented_value(self):
        tree = html.fromstring('<body><div id="office">Приемная комиссия Эл. адрес: office@sample.ru</div></body>')
        with self.assertRaisesRegex(ValueError, "value is not present"):
            COLLECTOR.validate_review(review(value="invented@sample.ru"), tree)

    def test_failed_or_tampered_http_evidence_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            save_source(work, status="404")
            with self.assertRaisesRegex(ValueError, "not HTTP 200"):
                COLLECTOR.load_evidence(work, "sample", review()["url"])
            save_source(work)
            body_path, _ = COLLECTOR.source_paths(work, "sample", review()["url"])
            body_path.write_bytes(body_path.read_bytes() + b"changed")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                COLLECTOR.load_evidence(work, "sample", review()["url"])

    def test_windows_1251_source_preserves_cyrillic_context(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            raw = '<body><div id="office">Приемная комиссия Эл. адрес: office@sample.ru</div></body>'.encode("windows-1251")
            meta = save_source(work, raw)
            _, meta_path = COLLECTOR.source_paths(work, "sample", review()["url"])
            meta["encoding"] = "windows-1251"
            COLLECTOR.dump(meta_path, meta)
            _, tree = COLLECTOR.load_evidence(work, "sample", review()["url"])
            self.assertEqual(COLLECTOR.validate_review(review(), tree), "office@sample.ru")

    def test_frozen_existing_field_is_never_overwritten_or_retimestamped(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            save_source(work)
            baseline = {"fields": {"sample": {"admissionsEmail": {"value": "old@sample.ru", "checkedAt": "2026-09-15"}}}, "files": []}
            original = deepcopy(baseline)
            with patch.object(COLLECTOR, "REVIEWED", [review()]), patch.object(COLLECTOR, "TARGETS", {"sample": [review()["url"]]}):
                with self.assertRaisesRegex(ValueError, "overwrite a frozen baseline"):
                    COLLECTOR.build(work, baseline)
            self.assertEqual(baseline, original)

    def test_source_plan_excludes_unapproved_url_and_duplicate_fields(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            save_source(work)
            baseline = {"fields": {"sample": {}}, "files": []}
            with patch.object(COLLECTOR, "REVIEWED", [review()]), patch.object(COLLECTOR, "TARGETS", {}):
                with self.assertRaisesRegex(ValueError, "explicit source plan"):
                    COLLECTOR.build(work, baseline)
            with patch.object(COLLECTOR, "REVIEWED", [review(), review()]), patch.object(COLLECTOR, "TARGETS", {"sample": [review()["url"]]}):
                with self.assertRaisesRegex(ValueError, "Duplicate reviewed field"):
                    COLLECTOR.build(work, baseline)

    def test_missing_network_evidence_remains_an_issue_without_zero_or_false(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            save_source(work, status="503")
            with patch.object(COLLECTOR, "REVIEWED", []), patch.object(COLLECTOR, "REVIEW_ISSUES", []):
                result = COLLECTOR.build(work, {"fields": {"sample": {}}, "files": []})
            self.assertEqual(result["profiles"], [])
            self.assertEqual(result["summary"]["newFields"], 0)
            self.assertEqual(result["issues"][0]["sourceUrl"], review()["url"])

    def test_actual_frozen_batch_replays_canonically_without_network(self):
        work = COLLECTOR.ROOT / "tmp/russia-research/contacts-enrichment-2026-10-22"
        if not (work / "baseline.json").exists():
            self.skipTest("Local frozen HTTP evidence is not available")
        baseline = json.loads((work / "baseline.json").read_text(encoding="utf-8"))
        expected = json.loads((COLLECTOR.ROOT / "data-sources/russia/contacts-enrichment-2026-10-22.json").read_text(encoding="utf-8"))
        with patch.object(COLLECTOR.requests, "get", side_effect=AssertionError("offline replay attempted a network request")), patch.object(COLLECTOR, "BASELINE_FILES", ["data-sources/russia/contacts-enrichment-2026-10-22.json"]):
            # Even after runtime imports this batch, its saved baseline is used.
            self.assertEqual(COLLECTOR.freeze_baseline(work), baseline)
            result = COLLECTOR.build(work, baseline)
        self.assertEqual(result, expected)
        self.assertEqual(result["summary"]["profiles"], 7)
        self.assertEqual(result["summary"]["newFields"], 14)
        for profile in result["profiles"]:
            self.assertEqual(profile["faculties"], [])
            self.assertEqual(profile["offerings"], [])
            for key, field in profile["fields"].items():
                self.assertNotIn(key, baseline["fields"][profile["universitySlug"]])
                self.assertEqual(field["sourceYear"], 2026)
                self.assertTrue(field["checkedAt"].startswith("2026-10-22T"))
                if key == "hostelInfo":
                    self.assertTrue(field["value"].endswith(COLLECTOR.HOSTEL_NOTE))


if __name__ == "__main__":
    unittest.main()

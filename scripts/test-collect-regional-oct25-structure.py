"""Scope, disclosure-cell and safe-evidence regressions for October 25."""
import hashlib
import importlib.util
import json
import socket
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import requests

SPEC = importlib.util.spec_from_file_location("oct25_structure", Path(__file__).with_name("collect-regional-oct25-structure.py"))
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)

META = {"requestedUrl": "https://www.isu.ru/sveden/struct/", "url": "https://isu.ru/sveden/struct/", "checkedAt": "2026-10-25T00:00:00Z", "sourceSha256": "a" * 64}
UNIVERSITY = {"slug": "russia-83", "name": "ИГУ", "city": "Иркутск", "directory": {"legalName": "ИГУ"}}


def document(rows):
    return collector.regional.tree(("<html><body><h2>Институты и факультеты</h2><table>" + rows + "</table></body></html>").encode())


def row(name, address="г. Иркутск, ул. Ленина, 3", site="https://isu.ru/faculty/"):
    return '<tr itemprop="structOrgUprav"><td itemprop="name">' + name + '</td><td itemprop="addressStr">' + address + '</td><td itemprop="site"><a href="' + site + '">Сайт</a></td></tr>'


class ScopeTests(unittest.TestCase):
    def parse(self, markup, names, university=UNIVERSITY, meta=META):
        approved = {university["slug"]: {meta["requestedUrl"]: names}}
        with patch.object(collector, "REVIEWED_UNITS", approved):
            return collector.reviewed_units(document(markup), meta, university)

    def test_exact_reviewed_names_exclude_new_faculty_and_preparatory_rows(self):
        markup = row("Физический факультет") + row("Факультет довузовской подготовки") + row("Новый факультет")
        units, candidates, evidence = self.parse(markup, ["Физический факультет"])
        self.assertEqual([unit["name"] for unit in units], ["Физический факультет"])
        self.assertEqual(len(candidates), 2)
        self.assertIn("г. Иркутск", evidence[0]["literalRowText"])
        self.assertEqual(evidence[0]["precedingHeadings"], ["Институты и факультеты"])

    def test_review_is_bound_to_the_exact_requested_source(self):
        approved = {"russia-83": {"https://isu.ru/other-source/": ["Физический факультет"]}}
        with patch.object(collector, "REVIEWED_UNITS", approved):
            units, _, _ = collector.reviewed_units(document(row("Физический факультет")), META, UNIVERSITY)
        self.assertEqual(units, [])

    def test_changed_reviewed_name_fails_instead_of_silently_disappearing(self):
        with self.assertRaisesRegex(ValueError, "disappeared"):
            self.parse(row("Физико-технический факультет"), ["Физический факультет"])

    def test_other_city_cannot_be_approved_accidentally(self):
        with self.assertRaisesRegex(ValueError, "main-city"):
            self.parse(row("Физический факультет", "г. Братск, ул. Ленина, 3"), ["Физический факультет"])

    def test_research_or_dpo_name_cannot_bypass_scope_filter_by_allowlist(self):
        for name in ["Институт дополнительного образования", "Научно-исследовательский институт механики"]:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "disappeared"):
                self.parse(row(name), [name])

    def test_institute_and_nested_faculty_are_distinct_units(self):
        units, _, _ = self.parse(row("Институт социальных наук") + row("Социальный факультет"), ["Институт социальных наук", "Социальный факультет"])
        self.assertEqual(len(units), 2)

    def test_shared_phonebook_is_not_a_faculty_url(self):
        units, _, _ = self.parse(row("Физический факультет", site="https://isu.ru/yargu/phonebook/"), ["Физический факультет"])
        self.assertIsNone(units[0]["url"])

    def test_asu_cityless_main_building_does_not_accept_znamensk(self):
        university = {**UNIVERSITY, "slug": "russia-11", "city": "Астрахань"}
        units, _, _ = self.parse(row("Физический факультет", "ул. Татищева д. 20а, учебный корпус №1"), ["Физический факультет"], university)
        self.assertEqual(len(units), 1)
        with self.assertRaisesRegex(ValueError, "main-city"):
            self.parse(row("Физический факультет", "г. Знаменск, ул. Островского, 16"), ["Физический факультет"], university)


class CommonDisclosureTests(unittest.TestCase):
    def test_whole_row_itemprop_reads_value_cell_and_telephone_without_fax(self):
        markup = '<tr itemprop="fullName"><th>Полное наименование</th><td>Федеральный университет</td></tr>'
        markup += '<tr itemprop="telephone"><th>Контактные телефоны</th><td>Телефон: <a href="tel:88512246400">8 (8512) 24-64-00</a><br/>Факс: <a href="fax:88512246864">8 (8512) 24-68-64</a></td></tr>'
        fields = collector.common_fields(document(markup), META)
        self.assertEqual(fields["fullName"]["value"], "Федеральный университет")
        self.assertEqual(fields["telephone"]["value"], "8 (8512) 24-64-00")
        self.assertEqual(fields["telephone"]["sourceYear"], 2026)

    def test_registration_date_omits_the_document_link_label(self):
        markup = '<tr itemprop="regDate"><td>Дата создания</td><td><p>01.10.1932 год<br/><a href="/decree.pdf">Выписка из постановления от 25 марта 1932</a></p></td></tr>'
        self.assertEqual(collector.common_fields(document(markup), META)["regDate"]["value"], "01.10.1932 год")

    def test_unmarked_footer_email_does_not_become_an_organization_field(self):
        self.assertEqual(collector.common_fields(document('<tr><td>Министерство: ministry@example.ru</td></tr>'), META), {})


class FrozenEvidenceTests(unittest.TestCase):
    def test_redirect_outside_official_domain_is_never_requested(self):
        response = requests.Response()
        response.status_code = 302
        response.url = "https://www.isu.ru/"
        response.headers["Location"] = "https://external.invalid/"
        response._content = b""
        response._content_consumed = True
        with patch.object(collector.safe, "require_public_resolution"), patch.object(collector.safe.requests, "get", return_value=response) as get:
            with self.assertRaisesRegex(ValueError, "official university domain"):
                collector.safe.safe_get("russia-83", "https://www.isu.ru/")
        self.assertEqual(get.call_count, 1)
        self.assertFalse(get.call_args.kwargs["allow_redirects"])

    def test_private_dns_destination_is_rejected_before_http(self):
        addresses = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))]
        with patch.object(collector.safe.socket, "getaddrinfo", return_value=addresses), patch.object(collector.safe.requests, "get") as get:
            with self.assertRaisesRegex(ValueError, "non-public"):
                collector.safe.safe_get("russia-83", "https://www.isu.ru/")
        get.assert_not_called()

    def test_timestamp_must_be_the_actual_batch_utc_date(self):
        for value in ["2026-10-24T12:00:00Z", "2026-10-25T03:00:00+03:00", "2026-10-25"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                collector.safe.validate_checked_at(value)

    def test_changed_raw_snapshot_fails_sha_validation(self):
        with TemporaryDirectory() as directory:
            work = Path(directory)
            body, meta_path = collector.safe.source_paths(work, "russia-83", META["requestedUrl"])
            body.parent.mkdir(parents=True)
            body.write_bytes(b"altered")
            collector.dump(meta_path, {**META, "universitySlug": "russia-83", "httpStatus": "200", "exitCode": 0})
            with self.assertRaisesRegex(ValueError, "Raw source hash mismatch"):
                collector.safe.load_evidence(work, "russia-83", META["requestedUrl"])

    def test_baseline_is_stable_after_coverage_changes(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            coverage = root / "data-sources/russia/coverage.json"
            rows = [{"slug": slug, "missing": ["faculties", "fullName"], "sourcedFields": 0, "faculties": 0, "educationalListings": 0} for slug in collector.TARGETS]
            collector.dump(coverage, {"generatedAt": "2026-10-24T00:00:00Z", "universities": rows})
            with patch.object(collector, "ROOT", root), patch.object(collector, "REPORT", root / "not-created.json"):
                before = collector.freeze_baseline(root / "cache")
                coverage.write_text("changed", encoding="utf-8")
                after = collector.freeze_baseline(root / "cache")
            self.assertEqual(before, after)

    @unittest.skipUnless((collector.WORK / "baseline.json").exists(), "Local frozen source bytes are not distributed in Git")
    def test_real_offline_replay_matches_both_saved_artifacts_without_network(self):
        def evidence_hashes():
            paths = [path for path in collector.WORK.rglob("*") if path.is_file()]
            paths += [collector.OUT, collector.REPORT]
            return {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}

        frozen_before = evidence_hashes()
        with TemporaryDirectory() as directory, patch.object(collector.safe.requests, "get", side_effect=AssertionError("offline replay attempted HTTP")):
            output, report = Path(directory) / "replay.json", Path(directory) / "report.json"
            second_output, second_report = Path(directory) / "second-replay.json", Path(directory) / "second-report.json"
            collector.build(collector.WORK, output, report)
            collector.build(collector.WORK, second_output, second_report)
            self.assertEqual(output.read_bytes(), second_output.read_bytes())
            self.assertEqual(report.read_bytes(), second_report.read_bytes())
            payload = json.loads(output.read_text(encoding="utf-8"))
            # Repository JSON is formatted by the delivery gate. Object-key
            # whitespace is irrelevant; list order and every value still match.
            self.assertEqual(payload, json.loads(collector.OUT.read_text(encoding="utf-8")))
            self.assertEqual(json.loads(report.read_text(encoding="utf-8")), json.loads(collector.REPORT.read_text(encoding="utf-8")))
            self.assertEqual(payload["stats"]["fields"], 42)
            self.assertEqual(payload["stats"]["faculties"], 78)
            self.assertTrue(all(not row["offerings"] for row in payload["profiles"]))
        self.assertEqual(frozen_before, evidence_hashes(), "Offline replay changed the frozen baseline, raw snapshots, receipts or repository artifacts")


if __name__ == "__main__":
    unittest.main()

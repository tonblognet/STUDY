"""Import one university's reviewed official evidence into the daily catalog file.

Usage: python scripts/fill_university.py hse --review tmp/hse-review.json

The review contains officialHosts, scope, sources, profile and optional issues.
Sources have id, url, checkedAt (UTC), sourceYear (published year or null), and
either extractText (a web-tool extraction), bodyPath (a local HTTP snapshot), or
neither (fetch the URL). bodyPath may be combined with extractText or textPath
for a reviewed PDF extraction: the response bytes and extraction are hashed
separately. Profile rows refer to a source by its id. Extract hashes
are explicitly extract-only; they never claim to describe original HTTP bytes.
An optional evidence quote must occur in the source. Otherwise literal values
are checked directly. Summaries such as overview must supply an evidence quote.
"""

import argparse
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
FIELDS = {
    "fullName", "shortName", "regDate", "address", "telephone", "email",
    "hostelInfo", "admissionsUrl", "admissionsPhone", "admissionsEmail", "overview",
}


def clean(value):
    return " ".join(value.split())


def moscow_batch_date(instant=None):
    """Use the owner's Moscow calendar day; evidence timestamps stay UTC."""
    current = instant if instant is not None else datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise ValueError("Batch date requires a timezone-aware instant")
    return current.astimezone(timezone(timedelta(hours=3))).date()


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style"} and self.hidden:
            self.hidden -= 1

    def handle_data(self, value):
        if not self.hidden:
            self.parts.append(value)


def official_url(url, hosts):
    parsed = urlparse(url)
    if parsed.scheme not in {"https", "http"} or parsed.username or parsed.password:
        raise ValueError("Expected an official HTTP(S) URL: " + url)
    host = (parsed.hostname or "").lower()
    if not any(host == domain or host.endswith("." + domain) for domain in hosts):
        raise ValueError("URL is outside reviewed official hosts: " + url)
    return url


def utc_timestamp(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset().total_seconds() != 0:
        raise ValueError("checkedAt must explicitly be UTC")
    return parsed.isoformat().replace("+00:00", "Z")


def load_source(slug, source, hosts, review_dir):
    url = official_url(source["url"], hosts)
    year = source.get("sourceYear")
    if year is not None and (type(year) is not int or not 1900 <= year <= 2100):
        raise ValueError("sourceYear must be a published year or null")
    checked_at = utc_timestamp(source["checkedAt"])
    if "extractText" in source and "textPath" in source:
        raise ValueError("Choose extractText or textPath, never both")
    extracted = source.get("extractText")
    if "textPath" in source:
        text_path = Path(source["textPath"])
        if not text_path.is_absolute():
            text_path = review_dir / text_path
        extracted = text_path.read_text(encoding="utf-8-sig")
    result = {
        "universitySlug": slug,
        "id": slug + ":" + source["id"],
        "url": url,
        "checkedAt": checked_at,
        "sourceYear": year,
    }
    if extracted is not None and "bodyPath" not in source:
        visible = extracted
        raw = visible.encode("utf-8")
        result.update(sourceSha256Basis="extract-only", extractText=visible)
    else:
        if "bodyPath" in source:
            body_path = Path(source["bodyPath"])
            if not body_path.is_absolute():
                body_path = review_dir / body_path
            raw = body_path.read_bytes()
            encoding = source.get("encoding", "utf-8")
        else:
            request = Request(url, headers={"User-Agent": "Postupai official-source catalog review"})
            with urlopen(request, timeout=25) as response:
                result["url"] = official_url(response.geturl(), hosts)
                raw = response.read()
                encoding = response.headers.get_content_charset() or "utf-8"
        if extracted is not None:
            visible = extracted
            result.update(
                verificationTextBasis="reviewed-extraction", extractText=extracted,
                extractTextSha256=hashlib.sha256(extracted.encode("utf-8")).hexdigest(),
            )
        else:
            parser = VisibleText()
            parser.feed(raw.decode(encoding))
            visible = " ".join(parser.parts)
        result.update(sourceSha256Basis="response-bytes", bytes=len(raw))
    if not clean(visible):
        raise ValueError("Empty source content: " + url)
    result["sourceSha256"] = hashlib.sha256(raw).hexdigest()
    return result, clean(visible)


def build_profile(slug, review, review_dir):
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise ValueError("Invalid university slug")
    hosts = set(review["officialHosts"])
    if not hosts or any(not re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", host) for host in hosts):
        raise ValueError("Explicit officialHosts are required")
    sources = {}
    for source in review["sources"]:
        if not source.get("id") or source["id"] in sources:
            raise ValueError("Source ids must be unique and nonempty")
        sources[source["id"]] = load_source(slug, source, hosts, review_dir)
    if not sources:
        raise ValueError("At least one reviewed official source is required")

    def fact(row, literals, allow_summary=False):
        meta, visible = sources[row["source"]]
        quote = row.get("evidence")
        needles = [] if allow_summary and quote is not None else literals
        if quote is not None:
            needles = needles + [quote]
        for needle in needles:
            if not isinstance(needle, str) or not clean(needle):
                raise ValueError("Nonempty literal evidence is required")
            if clean(needle) not in visible and needle != meta["url"]:
                raise ValueError("Reviewed evidence is absent from source: " + needle)
        return {
            "sourceUrl": meta["url"], "sourceYear": meta["sourceYear"],
            "checkedAt": meta["checkedAt"], "sourceSha256": meta["sourceSha256"],
        }

    profile = {"universitySlug": slug, "fields": {}, "faculties": [], "offerings": []}
    reviewed = review["profile"]
    for key, row in reviewed.get("fields", {}).items():
        if key not in FIELDS or not isinstance(row.get("value"), str) or not row["value"].strip():
            raise ValueError("Unsupported or empty directory field: " + key)
        evidence = fact(row, [row["value"]], allow_summary=key == "overview")
        if evidence["sourceYear"] is None:
            raise ValueError("Directory field has unknown sourceYear; retain it in evidence and issues: " + key)
        profile["fields"][key] = {"value": row["value"], **evidence}
    for row in reviewed.get("faculties", []):
        section = row["sourceSection"]
        if not section.strip():
            raise ValueError("Faculty sourceSection is required")
        if row.get("url"):
            official_url(row["url"], hosts)
        evidence = fact(row, [row["name"]])
        if evidence["sourceYear"] is None:
            raise ValueError("Faculty has unknown sourceYear; retain it in evidence and issues: " + row["name"])
        profile["faculties"].append({
            "name": row["name"], "url": row.get("url"), "sourceSection": section,
            **evidence,
        })
    for row in reviewed.get("offerings", []):
        if any(not isinstance(row.get(key), str) or not row[key].strip() for key in ("code", "title", "level", "sourceSection")):
            raise ValueError("Published code, title, level and sourceSection are required")
        if row["code"].casefold() != "не применимо" and not re.fullmatch(r"\d{1,2}\.\d{1,2}\.\d{1,2}", row["code"]):
            raise ValueError("Expected a literal published education/specialty code")
        value = {key: row.get(key) for key in ("code", "title", "profile", "level", "forms", "duration")}
        value.update(admissionsStatus="pending_review", sourceSection=row["sourceSection"])
        literals = [row[key] for key in ("code", "title", "level", "profile", "forms", "duration") if row.get(key) is not None]
        value.update(fact(row, literals))
        identity = json.dumps({key: item for key, item in value.items() if key not in {
            "checkedAt", "sourceSha256",
        }}, ensure_ascii=False, sort_keys=True)
        value["id"] = slug + "-official-" + hashlib.sha256(identity.encode()).hexdigest()[:16]
        if value not in profile["offerings"]:
            profile["offerings"].append(value)
    return profile, [meta for meta, _ in sources.values()]


def merge_daily(existing, slug, review, profile, sources):
    """Replace this university's reviewed daily batch; preserve all other batches."""
    result = deepcopy(existing) if existing else {
        "sourceYear": None, "profiles": [], "sources": [], "issues": [], "scopes": {},
    }
    result.setdefault("scopes", {})[slug] = review["scope"]
    result["scope"] = " | ".join(result["scopes"].values())
    result["profiles"] = [p for p in result["profiles"] if p["universitySlug"] != slug] + [profile]
    result["sources"] = [s for s in result["sources"] if s["universitySlug"] != slug] + sources
    result["issues"] = [i for i in result["issues"] if i["universitySlug"] != slug] + [
        {**issue, "universitySlug": slug} for issue in review.get("issues", [])
    ]
    result["checkedAt"] = max(source["checkedAt"] for source in result["sources"])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("slug")
    parser.add_argument("--review", type=Path, required=True)
    parser.add_argument("--date", type=date.fromisoformat, default=moscow_batch_date())
    parser.add_argument("--output", type=Path, help="Defaults to data-sources/russia/fill-<date>.json")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    review = json.loads(args.review.read_text(encoding="utf-8-sig"))
    profile, sources = build_profile(args.slug, review, args.review.resolve().parent)
    output = args.output or ROOT / f"data-sources/russia/fill-{args.date.isoformat()}.json"
    existing = json.loads(output.read_text(encoding="utf-8")) if output.exists() else None
    result = merge_daily(existing, args.slug, review, profile, sources)
    if not args.dry_run:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "universitySlug": args.slug, "fields": len(profile["fields"]),
        "faculties": len(profile["faculties"]), "offerings": len(profile["offerings"]),
        "sources": len(sources), "dryRun": args.dry_run,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()

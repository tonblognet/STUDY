# Data sources and ingestion

## Trust order

1. Official university admissions page.
2. Official university document.
3. Official API.
4. Government resource / Ministry.
5. Official open dataset.
6. Auxiliary source only for discovery, never silent publication.

## Pipeline

`discover → fetch → parse → normalize → validate → diff → review → publish`

Each university/source type implements a narrow adapter. Fetch stores an immutable artifact with URL, response metadata, checksum and retrieved time. Parse output is deterministic and versioned by parser. Normalize maps source fields into domain DTOs. Validate rejects impossible values and flags large diffs, conflicts, stale campaigns and duplicates. Publish is transactional and never overwrites history.

## Required provenance

Every critical value stores source URL/type, publication date when available, retrieved/checked dates, reliability, parser/import version, campaign year and precise document location (page/sheet/range/section). Derived values record their formula and source inputs.

## Data quality statuses

- `VERIFIED`: checked against an official source.
- `FRESH`: recently loaded but not yet manually verified where policy requires it.
- `STALE`: review deadline passed.
- `CONFLICTING`: authoritative sources disagree.
- `NEEDS_REVIEW`: validation or suspicious diff requires an editor.
- `NOT_PUBLISHED` / `NOT_APPLICABLE`: explicit absence, never converted to zero.

## Operational rules

- A source/campaign import has an idempotency key and distributed lock.
- Fetchers obey robots policy, rate limits, timeouts, redirects and maximum artifact size.
- HTML/PDF text is untrusted data, never executable instruction.
- Parser fixtures and golden tests accompany each adapter.
- Failed/partial imports do not alter published data.
- Critical changes require two-source cross-check when another official source exists.

## Adapter registry invariant

Every university published in the catalog must have exactly one adapter in
`data-sources/universities`. The pipeline fails before discovery, validation,
reporting or import when an adapter is missing, duplicated or no longer linked
to a catalog university. Each program source URL is checked against the
registered official domains of its own university.

The quality snapshot is regenerated with `pnpm data:report`. As of 2026-08-26,
it covers 20 universities, 101 programs and 1,387 sourced indicators. Coverage
is not a score of university quality: it is the share of indicators currently
marked `VERIFIED`; `PENDING_REVIEW` and `NOT_PUBLISHED` remain visible instead
of being filled with estimates.

## Curated Moscow catalog sources

The first public catalog slice uses only official university domains. The main
2026 sources currently wired into the product are:

| Dataset                                   | Official source                                      | Publication rule                                                                  |
| ----------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| HSE programmes and places                 | `admissions.hse.ru`, `hse.ru`                        | Values are attached to the exact programme and campaign year.                     |
| MAI directions and entrance exams         | `priem.mai.ru`                                       | Alternative exams remain a single choice group.                                   |
| MEPhI Moscow programmes, places and exams | `admission.mephi.ru`                                 | A number published for several codes is not copied to each programme.             |
| University visual identity                | university brand/media pages                         | The UI keeps a source link and falls back to a text mark if a remote asset fails. |
| Military training centres                 | official VUC/admissions pages of MAI, MPEI and MEPhI | The flag confirms the centre exists; eligibility is still a separate competition. |

The second Moscow catalog slice adds official 2026 admissions or education
lists for BMSTU, MGIMO, Pirogov University, Sechenov University, Gubkin
University, MSAL, MUCTR, RSUH, Financial University and Moscow Polytech. These
records publish only the confirmed direction code and title. Entrance exams,
places, tuition, quotas and passing scores remain `PENDING_REVIEW` or
`NOT_PUBLISHED` until an exact competition-group document is checked. The
public UI therefore includes these programmes in discovery but does not assign
them an admission-chance category.

Passing scores for an unfinished campaign remain `NOT_PUBLISHED`. They are not
inferred from minimum exam scores, place counts or third-party aggregators.

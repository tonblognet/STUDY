---
name: postupai-data-integrity
description: Add, import, review, or change Postupai university, program, admissions, exam, score, price, accreditation, dormitory, military-center, deadline, or logo data with official-source provenance. Use whenever catalog facts, adapters, seed data, ingestion, matching inputs, or data-quality statuses change.
---

# Protect admissions data integrity

1. Identify every fact being added or changed and its sensitivity for an applicant's decision.
2. Prefer the official university admissions page, official university document, ministry registry, or other primary government source. Do not treat aggregators or search snippets as final evidence.
3. Record the exact source URL, source type, academic year, and review date where the data model supports them.
4. Distinguish `verified`, `stale`, `pending review`, and `unknown`. Never convert absence of evidence into `false`, `0`, or a guessed value.
5. Keep year-specific values separate. Do not present a historical passing score as a current guarantee or admission threshold.
6. Validate subject combinations, alternative exams, study mode, funding type, campus, and program identity before deduplication.
7. For logos, use an official asset or a traceable local copy. Preserve aspect ratio and provide a fallback when it cannot load.
8. Run adapter, matching, completeness, and data tests affected by the change, then run the full delivery gates.
9. State remaining uncertainty in the UI and handoff.

Reject any request to fabricate catalog volume or silently fill missing admissions facts. More entries are valuable only when their provenance and quality state are honest.

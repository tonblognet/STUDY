# Roadmap

## Stage 1 — foundation и московский каталог

- [x] Модульный монолит, PostgreSQL schema, migrations, CI, Docker и документация.
- [x] Provenance-aware catalog model, versioned metrics, adapter pipeline и quality statuses.
- [x] Public landing, university/program catalog, details, filters, comparison, favorites и responsive UI.
- [x] Identity/RBAC contracts, password auth routes, session security, verification/reset/2FA model.
- [x] Applicant profile и admission tracker foundation.
- [x] Database-driven products, entitlements, T‑Bank adapter, signed/idempotent webhook contour.
- [x] Support tickets, notification preferences, audit and admin foundations.
- [x] SEO, analytics configuration, health endpoint, monitoring/backup/deployment runbooks.
- [ ] Полное наполнение всех московских вузов: продолжается адаптер за адаптером; непроверенные данные не публикуются.
- [ ] Production credentials: PostgreSQL, SMTP, T‑Bank, monitoring and analytics are external launch blockers.

## Stage 2 — AI Level 1

Permission-scoped recommendation tools, grounded explanations, usage metering and per-request billing. No direct model access to database.

## Stage 3 — AI Level 2

Admission copilot with tracker/profile permissions, deadlines and scenario analysis. Deterministic probability engine remains separate from LLM explanations.

## Stage 4 — AI Level 3

Official integrations for application submission, explicit confirmation, legal review and immutable action receipts. No CAPTCHA/authentication bypass.

## Expansion

Region/city rollout, national university coverage, specialized search, automated competition-list imports, higher-frequency notifications and independently scaled workers.

# Deployment and operations

## Environments

- Development: Docker Compose PostgreSQL/Redis/Mailpit, mock payment/email/AI providers.
- Staging: production-like managed PostgreSQL, sandbox T‑Bank and non-production email domain.
- Production: GitHub Actions → Vercel web app + managed PostgreSQL; separate worker process may run on a managed container/VPS.

The application uses standard Next.js and PostgreSQL interfaces. Vercel-specific APIs are kept out of domain/application modules, so the Docker image can move to a VPS or another cloud.

## Release

1. CI installs with frozen lockfile, lints, typechecks, tests and builds.
2. Apply migrations with a dedicated deployment identity before shifting traffic.
3. Deploy immutable application artifact.
4. Verify `/api/health`, auth, catalog and provider sandbox checks.
5. Monitor error/payment/import rates; roll back application if SLO burns.

## Configuration

Secrets live in environment secret storage. Production fails closed when required auth/database/provider settings are missing. Payment activation additionally requires `PAYMENTS_LIVE=true` and fiscalization readiness.

## Backups

- PostgreSQL PITR/WAL continuously; daily full backup, 35-day retention.
- Weekly encrypted snapshot retained 12 weeks; monthly snapshot retained 12 months.
- Quarterly restore drill into an isolated project; record RPO/RTO evidence.
- Source artifacts kept in versioned object storage with lifecycle policy.
- Infrastructure/configuration reconstructed from Git plus secret-manager inventory.

Target: catalog RPO 24h, user/payment RPO 5m, service RTO 4h. A restore is complete only after integrity checks, migrations and application smoke tests pass.

## Monitoring

Alert on uptime, HTTP 5xx, latency, auth anomaly, payment/webhook failure, email failure, queue age, failed/stuck import, DB saturation and backup/restore status. Logs, traces, operational metrics and product analytics remain separate.

## Catalog publication

Set `CATALOG_STORAGE=database`, apply migrations, import a candidate with an
existing editor identity, and approve it at `/admin/catalog` before routing
public traffic to a fresh database. The initial import does not automatically
publish. Database failures never fall back to repository evidence. See
[CATALOG_PUBLICATION.md](docs/CATALOG_PUBLICATION.md) for migration, export,
review and rollback procedures. The previous catalog importer is replaced by
the review workflow; do not deploy old writers against the new publication model.

CI provides PostgreSQL 16 and a dedicated `TEST_DATABASE_URL`; integration tests
apply all migrations in a random schema, exercise transactions and production
HTTP routes, then remove only that schema.

# Deployment and operations

## Environments

- Development: Docker Compose PostgreSQL/Redis/Mailpit, mock payment/email/AI providers.
- Staging: production-like managed PostgreSQL, sandbox T‑Bank and non-production email domain.
- Production preparation uses Docker web, migration and worker artifacts with managed PostgreSQL. The proposed Linux VPS setup uses Caddy for HTTPS and a closed staging profile. The owner selects the provider, region and domain. [Self-hosting guide](docs/SELF_HOSTING.md).

The application uses standard Next.js and PostgreSQL interfaces. Vercel-specific APIs are kept out of domain/application modules, so the Docker image can move to a VPS or another cloud.

## Release

1. CI installs with frozen lockfile, lints, typechecks, tests and builds.
2. Apply migrations with a dedicated deployment identity before shifting traffic.
3. Deploy immutable application artifact.
4. Verify `/api/health`, auth, catalog and provider sandbox checks.
5. Monitor error/payment/import rates; roll back application if SLO burns.

## Configuration

Secrets live in environment secret storage. Production fails closed when required auth/database/provider settings are missing. Payment activation additionally requires `PAYMENTS_LIVE=true` and fiscalization readiness.

`DEPLOYMENT_MODE=staging|production` is an explicit deployment setting, separate
from Next's `NODE_ENV=production` build mode. Set `CATALOG_STORAGE=database`,
`APP_URL`, `AUTH_SECRET`, `DATABASE_URL`, `SMTP_URL` and `EMAIL_FROM`. Production
requires HTTPS and `TRUST_PROXY=true` only behind a proxy that replaces incoming
forwarding headers. Origin validation uses configured APP_URL behind the HTTP
proxy hop. Use strict PostgreSQL TLS via `sslmode=require&sslaccept=strict` in
production. The database service may require its own CA file.
SMTP URLs accept protocol/credentials/host/port, without query options or paths;
production transport requires TLS with certificate verification and bounded waits.

## Probes and diagnostic events

- `/api/live`: process liveness only, independent of PostgreSQL. Use this to
  decide whether to restart a process; a DB outage must not cause a restart loop.
- `/api/health`: existing DB connectivity probe, retained for internal tooling.
- `/api/ready`: configuration, applied migrations (including the current required
  migration) and a PUBLISHED catalog head. Returns only ready/not_ready, HTTP
  200/503, without configuration values or exception text. Snapshot preview is
  deliberately not ready. This metadata check does not validate external SMTP,
  public DNS/TLS, every catalog fact or the full set of release gates.

The Next instrumentation hook emits `SERVER_REQUEST_FAILURE` events with only
time, route family, operation and a bounded error class. It does not serialize
request headers, query strings, message, stack or arbitrary thrown objects.
Prisma's automatic query-error logging is disabled. Framework/proxy/collector
logs still need a separate review on the real staging environment; external
error tracking, alert routing and retention are not configured by this hook.

## Container artifacts under verification

Dockerfile targets `runner` (default), `migrate` and `worker` are built for Linux with
Prisma generated inside the build OS. The runner contains standalone Next,
public/static assets and runs as nonroot. The migration target includes the CLI,
schema and migration history; provide a separate deployment DATABASE_URL at
invocation time. Never give migration credentials to the web process or bake
production env/keys into either build. Build-context exclusions cover temporary
files, personal tool state, env files, dependencies, logs and output.

The CI container job applies migrations in an isolated PostgreSQL test DB,
starts the standalone web image, checks Linux Prisma connectivity, SSR/static
assets and nonready snapshot behavior. It also tests exclusion sentinels and
the nonroot runtime. The Linux CI job verifies the container artifacts. Compose,
initial staff bootstrap, rollout and rollback commands are documented in the
[self-hosting guide](docs/SELF_HOSTING.md). The worker uses a separate DB identity
and records a heartbeat. [Deadline operations](docs/DEADLINE_OPERATIONS.md).

## Backups

- PostgreSQL PITR/WAL continuously; daily full backup, 35-day retention.
- Weekly encrypted snapshot retained 12 weeks; monthly snapshot retained 12 months.
- Quarterly restore drill into an isolated project; record RPO/RTO evidence.
- Source artifacts kept in versioned object storage with lifecycle policy.
- Infrastructure/configuration reconstructed from Git plus secret-manager inventory.

Target: catalog RPO 24h, user/payment RPO 5m, service RTO 4h. A restore is complete only after integrity checks, migrations and application smoke tests pass.

The automated archive drill and staging acceptance procedure are documented in
[Backup and restore](docs/BACKUP_RESTORE.md).

## Monitoring

Alert on uptime, HTTP 5xx, latency, auth anomaly, payment/webhook failure, email failure, queue age, failed/stuck import, DB saturation and backup/restore status. Logs, traces, operational metrics and product analytics remain separate.

Use the bounded anonymous smoke, aggregate queries and alert receipt exercise in
[Operations acceptance](docs/OPERATIONS_ACCEPTANCE.md). The owner approves the
thresholds and alert recipient after measuring staging traffic.

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

-- Run only against the disposable PostgreSQL service of the container CI job.
DO $$
BEGIN
  IF current_database() <> 'postupai_container_test' OR session_user <> 'postupai_test' THEN
    RAISE EXCEPTION 'Container role fixture requires its dedicated test database';
  END IF;
END;
$$;

\if :{?prepare_roles}
CREATE ROLE ci_role_migrate LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
  PASSWORD 'role-fixture-migrate-only';
CREATE ROLE ci_role_web LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
  PASSWORD 'role-fixture-web-only';
CREATE ROLE ci_role_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
  PASSWORD 'role-fixture-worker-only';
CREATE ROLE ci_role_operator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
  PASSWORD 'role-fixture-operator-only';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE, TEMPORARY ON DATABASE postupai_container_test FROM PUBLIC;
CREATE SCHEMA postupai_roles AUTHORIZATION ci_role_migrate;
GRANT USAGE ON SCHEMA postupai_roles TO ci_role_web, ci_role_worker, ci_role_operator;
\elif :{?grant_runtime}
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA postupai_roles TO ci_role_web;
REVOKE INSERT, UPDATE, DELETE ON postupai_roles._prisma_migrations FROM ci_role_web;
REVOKE ALL ON postupai_roles."DeadlineEmailJob", postupai_roles."WorkerHeartbeat" FROM ci_role_web;

GRANT SELECT ON postupai_roles."CatalogHead", postupai_roles."CatalogRevision",
  postupai_roles."AccountTrackerItem", postupai_roles."NotificationPreference" TO ci_role_worker;
-- Row locking requires UPDATE on a column. Leave credentials and roles inaccessible.
GRANT SELECT (id, email, "emailVerified"), UPDATE ("updatedAt")
  ON postupai_roles."User" TO ci_role_worker;
GRANT SELECT (id, "userId") ON postupai_roles."Notification" TO ci_role_worker;
GRANT INSERT ON postupai_roles."Notification" TO ci_role_worker;
GRANT SELECT, INSERT, UPDATE ON postupai_roles."DeadlineEmailJob", postupai_roles."WorkerHeartbeat"
  TO ci_role_worker;

GRANT SELECT ON postupai_roles."User", postupai_roles."Session", postupai_roles."AuthChallenge",
  postupai_roles."CatalogHead", postupai_roles."CatalogRevision" TO ci_role_operator;
GRANT UPDATE (role, "authVersion", "updatedAt") ON postupai_roles."User" TO ci_role_operator;
GRANT UPDATE ("revokedAt") ON postupai_roles."Session" TO ci_role_operator;
GRANT UPDATE ("usedAt") ON postupai_roles."AuthChallenge" TO ci_role_operator;
GRANT SELECT, INSERT ON postupai_roles."AuditLog" TO ci_role_operator;
GRANT INSERT ON postupai_roles."CatalogRevision" TO ci_role_operator;
-- Catalog staging locks the singleton row. The operator cannot change its revisionId.
GRANT UPDATE (id) ON postupai_roles."CatalogHead" TO ci_role_operator;
\else
DO $$ BEGIN RAISE EXCEPTION 'Choose prepare_roles or grant_runtime'; END; $$;
\endif

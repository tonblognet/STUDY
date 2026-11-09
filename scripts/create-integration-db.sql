\set ON_ERROR_STOP on
\if :{?test_db}
\else
  \set test_db postupai_test
\endif

SELECT :'test_db' ~ '^[a-z][a-z0-9_]{0,57}_test$' AS valid_test_name,
       EXISTS (SELECT FROM pg_database WHERE datname = :'test_db') AS test_db_exists
\gset

\if :valid_test_name
\else
  DO $$ BEGIN RAISE EXCEPTION 'Choose a dedicated lowercase database name ending in _test'; END; $$;
\endif

\if :test_db_exists
  \echo Existing database will only be checked: :test_db
\else
  CREATE DATABASE :"test_db"
    WITH TEMPLATE template0 ENCODING 'UTF8' LOCALE 'C'
         LOCALE_PROVIDER icu ICU_LOCALE 'ru-RU';
  ALTER DATABASE :"test_db" SET timezone TO 'UTC';
\endif

\connect :test_db
DO $$
BEGIN
  IF current_setting('server_encoding') <> 'UTF8'
     OR current_setting('TimeZone') NOT IN ('UTC', 'Etc/UTC') THEN
    RAISE EXCEPTION 'Integration DB requires UTF8 and UTC; got encoding %, timezone %. Use a different _test database.',
      current_setting('server_encoding'), current_setting('TimeZone');
  END IF;
END;
$$;
SHOW server_encoding;
SHOW timezone;

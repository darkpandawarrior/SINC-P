-- Row-level security: the second, independent line of tenant isolation.
--
-- Application code already scopes every query by institution_id. This file exists for
-- the day someone forgets, or writes a raw query, or an ORM upgrade changes a join.
-- With these policies in place that bug returns zero rows instead of another college's
-- grievances.
--
-- Run AFTER drizzle-kit push/migrate. Idempotent.

-- ---------------------------------------------------------------------------
-- Runtime role
-- ---------------------------------------------------------------------------
-- The application must NOT connect as the database owner. A table owner bypasses RLS
-- unless FORCE is set, and superusers bypass it unconditionally. This role can read and
-- write rows and nothing else.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sincp_app') THEN
    -- Password is set by the deploy script; this is a placeholder for local dev.
    CREATE ROLE sincp_app LOGIN PASSWORD 'sincp_app_dev_only';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO sincp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sincp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sincp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sincp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO sincp_app;

-- Belt and braces: this role must never be able to bypass a policy.
ALTER ROLE sincp_app NOBYPASSRLS;

-- The narrow cross-tenant role. Used ONLY by withoutTenantScope() for the handful of
-- operations that genuinely precede knowing a tenant: the login lookup, signup, and
-- platform reporting. It gets its own connection pool so that ordinary request handling
-- physically cannot be running as this role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sincp_admin') THEN
    CREATE ROLE sincp_admin LOGIN PASSWORD 'sincp_admin_dev_only';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO sincp_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sincp_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sincp_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sincp_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO sincp_admin;

-- ---------------------------------------------------------------------------
-- Tenant context helper
-- ---------------------------------------------------------------------------
-- Reads the transaction-local setting written by withTenant(). `true` as the second
-- argument to current_setting means "return NULL if unset" rather than raising, so a
-- query issued without tenant context matches nothing instead of erroring in a way that
-- tempts someone to "fix" it by removing the policy.

CREATE OR REPLACE FUNCTION app_current_institution() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.institution_id', true), '')::uuid
$$;

-- Cross-tenant access is a function of WHICH ROLE you are, never of a setting you can
-- write. An earlier version of this file keyed the bypass off current_setting(
-- 'app.bypass_rls'), which was a hole: sincp_app could run
--   SELECT set_config('app.bypass_rls','on',true)
-- and immediately read every institution. Verified against a live database, not
-- reasoned about. Any SQL-execution primitive would have disabled tenant isolation
-- with one statement, which defeats the entire point of having RLS as a second line.
--
-- sincp_app is deliberately NOT a member of sincp_admin, so it cannot reach this
-- branch no matter what it sets.
CREATE OR REPLACE FUNCTION app_rls_bypassed() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT pg_has_role(current_user, 'sincp_admin', 'member')
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'users', 'sessions', 'categories', 'grievances', 'grievance_events',
    'attachments', 'announcements', 'handbook_entries', 'auth_events'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- FORCE makes the policy apply to the table owner too. Without it, migrations run
    -- as owner would quietly see everything, and so would anything that happened to
    -- connect with the owner's credentials.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format($f$
      CREATE POLICY %I ON %I
        USING (institution_id = app_current_institution() OR app_rls_bypassed())
        WITH CHECK (institution_id = app_current_institution() OR app_rls_bypassed())
    $f$, t || '_tenant_isolation', t);
  END LOOP;
END
$$;

-- `institutions` is the tenant table itself: a row is visible when it IS the current
-- tenant. Signup and platform administration go through withoutTenantScope().
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS institutions_tenant_isolation ON institutions;
CREATE POLICY institutions_tenant_isolation ON institutions
  USING (id = app_current_institution() OR app_rls_bypassed())
  WITH CHECK (id = app_current_institution() OR app_rls_bypassed());

-- ---------------------------------------------------------------------------
-- Append-only enforcement on the audit trail
-- ---------------------------------------------------------------------------
-- The application has no update or delete path for grievance_events. This makes that
-- structural: even a compromised application role cannot rewrite history without also
-- holding DDL rights to drop the trigger, which sincp_app does not have.

CREATE OR REPLACE FUNCTION grievance_events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'grievance_events is append-only (attempted %)', TG_OP
    USING HINT = 'Record a correcting event instead of editing history.';
END
$$;

DROP TRIGGER IF EXISTS grievance_events_no_mutation ON grievance_events;
CREATE TRIGGER grievance_events_no_mutation
  BEFORE UPDATE OR DELETE ON grievance_events
  FOR EACH ROW EXECUTE FUNCTION grievance_events_append_only();

REVOKE UPDATE, DELETE ON grievance_events FROM sincp_app;
-- History is append-only for the privileged role too. There is no application path that
-- may rewrite an audit trail, and "the admin tool did it" is exactly the excuse the
-- chain exists to rule out.
REVOKE UPDATE, DELETE ON grievance_events FROM sincp_admin;

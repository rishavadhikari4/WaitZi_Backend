-- Tenant isolation via row-level security.
--
-- The app connects as waitzi_app and every request runs inside a transaction
-- that sets app.org_id / app.user_id with set_config(..., true) (see
-- db/client.js withTenant). With no org set, tenant tables return zero rows.
-- waitzi_platform has BYPASSRLS for super-admin tools and background jobs.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'waitzi_app') THEN
    CREATE ROLE waitzi_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'waitzi_platform') THEN
    CREATE ROLE waitzi_platform NOLOGIN BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO waitzi_app, waitzi_platform;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO waitzi_app, waitzi_platform;
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON "_prisma_migrations" FROM waitzi_app, waitzi_platform;
  END IF;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO waitzi_app, waitzi_platform;

-- The audit log is append-only for the app.
REVOKE UPDATE, DELETE ON audit_logs FROM waitzi_app;

CREATE FUNCTION app_org_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;

CREATE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

-- Every table with org_id: rows are visible and writable only for the
-- current org. Keep this list in sync with the schema; the RLS coverage test
-- fails if an org_id table is missing a policy.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches', 'domains', 'roles', 'memberships', 'audit_logs',
    'categories', 'menu_items', 'dining_tables', 'orders', 'order_items', 'payments'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id())',
      t
    );
  END LOOP;
END $$;

-- Organizations: a tenant can read and update only itself; creating and
-- deleting organizations is platform-only.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY org_self_select ON organizations FOR SELECT USING (id = app_org_id());
CREATE POLICY org_self_update ON organizations FOR UPDATE
  USING (id = app_org_id()) WITH CHECK (id = app_org_id());

-- Users are global identities. A tenant sees itself plus members of the
-- current org (memberships is itself org-filtered), may create tenant users,
-- and can never create or promote platform users. Deleting users is
-- platform-only; tenants remove memberships instead.
-- ponytail: an org can still edit a user who also belongs to another org;
-- Stage 2 restricts cross-org profile edits to the user themself.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY user_select ON users FOR SELECT USING (
  id = app_user_id()
  OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id)
);
CREATE POLICY user_insert ON users FOR INSERT WITH CHECK (
  app_org_id() IS NOT NULL AND scope = 'tenant' AND platform_role IS NULL
);
CREATE POLICY user_update ON users FOR UPDATE
  USING (
    id = app_user_id()
    OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id)
  )
  WITH CHECK (scope = 'tenant' AND platform_role IS NULL);

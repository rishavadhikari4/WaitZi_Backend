-- Dev-only login roles. Production creates these with real secrets; the RLS
-- migration only creates them (NOLOGIN) when missing.
--   waitzi_app      : every tenant request; row-level security applies
--   waitzi_platform : super-admin tools and background jobs; bypasses RLS
CREATE ROLE waitzi_app LOGIN PASSWORD 'waitzi_app_dev';
CREATE ROLE waitzi_platform LOGIN BYPASSRLS PASSWORD 'waitzi_platform_dev';

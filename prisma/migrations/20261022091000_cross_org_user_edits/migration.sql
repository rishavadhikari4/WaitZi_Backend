-- Stage 2: a restaurant may edit a staff member's account only when that
-- person works nowhere else. Someone who belongs to several organizations
-- edits their own profile; each org manages only its membership row.
--
-- memberships is org-filtered by RLS, so the other-org check needs a
-- SECURITY DEFINER function that sees every membership.
CREATE FUNCTION user_in_other_org(uid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = uid AND m.org_id IS DISTINCT FROM app_org_id()) $$;

REVOKE ALL ON FUNCTION user_in_other_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_in_other_org(uuid) TO waitzi_app, waitzi_platform;

DROP POLICY user_update ON users;
CREATE POLICY user_update ON users FOR UPDATE
  USING (
    id = app_user_id()
    OR (EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id) AND NOT user_in_other_org(users.id))
  )
  WITH CHECK (scope = 'tenant' AND platform_role IS NULL);

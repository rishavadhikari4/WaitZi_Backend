-- Foreign keys are checked without row-level security, so on their own they
-- would let org A point an order at org B's table. These triggers require every
-- reference to stay inside the row's organization.
--
-- Arguments are (column, target) pairs. target is a table name (its org_id must
-- match) or 'member' (the user must have a membership in the row's org).
-- Prisma does not manage triggers, so this survives future `migrate dev` runs.

CREATE FUNCTION enforce_same_org() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  i int := 0;
  col text;
  target text;
  val uuid;
  target_org uuid;
BEGIN
  WHILE i < TG_NARGS LOOP
    col := TG_ARGV[i];
    target := TG_ARGV[i + 1];
    i := i + 2;

    EXECUTE format('SELECT ($1).%I::uuid', col) INTO val USING NEW;
    CONTINUE WHEN val IS NULL;

    IF target = 'member' THEN
      PERFORM 1 FROM memberships WHERE user_id = val AND org_id = NEW.org_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'cross-tenant reference: %.% is not a member of this organization', TG_TABLE_NAME, col
          USING ERRCODE = 'foreign_key_violation';
      END IF;
    ELSE
      EXECUTE format('SELECT org_id FROM %I WHERE id = $1', target) INTO target_org USING val;
      IF target_org IS DISTINCT FROM NEW.org_id THEN
        RAISE EXCEPTION 'cross-tenant reference: %.% points outside this organization', TG_TABLE_NAME, col
          USING ERRCODE = 'foreign_key_violation';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER same_org_refs BEFORE INSERT OR UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION enforce_same_org('role_id', 'roles');

CREATE TRIGGER same_org_refs BEFORE INSERT OR UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION enforce_same_org('category_id', 'categories');

CREATE TRIGGER same_org_refs BEFORE INSERT OR UPDATE ON dining_tables
  FOR EACH ROW EXECUTE FUNCTION enforce_same_org(
    'branch_id', 'branches', 'current_order_id', 'orders', 'assigned_waiter_id', 'member');

CREATE TRIGGER same_org_refs BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION enforce_same_org(
    'branch_id', 'branches', 'table_id', 'dining_tables',
    'assigned_waiter_id', 'member', 'cooked_by_id', 'member', 'served_by_id', 'member');

CREATE TRIGGER same_org_refs BEFORE INSERT OR UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION enforce_same_org('order_id', 'orders', 'menu_item_id', 'menu_items');

CREATE TRIGGER same_org_refs BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION enforce_same_org(
    'branch_id', 'branches', 'order_id', 'orders', 'table_id', 'dining_tables', 'handled_by_id', 'member');

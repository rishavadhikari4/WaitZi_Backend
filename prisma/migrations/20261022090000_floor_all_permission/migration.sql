-- Stage 2: waiters only see their assigned tables unless the role holds
-- 'floor.all'. Existing manager and cashier roles keep seeing the whole floor.
UPDATE roles
SET permissions = array_append(permissions, 'floor.all')
WHERE is_system
  AND name IN ('manager', 'cashier')
  AND NOT ('floor.all' = ANY (permissions));

// src/validators/audit.schema.ts
import { z } from 'zod';

import { pageQuery } from './common.schema.js';

export const auditQuerySchema = z.object({
  ...pageQuery(50, 200),
  /** Exact action, or a prefix ending in '.' such as 'payment.'. */
  action: z.string().trim().max(60).optional(),
  actor: z.uuid().optional(),
  targetType: z.string().trim().max(40).optional(),
  targetId: z.uuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;

// src/validators/table.schema.ts
import { z } from 'zod';

import { pageQuery } from './common.schema.js';

const tableNumber = z.coerce.number().int('Table number must be a whole number').min(1).max(9999);
const capacity = z.coerce.number().int().min(1, 'Capacity must be a positive number').max(100);
const status = z.enum(['Available', 'Occupied', 'Reserved']);
/** '' or null clears the waiter. */
const waiterRef = z.union([z.uuid('Invalid waiter ID'), z.literal(''), z.null()]);

export const tableQuerySchema = z.object({
  ...pageQuery(20, 100),
  status: status.optional(),
  capacity: z.coerce.number().int().min(1).optional(),
  assignedWaiter: z.uuid().optional(),
  branch: z.uuid().optional(),
  sortBy: z.enum(['tableNumber', 'capacity', 'status', 'createdAt']).default('tableNumber'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const createTableSchema = z.object({
  tableNumber,
  capacity,
  assignedWaiter: waiterRef.optional(),
  /** Required only when the organization has more than one branch. */
  branchId: z.uuid().optional(),
});

export const updateTableSchema = z
  .object({ tableNumber, capacity, status, assignedWaiter: waiterRef })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'No valid fields provided for update' });

export const tableStatusSchema = z.object({ status });

export const qrFormatQuerySchema = z.object({ format: z.enum(['png', 'url', 'svg']).default('png') });

// ── Guests ────────────────────────────────────────────────────────────────────

export const qrTokenParamsSchema = z.object({ qrToken: z.string().regex(/^[0-9a-f]{32}$/, 'Invalid table code') });
/** New uuid ids and pre-Postgres Mongo ids (printed on old QR stickers). */
export const publicTableIdParamsSchema = z.object({
  tableId: z.string().regex(/^([0-9a-f]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, 'Invalid table ID format'),
});
export const tableNumberParamsSchema = z.object({ tableNumber: tableNumber });
export const orgSlugQuerySchema = z.object({ org: z.string().trim().regex(/^[a-z0-9-]{2,64}$/).optional() });

export type TableQuery = z.infer<typeof tableQuerySchema>;
export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;

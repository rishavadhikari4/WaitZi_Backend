// src/validators/order.schema.ts
import { z } from 'zod';

import { pageQuery, rupees } from './common.schema.js';

export const orderStatus = z.enum(['Pending', 'InKitchen', 'Served', 'Cancelled', 'Paid', 'Completed']);
export const itemStatus = z.enum(['Pending', 'Cooking', 'Ready', 'Served']);

const orderLine = z.object({
  menuItem: z.uuid('Menu item ID is required'),
  quantity: z.coerce.number().int('Quantity must be a whole number').min(1).max(50, 'At most 50 of one item'),
  notes: z.string().trim().max(200).optional(),
});

const lines = z.array(orderLine).min(1, 'Add at least one item').max(50, 'Too many items in one order');
const customerName = z.string().trim().min(1, 'Customer name is required').max(80);
const note = z.string().trim().max(500).optional();

/** Guests: the QR token identifies the table; discounts are never accepted from guests. */
export const publicCreateOrderSchema = z.object({
  qrToken: z.string().regex(/^[0-9a-f]{32}$/, 'Invalid table code'),
  customerName,
  items: lines,
  note,
});

/** Staff taking an order at the table. */
export const staffCreateOrderSchema = z.object({
  tableId: z.uuid('Invalid table ID'),
  customerName,
  items: lines,
  note,
  discount: rupees.optional(),
});

export const orderQuerySchema = z.object({
  ...pageQuery(20, 100),
  status: orderStatus.optional(),
  table: z.uuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'totalAmount', 'finalAmount', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const kitchenQuerySchema = z.object({ status: z.enum(['Pending', 'InKitchen', 'all']).default('all') });
export const tableOrdersQuerySchema = z.object({ status: orderStatus.optional() });

export const orderStatusSchema = z.object({
  status: orderStatus,
  cookedBy: z.uuid().optional(),
  servedBy: z.uuid().optional(),
});

export const itemStatusSchema = z.object({ status: itemStatus, notes: z.string().trim().max(200).optional() });
export const addItemsSchema = z.object({ items: lines });
export const cancelOrderSchema = z.object({ reason: z.string().trim().max(300).optional() });

export const orderItemParamsSchema = z.object({ orderId: z.uuid(), itemId: z.uuid() });
export const tableIdParamsSchema = z.object({ tableId: z.uuid('Invalid table ID') });
export const qrTokenParamsSchema = z.object({ qrToken: z.string().regex(/^[0-9a-f]{32}$/, 'Invalid table code') });

export type OrderLineInput = z.infer<typeof orderLine>;
export type PublicCreateOrderInput = z.infer<typeof publicCreateOrderSchema>;
export type StaffCreateOrderInput = z.infer<typeof staffCreateOrderSchema>;
export type OrderQuery = z.infer<typeof orderQuerySchema>;
export type OrderStatusInput = z.infer<typeof orderStatusSchema>;

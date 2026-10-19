// src/validators/payment.schema.ts
import { z } from 'zod';

import { pageQuery, rupees } from './common.schema.js';

export const paymentMethod = z.enum(['Cash', 'Card', 'Fonepay', 'NepalPay', 'Khalti']);
export const paymentStatus = z.enum(['Paid', 'Pending', 'Failed', 'Refunded']);

/** Staff recording a payment. Khalti goes through the gateway flow instead. */
export const processPaymentSchema = z.object({
  orderId: z.uuid('Invalid order ID'),
  paymentMethod: paymentMethod.exclude(['Khalti']),
  amount: rupees.refine((n) => n > 0, 'Amount must be a positive number'),
  transactionId: z.string().trim().max(100).optional(),
});

export const paymentQuerySchema = z.object({
  ...pageQuery(20, 100),
  paymentStatus: paymentStatus.optional(),
  paymentMethod: paymentMethod.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  sortBy: z.enum(['paymentTime', 'amount', 'createdAt', 'updatedAt']).default('paymentTime'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/** Confirming or failing a pending (non-gateway) payment. Refunds have their own endpoint. */
export const paymentStatusSchema = z.object({
  paymentStatus: z.enum(['Paid', 'Failed']),
  transactionId: z.string().trim().max(100).optional(),
});

export const refundSchema = z.object({
  refundAmount: rupees.refine((n) => n > 0, 'Invalid refund amount').optional(),
  reason: z.string().trim().max(300).optional(),
});

export const dailyReportQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
});

export const orderIdParamsSchema = z.object({ orderId: z.uuid('Invalid order ID') });

// ── Guests ────────────────────────────────────────────────────────────────────

export const khaltiInitiateSchema = z.object({
  qrToken: z.string().regex(/^[0-9a-f]{32}$/, 'Invalid table code'),
  orderId: z.uuid('Invalid order ID'),
});

export const khaltiCallbackQuerySchema = z.object({ pidx: z.string().min(1).max(100).optional() });

export type ProcessPaymentInput = z.infer<typeof processPaymentSchema>;
export type PaymentQuery = z.infer<typeof paymentQuerySchema>;
export type PaymentStatusInput = z.infer<typeof paymentStatusSchema>;
export type RefundInput = z.infer<typeof refundSchema>;

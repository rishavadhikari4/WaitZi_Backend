// src/validators/approval.schema.ts
import { z } from 'zod';

/** Permissions a manager can lend for one action by entering their PIN. */
export const APPROVABLE = ['refund.approve', 'discount.approve', 'void.approve'] as const;
export type ApprovablePermission = (typeof APPROVABLE)[number];

const pin = z.string().regex(/^\d{4,6}$/, 'PIN must be 4 to 6 digits');

export const requestApprovalSchema = z.object({
  approverEmail: z.email('Enter the approving manager\'s email').trim().toLowerCase(),
  pin,
  permission: z.enum(APPROVABLE),
  /** The payment or order being approved; the token only works for it. */
  targetId: z.uuid().optional(),
});

export const setPinSchema = z.object({
  pin,
  currentPassword: z.string().min(1, 'Current password is required'),
});

export type RequestApprovalInput = z.infer<typeof requestApprovalSchema>;
export type SetPinInput = z.infer<typeof setPinSchema>;

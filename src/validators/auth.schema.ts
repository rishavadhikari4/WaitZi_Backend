// src/validators/auth.schema.ts
import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email');
const newPassword = z.string().min(8, 'Password must be at least 8 characters').max(128);

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
  /** Pick an organization when the account belongs to more than one. */
  organizationId: z.uuid().optional(),
});

export const refreshSchema = z.object({ refreshToken: z.string().optional() });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    token: z.string().length(64, 'Invalid reset token'),
    newPassword,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

export const resetTokenParamsSchema = z.object({ token: z.string().length(64, 'Invalid reset token') });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { message: 'New passwords do not match', path: ['confirmPassword'] })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

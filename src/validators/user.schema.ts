// src/validators/user.schema.ts
import { z } from 'zod';

export const nepaliPhone = z
  .string()
  .trim()
  .regex(/^(\+977)?9[78]\d{8}$/, 'Valid Nepali phone number is required (e.g. 98XXXXXXXX or +97798XXXXXXXX)');

const personName = (label: string) =>
  z
    .string()
    .trim()
    .min(2, `${label} must be between 2-50 characters`)
    .max(50, `${label} must be between 2-50 characters`)
    .regex(/^[\p{L}\s.'-]+$/u, `${label} can only contain letters and spaces`);

export const strongPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain an uppercase letter, a lowercase letter and a number');

const address = z.string().trim().min(5, 'Address must be between 5-200 characters').max(200);
const status = z.enum(['Active', 'Inactive']);
/** Role by id, or by name for the old createUser contract ("waiter"). */
const roleRef = z.string().trim().min(1, 'Role is required');

export const memberIdParamsSchema = z.object({ id: z.uuid('Please provide a valid user ID') });
export const roleIdParamsSchema = z.object({ roleId: z.uuid('Please provide a valid role ID') });

export const memberQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.uuid().optional(),
  status: status.optional(),
  search: z.string().trim().max(100).optional(),
  sortBy: z.enum(['firstName', 'lastName', 'email', 'createdAt', 'updatedAt', 'status']).default('firstName'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const membersByRoleQuerySchema = z.object({
  status: z.enum(['Active', 'Inactive', 'all']).default('Active'),
});

export const createMemberSchema = z
  .object({
    firstName: personName('First name'),
    lastName: personName('Last name'),
    email: z.string().trim().toLowerCase().email('Valid email is required'),
    number: nepaliPhone,
    address,
    password: strongPassword,
    confirmPassword: z.string().optional(),
    role: roleRef,
    branchIds: z.array(z.uuid()).optional(),
  })
  .refine((v) => v.confirmPassword === undefined || v.confirmPassword === v.password, {
    message: 'Password confirmation does not match password',
    path: ['confirmPassword'],
  });

// Multipart forms (image upload) send every field as a string.
export const updateMemberSchema = z.object({
  firstName: personName('First name').optional(),
  lastName: personName('Last name').optional(),
  email: z.string().trim().toLowerCase().email('Please provide a valid email address').optional(),
  number: nepaliPhone.optional(),
  address: address.optional(),
  role: z.uuid('Please provide a valid role ID').optional(),
  status: status.optional(),
});

export const updateProfileSchema = updateMemberSchema.pick({ firstName: true, lastName: true, address: true, number: true });

export const memberStatusSchema = z.object({ status });

export const selfPasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: strongPassword,
});

export type MemberQuery = z.infer<typeof memberQuerySchema>;
export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

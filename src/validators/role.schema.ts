// src/validators/role.schema.ts
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions.js';

const permission = z.enum(Object.keys(PERMISSIONS) as [keyof typeof PERMISSIONS, ...(keyof typeof PERMISSIONS)[]]);

const name = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Role name must be between 2-50 characters')
  .max(50)
  .regex(/^[a-z_-]+$/, 'Role name can only contain letters, underscores and hyphens');

export const roleIdParamsSchema = z.object({ id: z.uuid('Please provide a valid role ID') });

export const createRoleSchema = z.object({
  name,
  description: z.string().trim().max(200).optional(),
  permissions: z.array(permission).default([]),
});

export const updateRoleSchema = z
  .object({
    name: name.optional(),
    description: z.string().trim().max(200).optional(),
    permissions: z.array(permission).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'No valid fields provided for update' });

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

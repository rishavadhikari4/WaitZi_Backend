// src/validators/menu.schema.ts
// Categories and menu items. Both forms are multipart (image upload).
import { z } from 'zod';

import { formBoolean, pageQuery, rupees } from './common.schema.js';

const name = z.string().trim().min(2, 'Name must be between 2-100 characters').max(100);
const description = z.string().trim().max(500, 'Description must be at most 500 characters');

// ── Categories ────────────────────────────────────────────────────────────────

export const categoryQuerySchema = z.object({
  ...pageQuery(10, 50),
  isActive: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(100).optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'isActive']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const createCategorySchema = z.object({ name, description: description.min(1, 'Description is required') });

export const updateCategorySchema = z.object({
  name: name.optional(),
  description: description.optional(),
  isActive: formBoolean.optional(),
});

// ── Menu items ────────────────────────────────────────────────────────────────

/** The API keeps the old wire value 'Out of Stock'. */
export const availability = z.enum(['Available', 'Out of Stock']);

export const menuQuerySchema = z.object({
  ...pageQuery(12, 50),
  category: z.uuid().optional(),
  availabilityStatus: availability.optional(),
  search: z.string().trim().max(100).optional(),
  minPrice: rupees.optional(),
  maxPrice: rupees.optional(),
  sortBy: z.enum(['name', 'price', 'createdAt', 'updatedAt', 'availabilityStatus']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const categoryIdParamsSchema = z.object({ categoryId: z.uuid('Please provide a valid category ID') });

export const createMenuItemSchema = z.object({
  name,
  category: z.uuid('Invalid category ID'),
  price: rupees,
  description: description.optional(),
  availabilityStatus: availability.default('Available'),
});

export const updateMenuItemSchema = createMenuItemSchema.partial().extend({
  availabilityStatus: availability.optional(),
});

export const availabilitySchema = z.object({ availabilityStatus: availability });

export type CategoryQuery = z.infer<typeof categoryQuerySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type MenuQuery = z.infer<typeof menuQuerySchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type Availability = z.infer<typeof availability>;

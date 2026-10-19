// src/validators/common.schema.ts
import { z } from 'zod';

export const idParamsSchema = z.object({ id: z.uuid('Please provide a valid ID') });

/** Multipart forms send booleans as "true"/"false". */
export const formBoolean = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean());

/** Rupees, as a number or a form string; two decimal places at most. */
export const rupees = z.coerce
  .number({ message: 'Price must be a valid positive number' })
  .min(0, 'Price must be a valid positive number')
  .max(1_000_000, 'Price is too large')
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, {
    message: 'Price can have at most two decimal places',
  });

export const pageQuery = (defaultLimit: number, maxLimit: number) => ({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
});

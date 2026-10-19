// src/utils/legacyIds.ts
// The frontend was written against MongoDB and reads `._id` in ~150 places.
// Until it moves to `id`, every API response gets an `_id` alias next to each
// `id`. Dates, Buffers and other non-plain objects pass through untouched.

export function withMongoIds<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withMongoIds) as T;
  if (!value || typeof value !== 'object' || (value as object).constructor !== Object) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = withMongoIds(v);
  if ('id' in out && !('_id' in out)) out['_id'] = out['id'];
  return out as T;
}

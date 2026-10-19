// src/utils/Helpers.ts
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export const hashPassword = (password: string) => bcrypt.hash(password, SALT_ROUNDS);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

// Rs <-> paisa. The API speaks rupees (as before); the database stores paisa.
export const toPaisa = (rupees: number | string) => Math.round(Number(rupees) * 100);
export const toRupees = (paisa: number) => paisa / 100;

export interface PageQuery {
  page: number;
  limit: number;
}

export function paginationMeta(page: number, limit: number, totalItems: number) {
  const totalPages = Math.ceil(totalItems / limit);
  return {
    currentPage: page,
    totalPages,
    totalItems,
    itemsPerPage: limit,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    nextPage: page < totalPages ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null,
  };
}

/**
 * Run async steps one after another and return their results as a tuple.
 * Use this instead of Promise.all inside a transaction: a transaction is a
 * single connection, so parallel queries only queue (and pg@9 rejects them).
 */
export async function inOrder<T extends readonly (() => Promise<unknown>)[]>(
  ...steps: T
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results: unknown[] = [];
  for (const step of steps) results.push(await step());
  return results as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}

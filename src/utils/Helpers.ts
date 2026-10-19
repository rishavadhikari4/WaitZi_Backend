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

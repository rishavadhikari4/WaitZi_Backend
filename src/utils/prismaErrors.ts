// src/utils/prismaErrors.ts
import { Prisma } from '@prisma/client';

import { AppError } from './AppError.js';

/**
 * Translate Prisma / Postgres errors into AppErrors with stable codes.
 * Returns null for anything that isn't a recognised database error so the
 * caller can rethrow the original.
 *
 * Driver-adapter errors don't always populate `meta.target`; the constraint
 * lives at `meta.driverAdapterError.cause.constraint` instead, so both are read.
 */
export function mapPrismaError(error: unknown): AppError | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = error.meta as Record<string, unknown> | undefined;
    const driver = meta?.['driverAdapterError'] as
      | { cause?: { constraint?: { fields?: string[]; index?: string } } }
      | undefined;
    const target = meta?.['target'];
    const fields = [
      ...(Array.isArray(target) ? target : target ? [String(target)] : []),
      ...(driver?.cause?.constraint?.fields ?? []),
      driver?.cause?.constraint?.index ?? '',
    ]
      .join(' ')
      .replace(/"/g, '');

    switch (error.code) {
      case 'P2002': {
        if (/email/i.test(fields)) return AppError.conflict('Email already exists', 'EMAIL_TAKEN');
        if (/phone/i.test(fields)) return AppError.conflict('Phone number already exists', 'PHONE_TAKEN');
        if (/table_number|tableNumber/i.test(fields))
          return AppError.conflict('Table number already exists in this branch', 'TABLE_NUMBER_TAKEN');
        if (/slug/i.test(fields)) return AppError.conflict('That address is already taken', 'SLUG_TAKEN');
        if (/hostname/i.test(fields)) return AppError.conflict('Domain already registered', 'DOMAIN_TAKEN');
        if (/name/i.test(fields)) return AppError.conflict('Name already exists', 'NAME_TAKEN');
        return AppError.conflict('Duplicate value', 'DUPLICATE_VALUE');
      }
      case 'P2025':
        return AppError.notFound('Record not found');
      case 'P2003':
        // Real FK misses and the same_org_refs trigger both land here.
        return AppError.badRequest(
          'Invalid reference: the related record does not exist in this organization',
          'INVALID_REFERENCE',
        );
      case 'P2023':
        return AppError.badRequest('Invalid ID format', 'INVALID_ID');
      default:
        return null;
    }
  }
  if (error instanceof Error && /row-level security/i.test(error.message)) {
    return AppError.forbidden('Not allowed for this organization', 'TENANT_VIOLATION');
  }
  return null;
}

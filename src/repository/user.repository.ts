// src/repository/user.repository.ts
// Users are global login identities (no org_id). Under withTenant() RLS shows
// only members of the current org; login/reset lookups use the platform client.
import type { Prisma } from '@prisma/client';

import type { DBClient, TenantTx } from '../config/prisma.js';

/**
 * The old API stored emails through express-validator's normalizeEmail(), which
 * strips dots (and +tags) from Gmail local parts. Accounts migrated from it may
 * be stored as "firstlast@gmail.com" while the person types "first.last@gmail.com",
 * so login and reset match either form.
 */
export function emailLookupVariants(raw: string): string[] {
  const email = raw.toLowerCase().trim();
  const [local, domain] = email.split('@');
  if (!local || !domain || !['gmail.com', 'googlemail.com'].includes(domain)) return [email];
  const legacy = `${local.split('+')[0]!.replace(/\./g, '')}@gmail.com`;
  return legacy === email ? [email] : [email, legacy];
}

class UserRepository {
  async findActiveByEmail(db: DBClient, email: string) {
    const variants = emailLookupVariants(email);
    const users = await db.user.findMany({ where: { email: { in: variants }, status: 'Active' } });
    // Exact match wins if both forms exist as separate accounts.
    return users.find((u) => u.email === variants[0]) ?? users[0] ?? null;
  }

  findById(db: DBClient, id: string) {
    return db.user.findUnique({ where: { id } });
  }

  /** Email/phone uniqueness is global, so this check needs the platform client. */
  findByEmailOrPhone(db: DBClient, email: string, phone: string, excludeId?: string) {
    return db.user.findFirst({
      where: {
        OR: [{ email: email.toLowerCase().trim() }, { phone: phone.trim() }],
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true, email: true, phone: true },
    });
  }

  findByValidResetToken(db: DBClient, hashedToken: string) {
    return db.user.findFirst({
      where: { resetPasswordToken: hashedToken, resetPasswordExpires: { gt: new Date() } },
    });
  }

  /**
   * Inserts a user and returns its id. Under RLS a user is only visible once
   * they have a membership in the current org, and Postgres checks INSERT ...
   * RETURNING rows against the SELECT policy — so a plain create() would be
   * rejected. Insert without RETURNING (createMany) and create the membership
   * right after; the caller then reads the member back.
   */
  async create(tx: TenantTx, data: Omit<Prisma.UserCreateManyInput, 'id'>): Promise<string> {
    const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS id`;
    await tx.user.createMany({ data: [{ ...data, id: row!.id }] });
    return row!.id;
  }

  update(db: DBClient, id: string, data: Prisma.UserUpdateInput) {
    return db.user.update({ where: { id }, data });
  }

  delete(db: DBClient, id: string) {
    return db.user.delete({ where: { id } });
  }
}

export default new UserRepository();

// src/repository/organization.repository.ts
import type { DBClient, TenantTx } from '../config/prisma.js';

const publicFields = { id: true, name: true, slug: true, status: true, branding: true } as const;

class OrganizationRepository {
  /** The current org (RLS only shows this one). */
  findCurrent(tx: TenantTx, id: string) {
    return tx.organization.findUnique({ where: { id } });
  }

  /** Platform lookups, before a tenant is known. */
  findBySlug(db: DBClient, slug: string) {
    return db.organization.findUnique({ where: { slug }, select: publicFields });
  }

  async findByVerifiedHost(db: DBClient, hostname: string) {
    const domain = await db.domain.findFirst({
      where: { hostname: hostname.toLowerCase(), verifiedAt: { not: null } },
      select: { org: { select: publicFields } },
    });
    return domain?.org ?? null;
  }
}

export default new OrganizationRepository();

// src/repository/role.repository.ts
import type { Prisma } from '@prisma/client';

import type { TenantTx } from '../config/prisma.js';

class RoleRepository {
  list(tx: TenantTx) {
    return tx.role.findMany({ orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
  }

  findById(tx: TenantTx, id: string) {
    return tx.role.findUnique({ where: { id } });
  }

  findByName(tx: TenantTx, orgId: string, name: string) {
    return tx.role.findUnique({ where: { orgId_name: { orgId, name: name.toLowerCase().trim() } } });
  }

  create(tx: TenantTx, data: Prisma.RoleUncheckedCreateInput) {
    return tx.role.create({ data });
  }

  update(tx: TenantTx, id: string, data: Prisma.RoleUncheckedUpdateInput) {
    return tx.role.update({ where: { id }, data });
  }

  delete(tx: TenantTx, id: string) {
    return tx.role.delete({ where: { id } });
  }
}

export default new RoleRepository();

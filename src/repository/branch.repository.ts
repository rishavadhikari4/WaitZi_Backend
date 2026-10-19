// src/repository/branch.repository.ts
import type { TenantTx } from '../config/prisma.js';

class BranchRepository {
  listActive(tx: TenantTx) {
    return tx.branch.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
  }

  findById(tx: TenantTx, id: string) {
    return tx.branch.findUnique({ where: { id } });
  }
}

export default new BranchRepository();

// src/repository/category.repository.ts
import type { Prisma } from '@prisma/client';

import type { TenantTx } from '../config/prisma.js';
import { inOrder } from '../utils/Helpers.js';

export interface ICategoryFilters {
  isActive?: boolean;
  search?: string;
}

class CategoryRepository {
  async list(
    tx: TenantTx,
    filters: ICategoryFilters,
    page: { skip: number; take: number },
    orderBy: Prisma.CategoryOrderByWithRelationInput,
  ) {
    const where: Prisma.CategoryWhereInput = {
      ...(filters.isActive !== undefined && { isActive: filters.isActive }),
      ...(filters.search && {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await inOrder(
      () => tx.category.findMany({ where, orderBy, ...page }),
      () => tx.category.count({ where }),
    );
    return { items, total };
  }

  findById(tx: TenantTx, id: string) {
    return tx.category.findUnique({ where: { id } });
  }

  /** Names are unique per org regardless of case ("Momo" vs "momo"). */
  findByNameInsensitive(tx: TenantTx, name: string, excludeId?: string) {
    return tx.category.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(excludeId && { id: { not: excludeId } }) },
    });
  }

  create(tx: TenantTx, data: Prisma.CategoryUncheckedCreateInput) {
    return tx.category.create({ data });
  }

  update(tx: TenantTx, id: string, data: Prisma.CategoryUncheckedUpdateInput) {
    return tx.category.update({ where: { id }, data });
  }

  delete(tx: TenantTx, id: string) {
    return tx.category.delete({ where: { id } });
  }

  countMenuItems(tx: TenantTx, categoryId: string) {
    return tx.menuItem.count({ where: { categoryId } });
  }
}

export default new CategoryRepository();

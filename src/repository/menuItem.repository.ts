// src/repository/menuItem.repository.ts
import type { MenuAvailability, Prisma } from '@prisma/client';

import type { TenantTx } from '../config/prisma.js';

export const menuItemInclude = {
  category: { select: { id: true, name: true, description: true, image: true } },
} satisfies Prisma.MenuItemInclude;

export type MenuItemRow = Prisma.MenuItemGetPayload<{ include: typeof menuItemInclude }>;

export interface IMenuFilters {
  categoryId?: string;
  availability?: MenuAvailability;
  search?: string;
  minPaisa?: number;
  maxPaisa?: number;
}

class MenuItemRepository {
  async list(
    tx: TenantTx,
    filters: IMenuFilters,
    page: { skip: number; take: number },
    orderBy: Prisma.MenuItemOrderByWithRelationInput,
  ) {
    const where: Prisma.MenuItemWhereInput = {
      ...(filters.categoryId && { categoryId: filters.categoryId }),
      ...(filters.availability && { availabilityStatus: filters.availability }),
      ...(filters.search && {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
      ...((filters.minPaisa !== undefined || filters.maxPaisa !== undefined) && {
        pricePaisa: {
          ...(filters.minPaisa !== undefined && { gte: filters.minPaisa }),
          ...(filters.maxPaisa !== undefined && { lte: filters.maxPaisa }),
        },
      }),
    };
    const [items, total] = await Promise.all([
      tx.menuItem.findMany({ where, include: menuItemInclude, orderBy, ...page }),
      tx.menuItem.count({ where }),
    ]);
    return { items, total };
  }

  findById(tx: TenantTx, id: string) {
    return tx.menuItem.findUnique({ where: { id }, include: menuItemInclude });
  }

  findByNameInsensitive(tx: TenantTx, name: string, excludeId?: string) {
    return tx.menuItem.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(excludeId && { id: { not: excludeId } }) },
    });
  }

  /** Active categories with their available items, for the guest menu. */
  orderableMenu(tx: TenantTx) {
    return tx.category.findMany({
      where: { isActive: true, menuItems: { some: { availabilityStatus: 'Available' } } },
      orderBy: { name: 'asc' },
      include: { menuItems: { where: { availabilityStatus: 'Available' }, orderBy: { name: 'asc' } } },
    });
  }

  create(tx: TenantTx, data: Prisma.MenuItemUncheckedCreateInput) {
    return tx.menuItem.create({ data, include: menuItemInclude });
  }

  update(tx: TenantTx, id: string, data: Prisma.MenuItemUncheckedUpdateInput) {
    return tx.menuItem.update({ where: { id }, data, include: menuItemInclude });
  }

  delete(tx: TenantTx, id: string) {
    return tx.menuItem.delete({ where: { id } });
  }

  countOrderLines(tx: TenantTx, menuItemId: string) {
    return tx.orderItem.count({ where: { menuItemId } });
  }
}

export default new MenuItemRepository();

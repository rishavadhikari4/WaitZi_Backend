// src/services/table/shared/table.mapper.ts
import type { DiningTable } from '@prisma/client';

import type { TableRow } from '../../../repository/diningTable.repository.js';
import { toRupees } from '../../../utils/Helpers.js';

/** A table can take a new order when free, or when it is already serving one. */
export const isAvailableForOrder = (t: Pick<TableRow, 'status' | 'currentOrderId'>) =>
  t.status === 'Available' || (t.status === 'Occupied' && t.currentOrderId !== null);

export function tableToApi(t: TableRow | DiningTable) {
  const { orgId: _orgId, legacyId: _legacyId, ...rest } = t as TableRow;
  const order = (t as TableRow).currentOrder;
  return {
    ...rest,
    assignedWaiter: (t as TableRow).assignedWaiter ?? null,
    currentOrder: order
      ? {
          id: order.id,
          customerName: order.customerName,
          totalAmount: toRupees(order.totalPaisa),
          finalAmount: toRupees(order.finalPaisa),
          status: order.status,
          createdAt: order.createdAt,
          items: order.items.map(({ pricePaisa, ...i }) => ({ ...i, price: toRupees(pricePaisa) })),
        }
      : null,
  };
}

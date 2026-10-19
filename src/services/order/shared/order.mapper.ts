// src/services/order/shared/order.mapper.ts
// Order rows -> the shape the frontend already reads (amounts in rupees,
// populated table/menuItem/people, orderStats).
import type { OrderRow } from '../../../repository/order.repository.js';
import { toRupees } from '../../../utils/Helpers.js';

export function orderStats(items: { quantity: number; status: string }[]) {
  const count = (s: string) => items.filter((i) => i.status === s).length;
  return {
    totalItems: items.length,
    totalQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
    pendingItems: count('Pending'),
    cookingItems: count('Cooking'),
    readyItems: count('Ready'),
    servedItems: count('Served'),
  };
}

export function orderToApi(o: OrderRow) {
  const { orgId: _orgId, totalPaisa, discountPaisa, finalPaisa, items, tableId: _tableId, ...rest } = o;
  return {
    ...rest,
    totalAmount: toRupees(totalPaisa),
    discount: toRupees(discountPaisa),
    finalAmount: toRupees(finalPaisa),
    items: items.map(({ orgId: _o, orderId: _id, menuItemId: _m, pricePaisa, subtotalPaisa, menuItem, ...item }) => ({
      ...item,
      menuItem: menuItem ? { ...menuItem, category: menuItem.categoryId } : null,
      price: toRupees(pricePaisa),
      subtotal: toRupees(subtotalPaisa),
    })),
    orderStats: orderStats(items),
  };
}

/** What guests may see: no staff identities beyond the waiter's name. */
export function orderToPublicApi(o: OrderRow) {
  const { assignedWaiter, cookedBy: _c, servedBy: _s, ...order } = orderToApi(o);
  return {
    ...order,
    assignedWaiter: assignedWaiter ? { firstName: assignedWaiter.firstName, lastName: assignedWaiter.lastName } : null,
  };
}

// src/services/payment/shared/payment.core.ts
import type { TenantTx } from '../../../config/prisma.js';
import type { PaymentRow } from '../../../repository/payment.repository.js';
import { toRupees } from '../../../utils/Helpers.js';
import { releaseTable } from '../../order/shared/order.core.js';

/**
 * A payment just cleared for `orderId`. A served order becomes Paid and frees
 * its table; one still being cooked is marked prepaid and closes itself when
 * its last item is served (see the order roll-up).
 */
export async function settleOrder(tx: TenantTx, orderId: string): Promise<'Paid' | 'Prepaid'> {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, tableId: true, status: true } });
  if (order.status === 'Served') {
    await tx.order.update({ where: { id: orderId }, data: { status: 'Paid' } });
    await releaseTable(tx, order);
    return 'Paid';
  }
  await tx.order.update({ where: { id: orderId }, data: { isPrepaid: true } });
  return 'Prepaid';
}

/** Payable while the order is still open. */
export const PAYABLE_STATUSES = ['Pending', 'InKitchen', 'Served'] as const;

export function paymentToApi(p: PaymentRow) {
  const { orgId: _o, branchId: _b, orderId: _orderId, tableId: _t, handledById: _h, amountPaisa, method, status, order, ...rest } = p;
  return {
    ...rest,
    amount: toRupees(amountPaisa),
    paymentMethod: method,
    paymentStatus: status,
    order: order && {
      id: order.id,
      customerName: order.customerName,
      status: order.status,
      totalAmount: toRupees(order.totalPaisa),
      finalAmount: toRupees(order.finalPaisa),
      items: order.items.map(({ pricePaisa, subtotalPaisa, ...i }) => ({ ...i, price: toRupees(pricePaisa), subtotal: toRupees(subtotalPaisa) })),
    },
  };
}

// src/services/order/public/order.service.ts
// Guest ordering from a table QR. The QR token is the guest's only
// credential: it identifies the table (and so the organization), and guests
// can only see that table's active orders. Discounts are never accepted here.
import { asPlatform, withTenant } from '../../../config/prisma.js';
import DiningTableRepository from '../../../repository/diningTable.repository.js';
import OrderRepository, { ACTIVE_STATUSES } from '../../../repository/order.repository.js';
import { AppError } from '../../../utils/AppError.js';
import type { PublicCreateOrderInput } from '../../../validators/order.schema.js';
import SocketService from '../../socket/socket.service.js';
import { createOrderTx } from '../shared/order.core.js';
import { orderToApi, orderToPublicApi } from '../shared/order.mapper.js';
import { inOrder } from '../../../utils/Helpers.js';

async function tableFromToken(qrToken: string) {
  const found = await asPlatform('public: order table lookup', (db) => DiningTableRepository.findOrgByQrToken(db, qrToken));
  if (!found) throw AppError.notFound('Table not found');
  return found;
}

class PublicOrderService {
  create = async (input: PublicCreateOrderInput) => {
    const { id: tableId, orgId } = await tableFromToken(input.qrToken);
    const order = await withTenant({ orgId }, async (tx) => {
      const [table, org] = await inOrder(
        () => DiningTableRepository.findById(tx, tableId),
        () => tx.organization.findUnique({ where: { id: orgId }, select: { status: true } }),
      );
      if (!table || !org || org.status === 'suspended') throw AppError.notFound('Table not found');
      return createOrderTx(tx, { orgId, table, customerName: input.customerName, lines: input.items, note: input.note });
    });
    SocketService.emitOrderEvent(orgId, 'order:new', { orderId: order.id, tableId, order: orderToApi(order) });
    return orderToPublicApi(order);
  };

  /** Active orders at the guest's table (what the tracking page shows). */
  tableOrders = async (qrToken: string) => {
    const { id: tableId, orgId } = await tableFromToken(qrToken);
    const orders = await withTenant({ orgId }, (tx) =>
      OrderRepository.find(tx, { tableId, statuses: ACTIVE_STATUSES }, { createdAt: 'desc' }),
    );
    return orders.map(orderToPublicApi);
  };
}

export default new PublicOrderService();

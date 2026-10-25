// src/services/order/client/order.service.ts
import type { OrderItemStatus, OrderStatus } from '@prisma/client';

import { withTenant, type TenantContext, type TenantTx } from '../../../config/prisma.js';
import { hasPermission, type Permission } from '../../../constants/permissions.js';
import type { RequestUser } from '../../../Interface/GlobalInterface.js';
import DiningTableRepository from '../../../repository/diningTable.repository.js';
import OrderRepository, { ACTIVE_STATUSES, type OrderRow } from '../../../repository/order.repository.js';
import PaymentRepository from '../../../repository/payment.repository.js';
import { AppError } from '../../../utils/AppError.js';
import { paginationMeta, toPaisa, toRupees } from '../../../utils/Helpers.js';
import { inBranch, orderScope, type FloorScope } from '../../../utils/scope.js';
import { DEFAULT_TIMEZONE, startOfDayIn } from '../../../utils/time.js';
import type { OrderLineInput, OrderQuery, OrderStatusInput, StaffCreateOrderInput } from '../../../validators/order.schema.js';
import SocketService, { type OrderEvent } from '../../socket/socket.service.js';
import { requireApproval } from '../../approval/approval.service.js';
import { recordAudit } from '../../audit/audit.service.js';
import { createOrderTx, priceLines, recomputeTotals, releaseTable } from '../shared/order.core.js';
import { orderToApi } from '../shared/order.mapper.js';

const CLOSED: OrderStatus[] = ['Cancelled', 'Completed'];
const SORT_FIELD = {
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  totalAmount: 'totalPaisa',
  finalAmount: 'finalPaisa',
  status: 'status',
} as const;

function can(actor: RequestUser, ...perms: Permission[]) {
  return perms.some((p) => hasPermission(actor.role.permissions, p));
}

/** Which permission a target status needs. */
function assertMayMoveTo(actor: RequestUser, status: OrderStatus) {
  const ok =
    status === 'Paid' || status === 'Completed'
      ? can(actor, 'payment.create')
      : status === 'Cancelled'
        ? can(actor, 'order.cancel')
        : can(actor, 'kot.update', 'order.serve', 'order.edit');
  if (!ok) throw AppError.forbidden(`Your role cannot set orders to ${status}`, 'FORBIDDEN');
}

/** A waiter without floor.all only sees orders assigned to them or at their tables. */
function visible(scope: FloorScope, order: OrderRow): boolean {
  if (!inBranch(scope, order.branchId)) return false;
  return !scope.waiterId || order.assignedWaiterId === scope.waiterId || order.table?.assignedWaiterId === scope.waiterId;
}

async function requireOrder(tx: TenantTx, id: string, actor: RequestUser): Promise<OrderRow> {
  await OrderRepository.lock(tx, id).catch(() => undefined);
  const order = await OrderRepository.findById(tx, id);
  if (!order || !visible(orderScope(actor), order)) {
    throw AppError.notFound('Order not found');
  }
  return order;
}

function emit(orgId: string, event: OrderEvent, order: OrderRow) {
  SocketService.emitOrderEvent(orgId, event, { orderId: order.id, tableId: order.tableId, order: orderToApi(order) });
}

/** Item statuses roll up into the order status (as before). */
function rollUp(order: OrderRow): { status?: OrderStatus; becamePaid: boolean } {
  const allServed = order.items.every((i) => i.status === 'Served');
  const anyCooking = order.items.some((i) => i.status === 'Cooking' || i.status === 'Ready');
  if (allServed && order.isPrepaid && order.status !== 'Paid') return { status: 'Paid', becamePaid: true };
  if (allServed && order.status !== 'Served' && order.status !== 'Paid') return { status: 'Served', becamePaid: false };
  if (anyCooking && order.status === 'Pending') return { status: 'InKitchen', becamePaid: false };
  return { becamePaid: false };
}

class ClientOrderService {
  create = async (tenant: TenantContext, actor: RequestUser, input: StaffCreateOrderInput) => {
    if (input.discount && !can(actor, 'discount.apply')) {
      throw AppError.forbidden('Your role cannot apply discounts', 'FORBIDDEN');
    }
    const order = await withTenant(tenant, async (tx) => {
      const table = await DiningTableRepository.findById(tx, input.tableId);
      const scope = orderScope(actor);
      if (!table || !inBranch(scope, table.branchId) || (scope.waiterId && table.assignedWaiterId !== scope.waiterId)) {
        throw AppError.notFound('Table not found');
      }
      const created = await createOrderTx(tx, {
        orgId: tenant.orgId,
        table,
        customerName: input.customerName,
        lines: input.items,
        note: input.note,
        ...(input.discount && { discountPaisa: toPaisa(input.discount) }),
      });
      if (created.discountPaisa > 0) {
        // Discounts above the org's limit (default 10% of the bill) need discount.approve.
        const org = await tx.organization.findUniqueOrThrow({ where: { id: tenant.orgId }, select: { taxSettings: true } });
        const limit = Number((org.taxSettings as { discountApprovalPercent?: number }).discountApprovalPercent ?? 10);
        const approvedBy =
          created.discountPaisa * 100 > created.totalPaisa * limit
            ? requireApproval(tenant, actor, 'discount.approve', created.id, input.approvalToken)
            : undefined;
        await recordAudit(tx, tenant, {
          action: 'order.discount',
          targetType: 'order',
          targetId: created.id,
          after: { discount: toRupees(created.discountPaisa), total: toRupees(created.totalPaisa) },
          ...(approvedBy && { approvedBy }),
        });
      }
      return created;
    });
    emit(tenant.orgId, 'order:new', order);
    return orderToApi(order);
  };

  list = (tenant: TenantContext, actor: RequestUser, q: OrderQuery) =>
    withTenant(tenant, async (tx) => {
      const scope = orderScope(actor);
      const branchIds = scope.branchIds.length ? scope.branchIds : undefined;
      const { items, total } = await OrderRepository.list(
        tx,
        {
          ...(q.status && { status: q.status }),
          ...(q.table && { tableId: q.table }),
          ...(q.startDate && { from: q.startDate }),
          ...(q.endDate && { to: q.endDate }),
          ...(branchIds && { branchIds }),
          ...(scope.waiterId && { waiterId: scope.waiterId }),
        },
        { skip: (q.page - 1) * q.limit, take: q.limit },
        { [SORT_FIELD[q.sortBy]]: q.sortOrder },
      );
      const s = await OrderRepository.stats(tx, startOfDayIn(DEFAULT_TIMEZONE), {
        ...(branchIds && { branchIds }),
        ...(scope.waiterId && { waiterId: scope.waiterId }),
      });
      return {
        orders: items.map(orderToApi),
        pagination: paginationMeta(q.page, q.limit, total),
        stats: {
          total: s.total,
          today: s.today,
          revenue: { today: toRupees(s.revenueTodayPaisa), total: toRupees(s.revenueTotalPaisa) },
          byStatus: Object.fromEntries(s.byStatus.map((r) => [r.status.toLowerCase(), r._count._all])),
        },
      };
    });

  get = (tenant: TenantContext, actor: RequestUser, id: string) =>
    withTenant(tenant, async (tx) => orderToApi(await requireOrder(tx, id, actor)));

  byTable = (tenant: TenantContext, actor: RequestUser, tableId: string, status?: OrderStatus) =>
    withTenant(tenant, async (tx) => {
      const orders = await OrderRepository.find(
        tx,
        {
          tableId,
          ...(status ? { status } : { statuses: ACTIVE_STATUSES }),
          ...(actor.branchIds.length && { branchIds: actor.branchIds }),
          ...(orderScope(actor).waiterId && { waiterId: actor.id }),
        },
        { createdAt: 'desc' },
      );
      return orders.map(orderToApi);
    });

  kitchenQueue = (tenant: TenantContext, actor: RequestUser, status: 'Pending' | 'InKitchen' | 'all') =>
    withTenant(tenant, async (tx) => {
      const orders = await OrderRepository.find(
        tx,
        {
          ...(status === 'all' ? { statuses: ['Pending', 'InKitchen'] } : { status }),
          ...(actor.branchIds.length && { branchIds: actor.branchIds }),
        },
        { createdAt: 'asc' }, // oldest first
      );
      return orders.map((o) => {
        const api = orderToApi(o);
        return {
          ...api,
          itemsByStatus: {
            pending: api.items.filter((i) => i.status === 'Pending'),
            cooking: api.items.filter((i) => i.status === 'Cooking'),
            ready: api.items.filter((i) => i.status === 'Ready'),
          },
        };
      });
    });

  updateStatus = async (tenant: TenantContext, actor: RequestUser, id: string, input: OrderStatusInput) => {
    assertMayMoveTo(actor, input.status);
    const order = await withTenant(tenant, async (tx) => {
      const current = await requireOrder(tx, id, actor);
      if (CLOSED.includes(current.status)) {
        throw AppError.badRequest(`Order is already ${current.status.toLowerCase()}`, 'ORDER_CLOSED');
      }
      const updated = await OrderRepository.update(tx, id, {
        status: input.status,
        ...(input.cookedBy && { cookedById: input.cookedBy }),
        ...(input.servedBy && { servedById: input.servedBy }),
      });
      if (['Paid', 'Completed', 'Cancelled'].includes(input.status)) await releaseTable(tx, updated);
      return updated;
    });
    emit(tenant.orgId, input.status === 'Cancelled' ? 'order:cancelled' : 'order:status-updated', order);
    return orderToApi(order);
  };

  updateItemStatus = async (
    tenant: TenantContext,
    actor: RequestUser,
    orderId: string,
    itemId: string,
    status: OrderItemStatus,
    notes?: string,
  ) => {
    if (!can(actor, 'kot.update', 'order.serve')) throw AppError.forbidden('Your role cannot update kitchen items', 'FORBIDDEN');
    const { order, item, becamePaid } = await withTenant(tenant, async (tx) => {
      const current = await requireOrder(tx, orderId, actor);
      if (CLOSED.includes(current.status)) throw AppError.badRequest('Order is closed', 'ORDER_CLOSED');
      if (!current.items.some((i) => i.id === itemId)) throw AppError.notFound('Order item not found');

      const updatedItem = await OrderRepository.updateItem(tx, itemId, { status, ...(notes !== undefined && { notes }) });
      const refreshed = (await OrderRepository.findById(tx, orderId))!;
      const roll = rollUp(refreshed);
      const final = roll.status ? await OrderRepository.update(tx, orderId, { status: roll.status }) : refreshed;
      if (roll.becamePaid) await releaseTable(tx, final);
      return { order: final, item: updatedItem, becamePaid: roll.becamePaid };
    });
    emit(tenant.orgId, 'order:item-updated', order);
    if (becamePaid) emit(tenant.orgId, 'order:paid', order);
    const { orgId: _o, pricePaisa, subtotalPaisa, ...rest } = item;
    return { ...orderToApi(order), updatedItem: { ...rest, price: toRupees(pricePaisa), subtotal: toRupees(subtotalPaisa) } };
  };

  addItems = async (tenant: TenantContext, actor: RequestUser, id: string, lines: OrderLineInput[]) => {
    if (!can(actor, 'order.edit')) throw AppError.forbidden('Your role cannot change orders', 'FORBIDDEN');
    const order = await withTenant(tenant, async (tx) => {
      const current = await requireOrder(tx, id, actor);
      if (['Cancelled', 'Paid', 'Completed'].includes(current.status)) {
        throw AppError.badRequest('Cannot add items to cancelled or paid order', 'ORDER_CLOSED');
      }
      const { items } = await priceLines(tx, tenant.orgId, lines);
      await tx.orderItem.createMany({ data: items.map((i) => ({ ...i, orderId: id })) });
      const totals = await recomputeTotals(tx, id);
      // A Khalti checkout started for the old total must not settle the new one.
      await PaymentRepository.voidPendingGateway(tx, id);
      // New items go back through the kitchen.
      return OrderRepository.update(tx, id, { ...totals, ...(current.status === 'Served' && { status: 'InKitchen' }) });
    });
    emit(tenant.orgId, 'order:items-added', order);
    return orderToApi(order);
  };

  cancel = async (tenant: TenantContext, actor: RequestUser, id: string, reason?: string) => {
    const order = await withTenant(tenant, async (tx) => {
      const current = await requireOrder(tx, id, actor);
      if (['Served', 'Paid', 'Completed', 'Cancelled'].includes(current.status)) {
        throw AppError.badRequest('Cannot cancel served or paid order', 'ORDER_CLOSED');
      }
      const line = reason ? `Cancelled: ${reason}` : '[CANCELLED BY STAFF]';
      const updated = await OrderRepository.update(tx, id, {
        status: 'Cancelled',
        note: current.note ? `${current.note}\n${line}` : line,
      });
      await releaseTable(tx, updated);
      await recordAudit(tx, tenant, {
        action: 'order.cancel',
        targetType: 'order',
        targetId: id,
        before: { status: current.status, total: toRupees(current.finalPaisa) },
        after: { reason: reason ?? null },
      });
      return updated;
    });
    emit(tenant.orgId, 'order:cancelled', order);
    return orderToApi(order);
  };

  complete = async (tenant: TenantContext, actor: RequestUser, id: string) => {
    const order = await withTenant(tenant, async (tx) => {
      const current = await requireOrder(tx, id, actor);
      if (current.status !== 'Paid') throw AppError.badRequest('Order must be paid before completion', 'ORDER_NOT_PAID');
      const updated = await OrderRepository.update(tx, id, { status: 'Completed' });
      await releaseTable(tx, updated);
      return updated;
    });
    emit(tenant.orgId, 'order:completed', order);
    return orderToApi(order);
  };
}

export default new ClientOrderService();

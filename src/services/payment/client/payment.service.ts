// src/services/payment/client/payment.service.ts
import { withTenant, type TenantContext } from '../../../config/prisma.js';
import OrderRepository from '../../../repository/order.repository.js';
import PaymentRepository from '../../../repository/payment.repository.js';
import { AppError } from '../../../utils/AppError.js';
import { paginationMeta, toPaisa, toRupees, inOrder } from '../../../utils/Helpers.js';
import { DEFAULT_TIMEZONE, startOfDayIn } from '../../../utils/time.js';
import type { PaymentQuery, PaymentStatusInput, ProcessPaymentInput, RefundInput } from '../../../validators/payment.schema.js';
import { orderToApi } from '../../order/shared/order.mapper.js';
import SocketService from '../../socket/socket.service.js';
import { PAYABLE_STATUSES, paymentToApi, settleOrder } from '../shared/payment.core.js';

const SORT_FIELD = { paymentTime: 'paymentTime', amount: 'amountPaisa', createdAt: 'createdAt', updatedAt: 'updatedAt' } as const;

async function emitPaid(tenant: TenantContext, orderId: string) {
  const order = await withTenant(tenant, (tx) => OrderRepository.findById(tx, orderId));
  if (order) SocketService.emitOrderEvent(tenant.orgId, 'order:paid', { orderId, tableId: order.tableId, order: orderToApi(order) });
}

class ClientPaymentService {
  /** Cash settles at once; card/QR payments wait as Pending until confirmed. */
  process = async (tenant: TenantContext, input: ProcessPaymentInput) => {
    const amountPaisa = toPaisa(input.amount);
    const payment = await withTenant(tenant, async (tx) => {
      await OrderRepository.lock(tx, input.orderId);
      const order = await OrderRepository.findById(tx, input.orderId);
      if (!order) throw AppError.notFound('Order not found');
      if (!(PAYABLE_STATUSES as readonly string[]).includes(order.status)) {
        throw AppError.badRequest(`Cannot process payment for ${order.status.toLowerCase()} order`, 'ORDER_NOT_PAYABLE');
      }
      if (await PaymentRepository.findOpenForOrder(tx, order.id)) {
        throw AppError.badRequest('Payment already exists for this order', 'PAYMENT_EXISTS');
      }
      if (amountPaisa !== order.finalPaisa) {
        throw AppError.badRequest(
          `Payment amount (${input.amount}) does not match order total (${toRupees(order.finalPaisa)})`,
          'AMOUNT_MISMATCH',
        );
      }
      const paid = input.paymentMethod === 'Cash';
      const created = await PaymentRepository.create(tx, {
        orgId: tenant.orgId,
        branchId: order.branchId,
        orderId: order.id,
        tableId: order.tableId,
        amountPaisa,
        method: input.paymentMethod,
        status: paid ? 'Paid' : 'Pending',
        handledById: tenant.userId ?? null,
        transactionId: input.transactionId ?? null,
      });
      if (paid) await settleOrder(tx, order.id);
      return created;
    });
    if (payment.status === 'Paid') await emitPaid(tenant, payment.orderId);
    return paymentToApi(payment);
  };

  list = (tenant: TenantContext, q: PaymentQuery) =>
    withTenant(tenant, async (tx) => {
      const filters = {
        ...(q.paymentStatus && { status: q.paymentStatus }),
        ...(q.paymentMethod && { method: q.paymentMethod }),
        ...(q.startDate && { from: q.startDate }),
        ...(q.endDate && { to: q.endDate }),
      };
      const { items, total } = await PaymentRepository.list(
        tx,
        filters,
        { skip: (q.page - 1) * q.limit, take: q.limit },
        { [SORT_FIELD[q.sortBy]]: q.sortOrder },
      );
      const today = startOfDayIn(DEFAULT_TIMEZONE);
      const [allTime, todayTotals, { byStatus, byMethod }, todayCount] = await inOrder(
        () => PaymentRepository.totals(tx, {}),
        () => PaymentRepository.totals(tx, { from: today }),
        () => PaymentRepository.breakdown(tx, {}),
        () => tx.payment.count({ where: { paymentTime: { gte: today } } }),
      );
      return {
        payments: items.map(paymentToApi),
        pagination: paginationMeta(q.page, q.limit, total),
        stats: {
          total: byStatus.reduce((s, r) => s + r._count._all, 0),
          today: todayCount,
          revenue: { today: toRupees(todayTotals.netPaisa), total: toRupees(allTime.netPaisa) },
          refunds: { total: toRupees(allTime.refundPaisa) },
          byStatus: Object.fromEntries(byStatus.map((r) => [r.status.toLowerCase(), r._count._all])),
          byMethod: Object.fromEntries(
            byMethod.map((r) => [r.method.toLowerCase(), { count: r._count._all, total: toRupees(r._sum.amountPaisa ?? 0) }]),
          ),
        },
      };
    });

  get = (tenant: TenantContext, id: string) =>
    withTenant(tenant, async (tx) => {
      const p = await PaymentRepository.findById(tx, id);
      if (!p) throw AppError.notFound('Payment not found');
      return paymentToApi(p);
    });

  byOrder = (tenant: TenantContext, orderId: string) =>
    withTenant(tenant, async (tx) => {
      const p = await PaymentRepository.findLatestForOrder(tx, orderId);
      if (!p) throw AppError.notFound('Payment not found for this order');
      return paymentToApi(p);
    });

  /** Confirm (or fail) a pending card / Fonepay / NepalPay payment. */
  updateStatus = async (tenant: TenantContext, id: string, input: PaymentStatusInput) => {
    const payment = await withTenant(tenant, async (tx) => {
      const p = await PaymentRepository.findById(tx, id);
      if (!p) throw AppError.notFound('Payment not found');
      if (p.status !== 'Pending') throw AppError.badRequest(`Payment is already ${p.status.toLowerCase()}`, 'PAYMENT_CLOSED');
      if (p.khaltiPidx) {
        throw AppError.badRequest('Khalti payments are confirmed by Khalti, not by hand', 'GATEWAY_PAYMENT');
      }
      const updated = await PaymentRepository.update(tx, id, {
        status: input.paymentStatus,
        paymentTime: new Date(),
        handledById: tenant.userId ?? null,
        ...(input.transactionId !== undefined && { transactionId: input.transactionId }),
      });
      if (input.paymentStatus === 'Paid') await settleOrder(tx, p.orderId);
      return updated;
    });
    if (payment.status === 'Paid') await emitPaid(tenant, payment.orderId);
    return paymentToApi(payment);
  };

  /** Refunds are separate negative rows; the original is marked Refunded once fully refunded. */
  refund = (tenant: TenantContext, id: string, input: RefundInput) =>
    withTenant(tenant, async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
      const original = await PaymentRepository.findById(tx, id);
      if (!original) throw AppError.notFound('Payment not found');
      if (original.status !== 'Paid' || original.amountPaisa <= 0) {
        throw AppError.badRequest('Can only refund paid payments', 'NOT_REFUNDABLE');
      }
      const already = await PaymentRepository.refundedPaisa(tx, id);
      const remaining = original.amountPaisa - already;
      const refundPaisa = input.refundAmount !== undefined ? toPaisa(input.refundAmount) : remaining;
      if (refundPaisa <= 0 || refundPaisa > remaining) {
        throw AppError.badRequest(`Invalid refund amount; at most ${toRupees(remaining)} can still be refunded`, 'INVALID_REFUND');
      }

      const refund = await PaymentRepository.create(tx, {
        orgId: tenant.orgId,
        branchId: original.branchId,
        orderId: original.orderId,
        tableId: original.tableId,
        amountPaisa: -refundPaisa,
        method: original.method,
        status: 'Refunded',
        handledById: tenant.userId ?? null,
        transactionId: `REFUND-${original.id}`,
      });
      const updatedOriginal =
        refundPaisa === remaining ? await PaymentRepository.update(tx, id, { status: 'Refunded' }) : original;

      return {
        refund: paymentToApi(refund),
        originalPayment: paymentToApi(updatedOriginal),
        refundAmount: toRupees(refundPaisa),
        remainingRefundable: toRupees(remaining - refundPaisa),
        reason: input.reason || 'No reason provided',
      };
    });

  /** One day of takings, in the restaurant's timezone, net of refunds. */
  dailyReport = (tenant: TenantContext, date?: string) =>
    withTenant(tenant, async (tx) => {
      const tz = DEFAULT_TIMEZONE;
      const from = date ? startOfDayIn(tz, new Date(`${date}T12:00:00Z`)) : startOfDayIn(tz);
      const to = new Date(from.getTime() + 24 * 60 * 60 * 1000 - 1);
      const range = { from, to };

      const [totals, { byMethod }, hourly, transactions] = await inOrder(
        () => PaymentRepository.totals(tx, range),
        () => PaymentRepository.breakdown(tx, range),
        () => PaymentRepository.hourly(tx, from, to, tz),
        () => tx.payment.findMany({
          where: { paymentTime: { gte: from, lte: to }, status: { in: ['Paid', 'Refunded'] } },
          include: { order: { select: { id: true, customerName: true } }, table: { select: { id: true, tableNumber: true } } },
          orderBy: { paymentTime: 'asc' },
        }),
      );

      return {
        date: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(from),
        timeZone: tz,
        summary: {
          totalSales: toRupees(totals.netPaisa),
          grossSales: toRupees(totals.grossPaisa),
          refunds: toRupees(totals.refundPaisa),
          totalTransactions: totals.transactions,
          averageTransaction: totals.transactions ? toRupees(Math.round(totals.grossPaisa / totals.transactions)) : 0,
        },
        paymentMethods: byMethod.map((r) => ({ _id: r.method, method: r.method, total: toRupees(r._sum.amountPaisa ?? 0), count: r._count._all })),
        hourlyBreakdown: hourly.map((h) => ({ _id: h.hour, hour: h.hour, total: toRupees(Number(h.total)), count: Number(h.count) })),
        transactions: transactions.map(({ amountPaisa, method, status, ...t }) => ({
          ...t,
          amount: toRupees(amountPaisa),
          paymentMethod: method,
          paymentStatus: status,
        })),
      };
    });
}

export default new ClientPaymentService();

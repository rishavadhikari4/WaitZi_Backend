// src/repository/payment.repository.ts
import type { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';

import type { DBClient, TenantTx } from '../config/prisma.js';
import { inOrder } from '../utils/Helpers.js';

export const paymentInclude = {
  order: {
    select: {
      id: true,
      customerName: true,
      totalPaisa: true,
      finalPaisa: true,
      status: true,
      items: { select: { id: true, name: true, quantity: true, pricePaisa: true, subtotalPaisa: true } },
    },
  },
  table: { select: { id: true, tableNumber: true, capacity: true } },
  handledBy: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.PaymentInclude;

export type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export interface IPaymentFilters {
  status?: PaymentStatus;
  method?: PaymentMethod;
  from?: Date;
  to?: Date;
}

function where(f: IPaymentFilters): Prisma.PaymentWhereInput {
  return {
    ...(f.status && { status: f.status }),
    ...(f.method && { method: f.method }),
    ...((f.from || f.to) && { paymentTime: { ...(f.from && { gte: f.from }), ...(f.to && { lte: f.to }) } }),
  };
}

/** Money in: positive rows that were paid (including ones later refunded). */
const GROSS: Prisma.PaymentWhereInput = { amountPaisa: { gt: 0 }, status: { in: ['Paid', 'Refunded'] } };
/** Money out: refund rows are stored as negative amounts. */
const REFUNDS: Prisma.PaymentWhereInput = { amountPaisa: { lt: 0 } };

class PaymentRepository {
  async list(tx: TenantTx, f: IPaymentFilters, page: { skip: number; take: number }, orderBy: Prisma.PaymentOrderByWithRelationInput) {
    const w = where(f);
    const [items, total] = await inOrder(
      () => tx.payment.findMany({ where: w, include: paymentInclude, orderBy, ...page }),
      () => tx.payment.count({ where: w }),
    );
    return { items, total };
  }

  findById(tx: TenantTx, id: string) {
    return tx.payment.findUnique({ where: { id }, include: paymentInclude });
  }

  findLatestForOrder(tx: TenantTx, orderId: string) {
    return tx.payment.findFirst({ where: { orderId }, include: paymentInclude, orderBy: { createdAt: 'desc' } });
  }

  findOpenForOrder(tx: TenantTx, orderId: string) {
    return tx.payment.findFirst({ where: { orderId, status: { in: ['Paid', 'Pending'] }, amountPaisa: { gt: 0 } } });
  }

  /** Refunds already issued against an original payment. */
  async refundedPaisa(tx: TenantTx, originalId: string) {
    const r = await tx.payment.aggregate({ where: { transactionId: `REFUND-${originalId}` }, _sum: { amountPaisa: true } });
    return -(r._sum.amountPaisa ?? 0);
  }

  create(tx: TenantTx, data: Prisma.PaymentUncheckedCreateInput) {
    return tx.payment.create({ data, include: paymentInclude });
  }

  update(tx: TenantTx, id: string, data: Prisma.PaymentUncheckedUpdateInput) {
    return tx.payment.update({ where: { id }, data, include: paymentInclude });
  }

  /** Stop pending gateway payments for an order whose total changed. */
  voidPendingGateway(tx: TenantTx, orderId: string) {
    return tx.payment.updateMany({ where: { orderId, status: 'Pending', khaltiPidx: { not: null } }, data: { status: 'Failed' } });
  }

  async totals(tx: TenantTx, f: IPaymentFilters) {
    const w = where(f);
    const [gross, refunds] = await inOrder(
      () => tx.payment.aggregate({ where: { ...w, ...GROSS }, _sum: { amountPaisa: true }, _count: { _all: true } }),
      () => tx.payment.aggregate({ where: { ...w, ...REFUNDS }, _sum: { amountPaisa: true } }),
    );
    const grossPaisa = gross._sum.amountPaisa ?? 0;
    const refundPaisa = -(refunds._sum.amountPaisa ?? 0);
    return { grossPaisa, refundPaisa, netPaisa: grossPaisa - refundPaisa, transactions: gross._count._all };
  }

  async breakdown(tx: TenantTx, f: IPaymentFilters) {
    const w = where(f);
    const [byStatus, byMethod] = await inOrder(
      () => tx.payment.groupBy({ by: ['status'], where: w, _count: { _all: true } }),
      () => tx.payment.groupBy({ by: ['method'], where: { ...w, ...GROSS }, _count: { _all: true }, _sum: { amountPaisa: true } }),
    );
    return { byStatus, byMethod };
  }

  /** Paid amounts per hour of the restaurant's day (0-23, in its timezone). */
  hourly(tx: TenantTx, from: Date, to: Date, timeZone: string) {
    return tx.$queryRaw<{ hour: number; total: bigint; count: bigint }[]>`
      SELECT extract(hour FROM payment_time AT TIME ZONE ${timeZone})::int AS hour,
             sum(amount_paisa)::bigint AS total, count(*)::bigint AS count
      FROM payments
      WHERE payment_time >= ${from} AND payment_time <= ${to}
        AND amount_paisa > 0 AND status IN ('Paid', 'Refunded')
      GROUP BY 1 ORDER BY 1`;
  }

  // ── Gateway callbacks (platform client: tenant unknown until we find the row) ──

  findOrgByPidx(db: DBClient, pidx: string) {
    return db.payment.findUnique({ where: { khaltiPidx: pidx }, select: { id: true, orgId: true } });
  }
}

export default new PaymentRepository();

// src/services/payment/public/khalti.service.ts
// Guest Khalti checkout. Money is only ever confirmed by Khalti's
// server-to-server lookup, and only for the amount we asked for.
//
// ponytail: Khalti keys still come from env, so only the default organization
// may use it; Stage 4 moves keys onto each organization (per-org merchant).
import config from '../../../config/config.js';
import { asPlatform, withTenant } from '../../../config/prisma.js';
import { KhaltiProvider } from '../../../providers/payment/khalti.provider.js';
import DiningTableRepository from '../../../repository/diningTable.repository.js';
import OrderRepository from '../../../repository/order.repository.js';
import PaymentRepository from '../../../repository/payment.repository.js';
import { AppError } from '../../../utils/AppError.js';
import { logger } from '../../../utils/logger.js';
import { orderToApi } from '../../order/shared/order.mapper.js';
import SocketService from '../../socket/socket.service.js';
import { PAYABLE_STATUSES, settleOrder } from '../shared/payment.core.js';

function providerFor(orgSlug: string): KhaltiProvider {
  const { secretKey, gatewayUrl } = config.khalti;
  if (!secretKey || !config.app.defaultOrgSlug || orgSlug !== config.app.defaultOrgSlug) {
    throw AppError.badRequest('Khalti payment is not configured for this restaurant', 'KHALTI_NOT_CONFIGURED');
  }
  return new KhaltiProvider({ secretKey, gatewayUrl });
}

/** Where Khalti sends the guest back to (this API), then on to the frontend. */
const callbackUrl = () => config.khalti.returnUrl ?? `${config.app.apiUrl}/api/public/payments/khalti/callback`;
const resultUrl = (qrToken: string | null, params: Record<string, string>) =>
  `${config.app.frontendUrl}${qrToken ? `/t/${qrToken}` : '/order'}/payment-result?${new URLSearchParams(params)}`;

class PublicKhaltiService {
  initiate = async (qrToken: string, orderId: string) => {
    const table = await asPlatform('public: khalti table lookup', (db) => DiningTableRepository.findOrgByQrToken(db, qrToken));
    if (!table) throw AppError.notFound('Table not found');

    return withTenant({ orgId: table.orgId }, async (tx) => {
      const org = await tx.organization.findUniqueOrThrow({ where: { id: table.orgId }, select: { slug: true } });
      const khalti = providerFor(org.slug);

      await OrderRepository.lock(tx, orderId);
      const order = await OrderRepository.findById(tx, orderId);
      // Guests may only pay for orders at the table they scanned.
      if (!order || order.tableId !== table.id) throw AppError.notFound('Order not found');
      if (!(PAYABLE_STATUSES as readonly string[]).includes(order.status) || order.isPrepaid) {
        throw AppError.badRequest(`Cannot process payment for ${order.status.toLowerCase()} order`, 'ORDER_NOT_PAYABLE');
      }

      const open = await PaymentRepository.findOpenForOrder(tx, order.id);
      if (open?.status === 'Paid') throw AppError.badRequest('This order is already paid', 'PAYMENT_EXISTS');
      if (open && !open.khaltiPidx) throw AppError.badRequest('A payment is already being taken for this order', 'PAYMENT_EXISTS');
      // A pending Khalti attempt for an old total is dropped and replaced.
      if (open) await PaymentRepository.update(tx, open.id, { status: 'Failed' });

      const started = await khalti.initiate({
        amountPaisa: order.finalPaisa,
        purchaseOrderId: order.id,
        purchaseOrderName: `Order for ${order.customerName} - Table ${order.table.tableNumber}`,
        returnUrl: callbackUrl(),
        websiteUrl: config.app.frontendUrl,
      });
      const payment = await PaymentRepository.create(tx, {
        orgId: table.orgId,
        branchId: order.branchId,
        orderId: order.id,
        tableId: order.tableId,
        amountPaisa: order.finalPaisa,
        method: 'Khalti',
        status: 'Pending',
        khaltiPidx: started.pidx,
      });
      return { paymentId: payment.id, pidx: started.pidx, payment_url: started.payment_url, expires_at: started.expires_at };
    });
  };

  /** Returns the frontend URL to redirect the guest to. Safe to call repeatedly. */
  callback = async (pidx: string | undefined): Promise<string> => {
    if (!pidx) return resultUrl(null, { status: 'error', message: 'Missing payment identifier' });
    const found = await asPlatform('public: khalti callback lookup', (db) => PaymentRepository.findOrgByPidx(db, pidx));
    if (!found) return resultUrl(null, { status: 'error', message: 'Payment record not found' });

    try {
      const outcome = await withTenant({ orgId: found.orgId }, async (tx) => {
        await tx.$queryRaw`SELECT id FROM payments WHERE id = ${found.id}::uuid FOR UPDATE`;
        const payment = await tx.payment.findUniqueOrThrow({
          where: { id: found.id },
          include: { order: { select: { id: true, status: true, finalPaisa: true } }, table: { select: { qrToken: true } } },
        });
        const qrToken = payment.table?.qrToken ?? null;
        const done = { orderId: payment.orderId, qrToken };
        if (payment.status === 'Paid') return { ...done, status: 'success' as const, settled: false };
        if (payment.status !== 'Pending') return { ...done, status: 'failed' as const, settled: false };

        const org = await tx.organization.findUniqueOrThrow({ where: { id: found.orgId }, select: { slug: true } });
        const lookup = await providerFor(org.slug).lookup(pidx);

        if (lookup.status === 'Completed' && lookup.total_amount === payment.amountPaisa) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'Paid', transactionId: lookup.transaction_id ?? pidx, paymentTime: new Date() },
          });
          // Only settle if this still covers the whole order.
          const covers =
            payment.amountPaisa === payment.order.finalPaisa && (PAYABLE_STATUSES as readonly string[]).includes(payment.order.status);
          if (covers) await settleOrder(tx, payment.orderId);
          else logger.warn('Khalti payment no longer matches the order total; order left open for staff', { paymentId: payment.id });
          return { ...done, status: covers ? ('success' as const) : ('partial' as const), settled: covers };
        }
        if (lookup.status === 'Completed') {
          logger.error('Khalti amount mismatch', { paymentId: payment.id, expected: payment.amountPaisa, got: lookup.total_amount });
          return { ...done, status: 'failed' as const, settled: false };
        }
        if (lookup.status === 'Pending' || lookup.status === 'Initiated') return { ...done, status: 'pending' as const, settled: false };
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'Failed' } });
        return { ...done, status: 'failed' as const, settled: false };
      });

      if (outcome.settled) {
        const order = await withTenant({ orgId: found.orgId }, (tx) => OrderRepository.findById(tx, outcome.orderId));
        if (order) SocketService.emitOrderEvent(found.orgId, 'order:paid', { orderId: order.id, tableId: order.tableId, order: orderToApi(order) });
      }
      return resultUrl(outcome.qrToken, { status: outcome.status, orderId: outcome.orderId });
    } catch (error) {
      logger.error(`Khalti callback failed: ${(error as Error).message}`);
      return resultUrl(null, { status: 'error', message: 'Verification failed' });
    }
  };
}

export default new PublicKhaltiService();

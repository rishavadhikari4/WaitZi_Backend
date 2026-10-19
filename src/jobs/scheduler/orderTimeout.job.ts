// src/jobs/scheduler/orderTimeout.job.ts
// Every minute, cancel Pending orders the kitchen never accepted and free
// their tables. Replaces the old in-memory setTimeout map, which was lost on
// restart and double-fired with more than one server process. Orders already
// InKitchen are never auto-cancelled (the old manager cancelled those too,
// dropping orders that were simply slow to cook).
import { asPlatform } from '../../config/prisma.js';
import OrderRepository from '../../repository/order.repository.js';
import SocketService from '../../services/socket/socket.service.js';
import { logger } from '../../utils/logger.js';

export async function sweepExpiredOrders(): Promise<number> {
  const cancelled = await asPlatform('job: expire pending orders', (db) => OrderRepository.expirePending(db));
  for (const o of cancelled) {
    SocketService.emitOrderEvent(o.org_id, 'order:cancelled', { orderId: o.id, tableId: o.table_id });
  }
  if (cancelled.length) logger.info(`Auto-cancelled ${cancelled.length} expired order(s)`);
  return cancelled.length;
}

let timer: NodeJS.Timeout | undefined;

export function startOrderTimeoutJob(intervalMs = 60_000) {
  if (timer) return;
  const run = () => void sweepExpiredOrders().catch((err: Error) => logger.error(`Order timeout sweep failed: ${err.message}`));
  run();
  timer = setInterval(run, intervalMs);
}

export function stopOrderTimeoutJob() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

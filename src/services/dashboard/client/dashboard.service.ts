// src/services/dashboard/client/dashboard.service.ts
// Dashboard analytics, shaped like the old API so the existing charts keep
// working. Periods follow the restaurant's clock (Asia/Kathmandu).
import { withTenant, type TenantContext } from '../../../config/prisma.js';
import DashboardRepository, { type Granularity, type Range } from '../../../repository/dashboard.repository.js';
import OrderRepository from '../../../repository/order.repository.js';
import { toRupees, inOrder } from '../../../utils/Helpers.js';
import { DEFAULT_TIMEZONE, startOfDayIn } from '../../../utils/time.js';
import { orderToApi } from '../../order/shared/order.mapper.js';

export type Period = 'today' | 'yesterday' | 'week' | 'month' | 'year';

const DAY = 24 * 60 * 60 * 1000;
const tz = DEFAULT_TIMEZONE;

export function rangeFor(period: Period, now = new Date()): Range {
  const today = startOfDayIn(tz, now);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now); // YYYY-MM-DD local
  const [y, m] = ymd.split('-');
  switch (period) {
    case 'yesterday':
      return { start: new Date(today.getTime() - DAY), end: new Date(today.getTime() - 1) };
    case 'week':
      return { start: new Date(today.getTime() - 7 * DAY), end: now };
    case 'month':
      return { start: startOfDayIn(tz, new Date(`${y}-${m}-01T12:00:00Z`)), end: now };
    case 'year':
      return { start: startOfDayIn(tz, new Date(`${y}-01-01T12:00:00Z`)), end: now };
    case 'today':
    default:
      return { start: today, end: new Date(today.getTime() + DAY - 1) };
  }
}

const granularityFor = (p: Period): Granularity => (p === 'today' || p === 'yesterday' ? 'hour' : p === 'year' ? 'month' : 'day');

const trendRows = (rows: Awaited<ReturnType<typeof DashboardRepository.salesTrend>>) =>
  rows.map((x) => ({
    _id: {
      year: x.year,
      month: x.month,
      ...(x.day !== null && { day: x.day }),
      ...(x.hour !== null && { hour: x.hour }),
    },
    totalSales: toRupees(x.totalPaisa),
    orderCount: x.count,
  }));

const itemRows = (rows: Awaited<ReturnType<typeof DashboardRepository.itemSales>>) =>
  rows.map((x) => ({
    _id: x.id,
    name: x.name,
    category: x.category,
    totalQuantity: x.quantity,
    totalRevenue: toRupees(x.revenuePaisa),
  }));

class DashboardService {
  overview = (tenant: TenantContext, period: Period) =>
    withTenant(tenant, async (tx) => {
      const r = rangeFor(period);
      const [orders, payments, trend, items, tables, staff, recent, pending, [, available]] = await inOrder(
        () => DashboardRepository.orderSummary(tx, r),
        () => DashboardRepository.paymentTotals(tx, r),
        () => DashboardRepository.salesTrend(tx, r, granularityFor(period), tz),
        () => DashboardRepository.itemSales(tx, r),
        () => DashboardRepository.tables(tx),
        () => DashboardRepository.staff(tx),
        () => OrderRepository.recent(tx, 10),
        () => OrderRepository.find(tx, { status: 'Pending' }, { createdAt: 'asc' }),
        () => DashboardRepository.menuCounts(tx),
      );
      return {
        period,
        dateRange: r,
        overview: {
          orders: {
            totalOrders: orders.total,
            completedOrders: orders.completed,
            cancelledOrders: orders.cancelled,
            totalRevenue: toRupees(orders.revenuePaisa),
            averageOrderValue: toRupees(orders.avgPaisa),
          },
          payments: { totalPayments: payments.count, totalAmount: toRupees(payments.netPaisa) },
          totalTables: tables.total,
          availableMenuItems: available,
        },
        recentActivity: { orders: recent.map(orderToApi), pendingOrders: pending.map(orderToApi) },
        analytics: { salesTrends: trendRows(trend), popularItems: itemRows(items.filter((i) => i.quantity > 0).slice(0, 10)) },
        operations: { tableStatus: { total: tables.total, byStatus: tables.byStatus }, staffStats: staff },
      };
    });

  sales = (tenant: TenantContext, period: Period) =>
    withTenant(tenant, async (tx) => {
      const r = rangeFor(period);
      const g = granularityFor(period);
      const [totals, trend, methods, hourly, categories, customers] = await inOrder(
        () => DashboardRepository.paymentTotals(tx, r),
        () => DashboardRepository.salesTrend(tx, r, g, tz),
        () => DashboardRepository.paymentMethods(tx, r),
        () => DashboardRepository.hourly(tx, r, tz),
        () => DashboardRepository.categorySales(tx, r),
        () => DashboardRepository.topCustomers(tx, r),
      );
      return {
        period,
        groupBy: g,
        dateRange: r,
        summary: {
          totalSales: toRupees(totals.netPaisa),
          grossSales: toRupees(totals.grossPaisa),
          refunds: toRupees(totals.refundPaisa),
          totalTransactions: totals.count,
          averageTransaction: totals.count ? toRupees(Math.round(totals.grossPaisa / totals.count)) : 0,
        },
        trends: trendRows(trend),
        breakdowns: {
          paymentMethods: methods.map((m) => ({ _id: m.method, total: toRupees(m.totalPaisa), count: m.count })),
          hourlyDistribution: hourly.map((h) => ({ _id: h.hour, total: toRupees(h.totalPaisa), count: h.count })),
          categoryPerformance: categories.map((c) => ({ _id: c.id, name: c.name, totalQuantity: c.quantity, totalRevenue: toRupees(c.revenuePaisa) })),
        },
        customers: customers.map((c) => ({ _id: c.name, orderCount: c.orders, totalSpent: toRupees(c.spentPaisa) })),
      };
    });

  operations = (tenant: TenantContext, period: Period) =>
    withTenant(tenant, async (tx) => {
      const r = rangeFor(period);
      const [orders, live, tables, staff, distribution] = await inOrder(
        () => DashboardRepository.orderSummary(tx, r),
        () => DashboardRepository.liveCounts(tx),
        () => DashboardRepository.tables(tx),
        () => DashboardRepository.staff(tx),
        () => DashboardRepository.statusDistribution(tx, r),
      );
      const rate = orders.total ? ((orders.cancelled / orders.total) * 100).toFixed(1) : '0';
      return {
        period,
        dateRange: r,
        kitchen: { activeOrders: live.pending + live.kitchen, pendingOrders: live.pending, inKitchen: live.kitchen },
        service: { totalOrders: orders.total, cancelledOrders: orders.cancelled, cancellationRate: `${rate}%` },
        tables: {
          total: tables.total,
          byStatus: tables.byStatus,
          utilization: { totalCapacity: tables.totalCapacity, occupiedCapacity: tables.occupiedCapacity },
        },
        staff,
        orders: {
          statusDistribution: distribution.map((d) => ({ _id: d.status, count: d.count })),
          averageValue: toRupees(orders.avgPaisa),
        },
      };
    });

  menu = (tenant: TenantContext, period: Period, categoryId?: string) =>
    withTenant(tenant, async (tx) => {
      const r = rangeFor(period);
      const [items, categories, [totalItems, available, outOfStock]] = await inOrder(
        () => DashboardRepository.itemSales(tx, r, categoryId),
        () => DashboardRepository.categorySales(tx, r),
        () => DashboardRepository.menuCounts(tx),
      );
      const rows = itemRows(items);
      return {
        period,
        dateRange: r,
        categoryFilter: categoryId ?? 'all',
        summary: {
          totalItemsSold: items.reduce((s, i) => s + i.quantity, 0),
          totalMenuItems: totalItems,
          availableItems: available,
          outOfStockItems: outOfStock.length,
        },
        performance: {
          topSelling: rows.filter((i) => i.totalQuantity > 0).slice(0, 10),
          underPerforming: [...rows].reverse().slice(0, 10),
        },
        analytics: {
          categoryBreakdown: categories.map((c) => ({ _id: c.id, name: c.name, totalQuantity: c.quantity, totalRevenue: toRupees(c.revenuePaisa) })),
          // Needs ingredient costs (Stage 5: stock and recipes); empty until then.
          profitability: [],
        },
        alerts: outOfStock.map((m) => ({ _id: m.id, name: m.name })),
      };
    });

  realTime = (tenant: TenantContext) =>
    withTenant(tenant, async (tx) => {
      const [live, tables, staff, today] = await inOrder(
        () => DashboardRepository.liveCounts(tx),
        () => DashboardRepository.tables(tx),
        () => DashboardRepository.staff(tx),
        () => DashboardRepository.paymentTotals(tx, rangeFor('today')),
      );
      return {
        activeOrders: live.active,
        pendingOrders: live.pending,
        kitchenQueue: live.kitchen,
        availableTables: tables.byStatus.available,
        occupiedTables: tables.byStatus.occupied,
        staffOnDuty: staff.active,
        totalRevenue: toRupees(today.netPaisa),
        lastUpdated: new Date().toISOString(),
      };
    });
}

export default new DashboardService();

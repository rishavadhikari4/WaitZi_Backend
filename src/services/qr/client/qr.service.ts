// src/services/qr/client/qr.service.ts
// Table QR codes. New stickers point at /t/<qrToken>: an unguessable token
// instead of a table number, so one restaurant's tables can't be enumerated
// and the link works across organizations.
import QRCode, { type QRCodeRenderersOptions } from 'qrcode';

import config from '../../../config/config.js';
import { withTenant, type TenantContext } from '../../../config/prisma.js';
import DiningTableRepository from '../../../repository/diningTable.repository.js';
import { AppError } from '../../../utils/AppError.js';

const QR_OPTIONS: QRCodeRenderersOptions & { errorCorrectionLevel: 'M' } = {
  width: 300,
  margin: 2,
  color: { dark: '#000000', light: '#FFFFFF' },
  errorCorrectionLevel: 'M',
};

export const orderingUrl = (qrToken: string) => `${config.app.frontendUrl}/t/${qrToken}`;

type QrTable = { id: string; tableNumber: number; capacity: number; status: string; qrToken: string; branchId: string };

async function loadTable(tenant: TenantContext, id: string, memberBranchIds: string[]): Promise<QrTable> {
  const table = await withTenant(tenant, (tx) => DiningTableRepository.findById(tx, id));
  if (!table || (memberBranchIds.length && !memberBranchIds.includes(table.branchId))) {
    throw AppError.notFound('Table not found');
  }
  return table;
}

const tableSummary = (t: QrTable) => ({ id: t.id, tableNumber: t.tableNumber, capacity: t.capacity, status: t.status });

class ClientQrService {
  generate = async (tenant: TenantContext, tableId: string, format: 'png' | 'url' | 'svg', memberBranchIds: string[]) => {
    const table = await loadTable(tenant, tableId, memberBranchIds);
    const qrData = orderingUrl(table.qrToken);
    if (format === 'url') return { qrData, table: tableSummary(table) };
    return { qrCode: await QRCode.toDataURL(qrData, QR_OPTIONS), qrData, table: tableSummary(table) };
  };

  generateAll = async (tenant: TenantContext, format: 'png' | 'url' | 'svg', memberBranchIds: string[]) => {
    const tables = await withTenant(tenant, (tx) =>
      DiningTableRepository.listAllOrdered(tx, memberBranchIds.length ? memberBranchIds : undefined),
    );
    if (!tables.length) throw AppError.notFound('No tables found', 'NO_TABLES');
    return Promise.all(
      tables.map(async (t) => {
        const qrData = orderingUrl(t.qrToken);
        return format === 'url'
          ? { table: tableSummary(t), qrData }
          : { table: tableSummary(t), qrCode: await QRCode.toDataURL(qrData, QR_OPTIONS), qrData };
      }),
    );
  };

  download = async (tenant: TenantContext, tableId: string, format: 'png' | 'url' | 'svg', memberBranchIds: string[]) => {
    const table = await loadTable(tenant, tableId, memberBranchIds);
    const qrData = orderingUrl(table.qrToken);
    if (format === 'svg') {
      return {
        body: await QRCode.toString(qrData, { ...QR_OPTIONS, type: 'svg' }),
        contentType: 'image/svg+xml',
        filename: `table-${table.tableNumber}-qr.svg`,
      };
    }
    return {
      body: await QRCode.toBuffer(qrData, { ...QR_OPTIONS, type: 'png' }),
      contentType: 'image/png',
      filename: `table-${table.tableNumber}-qr.png`,
    };
  };

  /**
   * Real order counts for the table. Scans aren't tracked, so those fields are
   * null rather than the made-up zeros the old endpoint returned.
   */
  analytics = async (tenant: TenantContext, tableId: string, memberBranchIds: string[]) => {
    const table = await loadTable(tenant, tableId, memberBranchIds);
    const orders = await withTenant(tenant, (tx) => DiningTableRepository.orderStats(tx, tableId));
    return {
      table: { id: table.id, tableNumber: table.tableNumber, capacity: table.capacity },
      qrData: orderingUrl(table.qrToken),
      analytics: {
        totalScans: null,
        uniqueScans: null,
        ordersFromScans: orders._count._all,
        conversionRate: null,
        lastOrderAt: orders._max.createdAt,
      },
      note: 'Scan counts are not tracked yet; order counts are real.',
    };
  };
}

export default new ClientQrService();

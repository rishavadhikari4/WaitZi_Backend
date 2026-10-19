// src/services/table/client/table.service.ts
import { withTenant, type TenantContext, type TenantTx } from '../../../config/prisma.js';
import DiningTableRepository, { type TableRow } from '../../../repository/diningTable.repository.js';
import { AppError } from '../../../utils/AppError.js';
import { paginationMeta } from '../../../utils/Helpers.js';
import type { CreateTableInput, TableQuery, UpdateTableInput } from '../../../validators/table.schema.js';
import { resolveBranchId } from '../../branch/branch.resolver.js';
import { tableToApi } from '../shared/table.mapper.js';

type TableStatus = 'Available' | 'Occupied' | 'Reserved';

/** Staff tied to specific branches only see those branches' tables (404 otherwise). */
async function requireTable(tx: TenantTx, id: string, memberBranchIds: string[]): Promise<TableRow> {
  const table = await DiningTableRepository.findById(tx, id);
  if (!table || (memberBranchIds.length && !memberBranchIds.includes(table.branchId))) {
    throw AppError.notFound('Table not found');
  }
  return table;
}

/** '' / null clear the waiter; undefined leaves it alone. */
const waiterUpdate = (w: string | null | undefined) =>
  w === undefined ? {} : { assignedWaiterId: w === '' || w === null ? null : w };

class ClientTableService {
  list = (tenant: TenantContext, q: TableQuery, memberBranchIds: string[]) =>
    withTenant(tenant, async (tx) => {
      if (q.branch && memberBranchIds.length && !memberBranchIds.includes(q.branch)) {
        throw AppError.forbidden('You do not work at that branch', 'BRANCH_FORBIDDEN');
      }
      const branchIds = q.branch ? [q.branch] : memberBranchIds;
      const { items, total } = await DiningTableRepository.list(
        tx,
        {
          ...(q.status && { status: q.status }),
          ...(q.capacity !== undefined && { capacity: q.capacity }),
          ...(q.assignedWaiter && { assignedWaiterId: q.assignedWaiter }),
          ...(branchIds.length && { branchIds }),
        },
        { skip: (q.page - 1) * q.limit, take: q.limit },
        { [q.sortBy]: q.sortOrder },
      );
      const s = await DiningTableRepository.stats(tx, branchIds.length ? branchIds : undefined);
      const count = (status: TableStatus) => s.byStatus.find((r) => r.status === status)?._count._all ?? 0;
      return {
        tables: items.map(tableToApi),
        pagination: paginationMeta(q.page, q.limit, total),
        stats: {
          total: s.total,
          totalCapacity: s.totalCapacity,
          available: count('Available'),
          occupied: count('Occupied'),
          reserved: count('Reserved'),
        },
      };
    });

  get = (tenant: TenantContext, id: string, memberBranchIds: string[]) =>
    withTenant(tenant, async (tx) => tableToApi(await requireTable(tx, id, memberBranchIds)));

  create = (tenant: TenantContext, input: CreateTableInput, memberBranchIds: string[]) =>
    withTenant(tenant, async (tx) => {
      const branchId = await resolveBranchId(tx, input.branchId, memberBranchIds);
      if (await DiningTableRepository.findByNumber(tx, branchId, input.tableNumber)) {
        throw AppError.conflict(`Table ${input.tableNumber} already exists`, 'TABLE_NUMBER_TAKEN');
      }
      const table = await DiningTableRepository.create(tx, {
        orgId: tenant.orgId,
        branchId,
        tableNumber: input.tableNumber,
        capacity: input.capacity,
        ...waiterUpdate(input.assignedWaiter),
      });
      return tableToApi(table);
    });

  update = (tenant: TenantContext, id: string, input: UpdateTableInput, memberBranchIds: string[]) =>
    withTenant(tenant, async (tx) => {
      const table = await requireTable(tx, id, memberBranchIds);
      if (input.tableNumber !== undefined && input.tableNumber !== table.tableNumber) {
        if (await DiningTableRepository.findByNumber(tx, table.branchId, input.tableNumber)) {
          throw AppError.conflict(`Table ${input.tableNumber} already exists`, 'TABLE_NUMBER_TAKEN');
        }
      }
      const updated = await DiningTableRepository.update(tx, id, {
        ...(input.tableNumber !== undefined && { tableNumber: input.tableNumber }),
        ...(input.capacity !== undefined && { capacity: input.capacity }),
        ...(input.status && { status: input.status }),
        ...waiterUpdate(input.assignedWaiter),
      });
      return tableToApi(updated);
    });

  updateStatus = (tenant: TenantContext, id: string, status: TableStatus, memberBranchIds: string[]) =>
    withTenant(tenant, async (tx) => {
      await requireTable(tx, id, memberBranchIds);
      return tableToApi(await DiningTableRepository.update(tx, id, { status }));
    });

  /** Frees the table for the next guests. */
  clear = (tenant: TenantContext, id: string, memberBranchIds: string[]) =>
    withTenant(tenant, async (tx) => {
      await requireTable(tx, id, memberBranchIds);
      return tableToApi(await DiningTableRepository.update(tx, id, { currentOrderId: null, status: 'Available' }));
    });

  remove = (tenant: TenantContext, id: string, memberBranchIds: string[]) =>
    withTenant(tenant, async (tx) => {
      const table = await requireTable(tx, id, memberBranchIds);
      if (table.currentOrderId) throw AppError.badRequest('Cannot delete table with active order', 'TABLE_IN_USE');
      const history = await DiningTableRepository.orderStats(tx, id);
      if (history._count._all > 0) {
        throw AppError.badRequest(
          `Table ${table.tableNumber} has ${history._count._all} past order(s) and is kept for your records`,
          'TABLE_HAS_HISTORY',
        );
      }
      await DiningTableRepository.delete(tx, id);
      return { deletedTable: { id: table.id, tableNumber: table.tableNumber } };
    });
}

export default new ClientTableService();

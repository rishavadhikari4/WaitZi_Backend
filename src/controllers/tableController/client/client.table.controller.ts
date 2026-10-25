// src/controllers/tableController/client/client.table.controller.ts
import type { Request, Response } from 'express';

import { getValidatedParams, getValidatedQuery } from '../../../middleware/validate.middleware.js';
import ClientQrService from '../../../services/qr/client/qr.service.js';
import ClientTableService from '../../../services/table/client/table.service.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import { floorScope } from '../../../utils/scope.js';
import type { CreateTableInput, TableQuery, UpdateTableInput } from '../../../validators/table.schema.js';
import BaseController from '../../base.controller.js';

type IdParams = { id: string };
type Format = { format: 'png' | 'url' | 'svg' };

class ClientTableController extends BaseController {
  private scope = (req: Request) => floorScope(this.actor(req));

  getTables = async (req: Request, res: Response) => {
    try {
      const q = getValidatedQuery<TableQuery>(res);
      const { tables, pagination, stats } = await ClientTableService.list(this.tenant(req), q, this.scope(req));
      return ApiResponse.success(res, tables, 'Tables retrieved successfully', 200, {
        pagination,
        stats,
        meta: {
          filter: { status: q.status ?? 'all', capacity: q.capacity ?? null, assignedWaiter: q.assignedWaiter ?? null },
          sort: { field: q.sortBy, order: q.sortOrder },
        },
      });
    } catch (error) {
      return this.sendError(res, error, 'ClientTableController.getTables', 'Failed to fetch tables');
    }
  };

  getTable = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientTableService.get(this.tenant(req), id, this.scope(req));
      return ApiResponse.success(res, data, 'Table retrieved successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientTableController.getTable', 'Failed to fetch table');
    }
  };

  createTable = async (req: Request, res: Response) => {
    try {
      const data = await ClientTableService.create(this.tenant(req), req.body as CreateTableInput, this.scope(req));
      return ApiResponse.created(res, data, 'Table created successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientTableController.createTable', 'Failed to create table');
    }
  };

  updateTable = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientTableService.update(this.tenant(req), id, req.body as UpdateTableInput, this.scope(req));
      return ApiResponse.success(res, data, 'Table updated successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientTableController.updateTable', 'Failed to update table');
    }
  };

  updateTableStatus = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const { status } = req.body as { status: 'Available' | 'Occupied' | 'Reserved' };
      const data = await ClientTableService.updateStatus(this.tenant(req), id, status, this.scope(req));
      return ApiResponse.success(res, data, 'Table status updated successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientTableController.updateTableStatus', 'Failed to update table status');
    }
  };

  clearTable = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientTableService.clear(this.tenant(req), id, this.scope(req));
      return ApiResponse.success(res, data, 'Table cleared successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientTableController.clearTable', 'Failed to clear table');
    }
  };

  deleteTable = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientTableService.remove(this.tenant(req), id, this.scope(req));
      return ApiResponse.success(res, data, 'Table deleted successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientTableController.deleteTable', 'Failed to delete table');
    }
  };

  // ── QR codes ──────────────────────────────────────────────────────────────

  generateQr = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const { format } = getValidatedQuery<Format>(res);
      const data = await ClientQrService.generate(this.tenant(req), id, format, this.scope(req).branchIds);
      return ApiResponse.success(res, data, 'QR code generated successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientTableController.generateQr', 'Failed to generate QR code');
    }
  };

  generateAllQrs = async (req: Request, res: Response) => {
    try {
      const { format } = getValidatedQuery<Format>(res);
      const data = await ClientQrService.generateAll(this.tenant(req), format, this.scope(req).branchIds);
      return ApiResponse.success(res, data, 'QR codes generated successfully', 200, { meta: { totalTables: data.length, format } });
    } catch (error) {
      return this.sendError(res, error, 'ClientTableController.generateAllQrs', 'Failed to generate QR codes');
    }
  };

  downloadQr = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const { format } = getValidatedQuery<Format>(res);
      const file = await ClientQrService.download(this.tenant(req), id, format, this.scope(req).branchIds);
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      return res.send(file.body);
    } catch (error) {
      return this.sendError(res, error, 'ClientTableController.downloadQr', 'Failed to download QR code');
    }
  };

  qrAnalytics = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientQrService.analytics(this.tenant(req), id, this.scope(req).branchIds);
      return ApiResponse.success(res, data, 'QR analytics retrieved successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientTableController.qrAnalytics', 'Failed to fetch QR analytics');
    }
  };
}

export default new ClientTableController();

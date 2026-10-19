// src/controllers/orderingController/public/public.ordering.controller.ts
import type { Request, Response } from 'express';

import { getValidatedParams, getValidatedQuery } from '../../../middleware/validate.middleware.js';
import PublicOrderingService, { type TableLocator } from '../../../services/ordering/public/orderingPage.service.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import BaseController from '../../base.controller.js';

class PublicOrderingController extends BaseController {
  private send = async (res: Response, loc: TableLocator) => {
    try {
      const data = await PublicOrderingService.getOrderingPage(loc);
      return ApiResponse.success(res, data, 'Ordering page data retrieved successfully');
    } catch (error) {
      return this.sendError(res, error, 'PublicOrderingController', 'Failed to load the menu');
    }
  };

  /** New stickers: /t/<qrToken>. */
  byQrToken = (_req: Request, res: Response) =>
    this.send(res, { kind: 'qrToken', value: getValidatedParams<{ qrToken: string }>(res).qrToken });

  /** Table uuid, or a Mongo _id from a sticker printed before the Postgres move. */
  byTableId = (_req: Request, res: Response) =>
    this.send(res, { kind: 'id', value: getValidatedParams<{ tableId: string }>(res).tableId });

  /** Number-only links: needs ?org=<slug> unless DEFAULT_ORG_SLUG is set. */
  byTableNumber = (_req: Request, res: Response) =>
    this.send(res, {
      kind: 'number',
      value: getValidatedParams<{ tableNumber: number }>(res).tableNumber,
      orgSlug: getValidatedQuery<{ org?: string }>(res).org,
    });
}

export default new PublicOrderingController();

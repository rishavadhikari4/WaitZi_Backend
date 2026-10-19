// src/controllers/paymentController/public/public.khalti.controller.ts
import type { Request, Response } from 'express';

import { getValidatedQuery } from '../../../middleware/validate.middleware.js';
import PublicKhaltiService from '../../../services/payment/public/khalti.service.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import BaseController from '../../base.controller.js';

class PublicKhaltiController extends BaseController {
  initiate = async (req: Request, res: Response) => {
    try {
      const { qrToken, orderId } = req.body as { qrToken: string; orderId: string };
      const data = await PublicKhaltiService.initiate(qrToken, orderId);
      return ApiResponse.success(res, data, 'Khalti payment initiated');
    } catch (error) {
      return this.sendError(res, error, 'PublicKhaltiController.initiate', 'Failed to start payment');
    }
  };

  /** Khalti redirects the guest's browser here; we verify, then send them on. */
  callback = async (_req: Request, res: Response) => {
    const { pidx } = getValidatedQuery<{ pidx?: string }>(res);
    res.redirect(await PublicKhaltiService.callback(pidx));
  };
}

export default new PublicKhaltiController();

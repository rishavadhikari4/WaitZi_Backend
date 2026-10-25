// src/controllers/approvalController/client/client.approval.controller.ts
import type { Request, Response } from 'express';

import ClientApprovalService from '../../../services/approval/approval.service.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import type { RequestApprovalInput, SetPinInput } from '../../../validators/approval.schema.js';
import BaseController from '../../base.controller.js';

class ClientApprovalController extends BaseController {
  requestApproval = async (req: Request, res: Response) => {
    try {
      const data = await ClientApprovalService.request(this.tenant(req), this.actor(req), req.body as RequestApprovalInput);
      return ApiResponse.success(res, data, 'Approved');
    } catch (error) {
      return this.sendError(res, error, 'ClientApprovalController.requestApproval', 'Failed to get approval');
    }
  };

  setPin = async (req: Request, res: Response) => {
    try {
      const { pin, currentPassword } = req.body as SetPinInput;
      return ApiResponse.success(res, await ClientApprovalService.setPin(this.tenant(req), pin, currentPassword), 'Approval PIN saved');
    } catch (error) {
      return this.sendError(res, error, 'ClientApprovalController.setPin', 'Failed to save PIN');
    }
  };
}

export default new ClientApprovalController();

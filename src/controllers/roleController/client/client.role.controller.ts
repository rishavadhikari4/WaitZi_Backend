// src/controllers/roleController/client/client.role.controller.ts
import type { Request, Response } from 'express';

import { PERMISSIONS } from '../../../constants/permissions.js';
import { getValidatedParams } from '../../../middleware/validate.middleware.js';
import ClientRoleService from '../../../services/role/client/role.service.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import type { CreateRoleInput, UpdateRoleInput } from '../../../validators/role.schema.js';
import BaseController from '../../base.controller.js';

type IdParams = { id: string };

class ClientRoleController extends BaseController {
  getRoles = async (req: Request, res: Response) => {
    try {
      return ApiResponse.success(res, await ClientRoleService.list(this.tenant(req)), 'Roles fetched successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientRoleController.getRoles', 'Failed to fetch roles');
    }
  };

  /** The permission catalog, for the role editor UI. */
  getPermissions = async (_req: Request, res: Response) =>
    ApiResponse.success(
      res,
      Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description })),
      'Permissions fetched successfully',
    );

  getRole = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      return ApiResponse.success(res, await ClientRoleService.get(this.tenant(req), id), 'Role retrieved successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientRoleController.getRole', 'Failed to fetch role');
    }
  };

  createRole = async (req: Request, res: Response) => {
    try {
      const data = await ClientRoleService.create(this.tenant(req), req.body as CreateRoleInput);
      return ApiResponse.created(res, data, 'Role created successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientRoleController.createRole', 'Failed to create role');
    }
  };

  updateRole = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientRoleService.update(this.tenant(req), id, req.body as UpdateRoleInput);
      return ApiResponse.success(res, data, 'Role updated successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientRoleController.updateRole', 'Failed to update role');
    }
  };

  deleteRole = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientRoleService.remove(this.tenant(req), id);
      return ApiResponse.success(res, data, 'Role deleted successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientRoleController.deleteRole', 'Failed to delete role');
    }
  };
}

export default new ClientRoleController();

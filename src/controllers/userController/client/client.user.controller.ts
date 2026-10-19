// src/controllers/userController/client/client.user.controller.ts
import type { Request, Response } from 'express';

import { getValidatedParams, getValidatedQuery } from '../../../middleware/validate.middleware.js';
import ClientUserService from '../../../services/user/client/user.service.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import type { CreateMemberInput, MemberQuery, UpdateMemberInput, UpdateProfileInput } from '../../../validators/user.schema.js';
import BaseController from '../../base.controller.js';

type IdParams = { id: string };

class ClientUserController extends BaseController {
  getMembers = async (req: Request, res: Response) => {
    try {
      const query = getValidatedQuery<MemberQuery>(res);
      const { members, pagination, stats } = await ClientUserService.list(this.tenant(req), query);
      return ApiResponse.success(res, members, 'Users retrieved successfully', 200, {
        pagination,
        stats,
        meta: {
          filter: { role: query.role ?? 'all', status: query.status ?? 'all', search: query.search ?? null },
          sort: { field: query.sortBy, order: query.sortOrder },
        },
      });
    } catch (error) {
      return this.sendError(res, error, 'ClientUserController.getMembers', 'Failed to fetch users');
    }
  };

  getMember = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      return ApiResponse.success(res, await ClientUserService.get(this.tenant(req), id), 'User retrieved successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientUserController.getMember', 'Failed to fetch user');
    }
  };

  getMembersByRole = async (req: Request, res: Response) => {
    try {
      const { roleId } = getValidatedParams<{ roleId: string }>(res);
      const { status } = getValidatedQuery<{ status: 'Active' | 'Inactive' | 'all' }>(res);
      const data = await ClientUserService.listByRole(this.tenant(req), roleId, status);
      return ApiResponse.success(res, data, 'Users by role retrieved successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientUserController.getMembersByRole', 'Failed to fetch users by role');
    }
  };

  createMember = async (req: Request, res: Response) => {
    try {
      const data = await ClientUserService.create(this.tenant(req), req.body as CreateMemberInput);
      return ApiResponse.created(res, data, 'User created successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientUserController.createMember', 'Failed to create user');
    }
  };

  updateMember = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientUserService.update(this.tenant(req), id, req.body as UpdateMemberInput, req.file?.buffer);
      return ApiResponse.success(res, data, 'User updated successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientUserController.updateMember', 'Failed to update user');
    }
  };

  updateMemberStatus = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const { status } = req.body as { status: 'Active' | 'Inactive' };
      const data = await ClientUserService.updateStatus(this.tenant(req), id, status);
      return ApiResponse.success(res, data, 'User status updated successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientUserController.updateMemberStatus', 'Failed to update user status');
    }
  };

  removeMember = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientUserService.remove(this.tenant(req), id);
      return ApiResponse.success(res, data, 'User removed successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientUserController.removeMember', 'Failed to remove user');
    }
  };

  resetMemberPassword = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientUserService.resetMemberPassword(this.tenant(req), id);
      return ApiResponse.success(res, data, 'Temporary password generated successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientUserController.resetMemberPassword', 'Failed to generate temporary password');
    }
  };

  // ── Self-service ──────────────────────────────────────────────────────────

  getProfile = async (req: Request, res: Response) => {
    try {
      return ApiResponse.success(res, await ClientUserService.getProfile(this.tenant(req)), 'Profile retrieved successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientUserController.getProfile', 'Failed to fetch profile');
    }
  };

  updateProfile = async (req: Request, res: Response) => {
    try {
      const data = await ClientUserService.updateProfile(this.tenant(req), req.body as UpdateProfileInput, req.file?.buffer);
      return ApiResponse.success(res, data, 'Profile updated successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientUserController.updateProfile', 'Failed to update profile');
    }
  };

  changeOwnPassword = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
      await ClientUserService.changeOwnPassword(this.tenant(req), id, currentPassword, newPassword);
      return ApiResponse.success(res, undefined, 'Password updated successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientUserController.changeOwnPassword', 'Failed to update password');
    }
  };
}

export default new ClientUserController();

// src/controllers/authController/password.controller.ts
import type { Request, Response } from 'express';

import { getValidatedParams } from '../../middleware/validate.middleware.js';
import PasswordService from '../../services/auth/password.service.js';
import ApiResponse from '../../utils/ApiResponse.js';
import type { ChangePasswordInput, ResetPasswordInput } from '../../validators/auth.schema.js';
import BaseController from '../base.controller.js';

const GENERIC_FORGOT = 'If an account with that email exists, a reset link has been sent';

class PasswordController extends BaseController {
  forgotPassword = async (req: Request, res: Response) => {
    try {
      const { dev } = await PasswordService.forgotPassword((req.body as { email: string }).email);
      return ApiResponse.success(res, undefined, GENERIC_FORGOT, 200, dev ? { developmentOnly: dev } : {});
    } catch (error) {
      return this.sendError(res, error, 'PasswordController.forgotPassword');
    }
  };

  validateResetToken = async (_req: Request, res: Response) => {
    try {
      const { token } = getValidatedParams<{ token: string }>(res);
      const data = await PasswordService.validateResetToken(token);
      return ApiResponse.success(res, data, 'Reset token is valid');
    } catch (error) {
      return this.sendError(res, error, 'PasswordController.validateResetToken');
    }
  };

  resetPassword = async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body as ResetPasswordInput;
      await PasswordService.resetPassword(token, newPassword);
      return ApiResponse.success(res, undefined, 'Password reset successful. You can now log in with your new password.');
    } catch (error) {
      return this.sendError(res, error, 'PasswordController.resetPassword');
    }
  };

  changePassword = async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body as ChangePasswordInput;
      await PasswordService.changePassword(this.tenant(req), currentPassword, newPassword);
      return ApiResponse.success(res, undefined, 'Password changed successfully');
    } catch (error) {
      return this.sendError(res, error, 'PasswordController.changePassword');
    }
  };
}

export default new PasswordController();

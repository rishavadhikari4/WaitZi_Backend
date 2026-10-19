// src/controllers/authController/auth.controller.ts
import type { Request, Response } from 'express';

import AuthService, { type TokenPair } from '../../services/auth/auth.service.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { AppError } from '../../utils/AppError.js';
import { ACCESS_COOKIE_MS, REFRESH_COOKIE_MS, authCookieOptions } from '../../utils/tokens.js';
import type { LoginInput } from '../../validators/auth.schema.js';
import BaseController from '../base.controller.js';

function setAuthCookies(res: Response, tokens: TokenPair) {
  res.cookie('refreshToken', tokens.refreshToken, { ...authCookieOptions, maxAge: REFRESH_COOKIE_MS });
  res.cookie('accessToken', tokens.accessToken, { ...authCookieOptions, maxAge: ACCESS_COOKIE_MS });
}

class AuthController extends BaseController {
  login = async (req: Request, res: Response) => {
    try {
      const result = await AuthService.login(req.body as LoginInput);

      if (result.kind === 'choose-organization') {
        return ApiResponse.success(res, { requiresOrganization: true, organizations: result.organizations }, 'Select an organization to continue');
      }

      setAuthCookies(res, result.tokens);
      return ApiResponse.success(
        res,
        {
          user: result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          expiresIn: result.tokens.expiresIn,
          mustChangePassword: result.mustChangePassword,
          scope: result.kind,
        },
        result.mustChangePassword ? 'Login successful. You must change your password.' : 'Login successful',
        200,
        { meta: { loginTime: new Date().toISOString(), tokenType: 'Bearer' } },
      );
    } catch (error) {
      return this.sendError(res, error, 'AuthController.login', 'Login failed');
    }
  };

  refreshToken = async (req: Request, res: Response) => {
    try {
      const token =
        (req.cookies as Record<string, string> | undefined)?.['refreshToken'] ??
        (req.body as { refreshToken?: string } | undefined)?.refreshToken;
      if (!token) throw AppError.unauthorized('Refresh token is required', 'TOKEN_MISSING');

      const tokens = await AuthService.refresh(token);
      setAuthCookies(res, tokens);
      return ApiResponse.success(
        res,
        { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresIn: tokens.expiresIn },
        'Token refreshed successfully',
      );
    } catch (error) {
      return this.sendError(res, error, 'AuthController.refreshToken', 'Token refresh failed');
    }
  };

  logout = async (_req: Request, res: Response) => {
    res.clearCookie('refreshToken', authCookieOptions);
    res.clearCookie('accessToken', authCookieOptions);
    return ApiResponse.success(res, undefined, 'Logout successful');
  };

  /** GET /auth/verify — authMiddleware has already validated the token. */
  verify = async (req: Request, res: Response) => {
    try {
      const { orgId, userId } = this.tenant(req);
      const user = await AuthService.me(orgId, userId!);
      return ApiResponse.success(res, { user, isNearExpiry: res.getHeader('X-Token-Warning') !== undefined }, 'Token is valid');
    } catch (error) {
      return this.sendError(res, error, 'AuthController.verify', 'Token verification failed');
    }
  };
}

export default new AuthController();

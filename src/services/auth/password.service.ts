// src/services/auth/password.service.ts
import crypto from 'node:crypto';

import config from '../../config/config.js';
import { asPlatform, withTenant, type TenantContext } from '../../config/prisma.js';
import UserRepository from '../../repository/user.repository.js';
import UserOrganizationRepository from '../../repository/userOrganization.repository.js';
import { AppError } from '../../utils/AppError.js';
import { hashPassword, verifyPassword } from '../../utils/Helpers.js';
import { logger } from '../../utils/logger.js';
import EmailService from '../email/email.service.js';

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

class PasswordService {
  /** Always resolves the same way whether or not the email exists. */
  forgotPassword = async (email: string) => {
    const user = await asPlatform('password: forgot lookup', (db) => UserRepository.findActiveByEmail(db, email));
    if (!user) return { dev: undefined };

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await asPlatform('password: store reset token', (db) =>
      UserRepository.update(db, user.id, { resetPasswordToken: sha256(resetToken), resetPasswordExpires: expiresAt }),
    );

    const resetUrl = `${config.app.frontendUrl}/reset-password/${resetToken}`;
    try {
      await EmailService.sendPasswordReset(user.email, resetUrl, user.firstName);
    } catch {
      // Already logged by EmailService; the response must not reveal it.
    }
    return { dev: config.app.env === 'development' ? { resetToken, resetUrl, expiresAt } : undefined };
  };

  validateResetToken = async (token: string) => {
    const user = await asPlatform('password: validate reset token', (db) =>
      UserRepository.findByValidResetToken(db, sha256(token)),
    );
    if (!user?.resetPasswordExpires) throw AppError.badRequest('Invalid or expired reset token', 'RESET_TOKEN_INVALID');
    return {
      email: user.email,
      expiresAt: user.resetPasswordExpires,
      timeRemaining: Math.max(0, Math.floor((user.resetPasswordExpires.getTime() - Date.now()) / 1000)),
    };
  };

  resetPassword = async (token: string, newPassword: string) => {
    const passwordHash = await hashPassword(newPassword);
    await asPlatform('password: reset', async (db) => {
      const user = await UserRepository.findByValidResetToken(db, sha256(token));
      if (!user) throw AppError.badRequest('Invalid or expired reset token', 'RESET_TOKEN_INVALID');
      await UserRepository.update(db, user.id, {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      });
      logger.info(`Password reset for user ${user.id}`);
    });
  };

  changePassword = async (tenant: TenantContext, currentPassword: string, newPassword: string) => {
    const userId = tenant.userId!;
    await withTenant(tenant, async (tx) => {
      const user = await UserRepository.findById(tx, userId);
      if (!user) throw AppError.notFound('User not found');
      if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        throw AppError.badRequest('Current password is incorrect', 'WRONG_PASSWORD');
      }
      await UserRepository.update(tx, userId, {
        passwordHash: await hashPassword(newPassword),
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      });
    });
  };

  /**
   * Admin sets a one-time password for a member. Refused for people who also
   * belong to another organization: one org must not take over an account
   * another org relies on.
   */
  generateTemporaryPassword = async (tenant: TenantContext, memberUserId: string) => {
    const orgCount = await asPlatform('password: temp password org check', (db) =>
      UserOrganizationRepository.countOrgsForUser(db, memberUserId),
    );
    if (orgCount > 1) {
      throw AppError.forbidden(
        'This person also belongs to another organization; ask them to use "Forgot password" instead',
        'SHARED_ACCOUNT',
      );
    }
    const tempPassword = crypto.randomBytes(9).toString('base64url');
    const user = await withTenant(tenant, async (tx) => {
      const member = await UserOrganizationRepository.findMember(tx, tenant.orgId, memberUserId);
      if (!member) throw AppError.notFound('User not found');
      return UserRepository.update(tx, memberUserId, {
        passwordHash: await hashPassword(tempPassword),
        passwordChangedAt: new Date(),
        mustChangePassword: true,
      });
    });
    return { temporaryPassword: tempPassword, email: user.email, mustChangePassword: true };
  };
}

export default new PasswordService();

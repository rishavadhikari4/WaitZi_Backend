// src/middleware/auth/auth.middleware.ts
// Verifies the access token and loads the caller as a member of the token's
// organization (through RLS). Sets req.user, req.organization and req.tenant.
import type { NextFunction, Request, Response } from 'express';

import { withTenant } from '../../config/prisma.js';
import OrganizationRepository from '../../repository/organization.repository.js';
import UserOrganizationRepository from '../../repository/userOrganization.repository.js';
import { AppError } from '../../utils/AppError.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { logger } from '../../utils/logger.js';
import { extractAccessToken, isNearExpiry, verifyAccessToken } from '../../utils/tokens.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveCaller(req: Request, res: Response): Promise<void> {
  const token = extractAccessToken(req);
  const decoded = verifyAccessToken(token);

  if (decoded.scope === 'platform') {
    throw AppError.forbidden('Platform accounts use the /api/admin endpoints', 'PLATFORM_SCOPE');
  }
  if (!decoded.orgId || !UUID.test(decoded.orgId) || !UUID.test(decoded.userId)) {
    throw AppError.unauthorized('Session is from an older version, please log in again', 'SESSION_OUTDATED');
  }

  const orgId = decoded.orgId;
  const loaded = await withTenant({ orgId, userId: decoded.userId }, async (tx) => {
    const [member, org] = await Promise.all([
      UserOrganizationRepository.findMember(tx, orgId, decoded.userId),
      OrganizationRepository.findCurrent(tx, orgId),
    ]);
    return { member, org };
  });

  const { member, org } = loaded;
  if (!org || org.status === 'suspended') {
    throw AppError.unauthorized('Organization not found or suspended', 'ORG_UNAVAILABLE');
  }
  if (!member || member.status !== 'Active' || member.user.status !== 'Active') {
    throw AppError.unauthorized('User account is inactive', 'ACCOUNT_INACTIVE');
  }

  req.user = {
    id: member.userId,
    email: member.user.email,
    firstName: member.user.firstName,
    lastName: member.user.lastName,
    role: member.role,
    orgId,
    branchIds: member.branchIds,
  };
  req.organization = { id: org.id, name: org.name, slug: org.slug };
  req.tenant = { orgId, userId: member.userId };

  if (isNearExpiry(decoded.exp)) res.set('X-Token-Warning', 'Token expires soon');
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await resolveCaller(req, res);
  } catch (error) {
    if (error instanceof AppError) {
      ApiResponse.error(res, error.message, error.code, error.statusCode);
    } else {
      logger.error(`authMiddleware: ${(error as Error).message}`);
      ApiResponse.internal(res, 'Server error during authentication');
    }
    return;
  }
  next();
}

/** Attaches the caller when a valid token is present; never rejects. */
export async function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    await resolveCaller(req, res);
  } catch {
    delete req.user;
    delete req.organization;
    delete req.tenant;
  }
  next();
}

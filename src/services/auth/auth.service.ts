// src/services/auth/auth.service.ts
import { asPlatform, withTenant } from '../../config/prisma.js';
import OrganizationRepository from '../../repository/organization.repository.js';
import UserRepository from '../../repository/user.repository.js';
import UserOrganizationRepository from '../../repository/userOrganization.repository.js';
import { AppError } from '../../utils/AppError.js';
import { verifyPassword, inOrder } from '../../utils/Helpers.js';
import { signTokenPair, verifyRefreshToken } from '../../utils/tokens.js';
import type { LoginInput } from '../../validators/auth.schema.js';
import { memberStatus, memberToApi, platformUserToApi } from '../user/shared/member.mapper.js';

// Compared against when the email doesn't exist, so a wrong email and a wrong
// password take the same time (no account enumeration by timing).
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO5HnU6M2aV.u0E9cWw0R9xnVoJgD2Sxe';

export type TokenPair = ReturnType<typeof signTokenPair>;

export type LoginResult =
  | { kind: 'tenant'; user: ReturnType<typeof memberToApi>; tokens: TokenPair; mustChangePassword: boolean }
  | { kind: 'platform'; user: ReturnType<typeof platformUserToApi>; tokens: TokenPair; mustChangePassword: boolean }
  | { kind: 'choose-organization'; organizations: { id: string; name: string; slug: string; role: string }[] };

class AuthService {
  login = async ({ email, password, organizationId }: LoginInput): Promise<LoginResult> => {
    const user = await asPlatform('auth: login lookup', (db) => UserRepository.findActiveByEmail(db, email));
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

    if (user.scope === 'platform') {
      const tokens = signTokenPair({
        userId: user.id,
        email: user.email,
        scope: 'platform',
        orgId: null,
        role: { id: user.platformRole ?? 'platform', name: user.platformRole ?? 'platform' },
      });
      return { kind: 'platform', user: platformUserToApi(user), tokens, mustChangePassword: user.mustChangePassword };
    }

    const memberships = await asPlatform('auth: login memberships', (db) =>
      UserOrganizationRepository.listForUser(db, user.id),
    );
    if (!memberships.length) {
      throw AppError.unauthorized('This account is not active in any organization', 'NO_ORGANIZATION');
    }

    const chosen = organizationId
      ? memberships.find((m) => m.orgId === organizationId)
      : memberships.length === 1
        ? memberships[0]
        : undefined;
    if (organizationId && !chosen) throw AppError.forbidden('You are not a member of that organization', 'NOT_A_MEMBER');
    if (!chosen) {
      return {
        kind: 'choose-organization',
        organizations: memberships.map((m) => ({ id: m.org.id, name: m.org.name, slug: m.org.slug, role: m.role.name })),
      };
    }

    const tokens = signTokenPair({
      userId: user.id,
      email: user.email,
      scope: 'tenant',
      orgId: chosen.orgId,
      role: { id: chosen.role.id, name: chosen.role.name },
    });
    return { kind: 'tenant', user: memberToApi(chosen, chosen.org), tokens, mustChangePassword: user.mustChangePassword };
  };

  refresh = async (refreshToken: string): Promise<TokenPair> => {
    const decoded = verifyRefreshToken(refreshToken);

    if (decoded.scope === 'platform') {
      const user = await asPlatform('auth: refresh platform user', (db) => UserRepository.findById(db, decoded.userId));
      if (!user || user.status !== 'Active' || user.scope !== 'platform') {
        throw AppError.unauthorized('User not found or inactive', 'ACCOUNT_INACTIVE');
      }
      return signTokenPair({
        userId: user.id,
        email: user.email,
        scope: 'platform',
        orgId: null,
        role: { id: user.platformRole ?? 'platform', name: user.platformRole ?? 'platform' },
      });
    }

    const orgId = decoded.orgId;
    if (!orgId) throw AppError.unauthorized('Session is from an older version, please log in again', 'SESSION_OUTDATED');
    const member = await withTenant({ orgId, userId: decoded.userId }, (tx) =>
      UserOrganizationRepository.findMember(tx, orgId, decoded.userId),
    );
    if (!member || memberStatus(member) !== 'Active') {
      throw AppError.unauthorized('User not found or inactive', 'ACCOUNT_INACTIVE');
    }
    return signTokenPair({
      userId: member.userId,
      email: member.user.email,
      scope: 'tenant',
      orgId,
      role: { id: member.role.id, name: member.role.name },
    });
  };

  /** The signed-in member with their organization (GET /auth/verify). */
  me = async (orgId: string, userId: string) => {
    return withTenant({ orgId, userId }, async (tx) => {
      const [member, org] = await inOrder(
        () => UserOrganizationRepository.findMember(tx, orgId, userId),
        () => OrganizationRepository.findCurrent(tx, orgId),
      );
      if (!member || !org) throw AppError.unauthorized('User not found or inactive', 'ACCOUNT_INACTIVE');
      return memberToApi(member, org);
    });
  };
}

export default new AuthService();

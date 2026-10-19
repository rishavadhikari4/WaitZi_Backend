// src/services/user/shared/member.mapper.ts
// A "user" in the client API is a person *as a member of the current org*:
// identity fields from users, role and status from memberships. The shape
// matches what the frontend already reads (number, role.name, status, ...).
import type { User } from '@prisma/client';

import type { MemberRow } from '../../../repository/userOrganization.repository.js';

export function memberStatus(m: MemberRow): 'Active' | 'Inactive' {
  return m.status === 'Active' && m.user.status === 'Active' ? 'Active' : 'Inactive';
}

export function memberToApi(m: MemberRow, org?: { id: string; name: string; slug: string }) {
  const u = m.user;
  return {
    id: u.id,
    membershipId: m.id,
    firstName: u.firstName,
    lastName: u.lastName,
    address: u.address ?? '',
    number: u.phone,
    email: u.email,
    image: u.image,
    imageId: u.imageId,
    status: memberStatus(m),
    mustChangePassword: u.mustChangePassword,
    passwordChangedAt: u.passwordChangedAt,
    role: m.role,
    branchIds: m.branchIds,
    ...(org && { organization: { id: org.id, name: org.name, slug: org.slug } }),
    createdAt: m.createdAt,
    updatedAt: u.updatedAt > m.updatedAt ? u.updatedAt : m.updatedAt,
  };
}

export function platformUserToApi(u: User) {
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    number: u.phone,
    email: u.email,
    image: u.image,
    status: u.status,
    scope: 'platform' as const,
    role: { id: u.platformRole, name: u.platformRole, description: 'Platform staff', permissions: ['*'] },
    mustChangePassword: u.mustChangePassword,
  };
}

// src/services/role/client/role.service.ts
import { withTenant, type TenantContext } from '../../../config/prisma.js';
import { ALL } from '../../../constants/permissions.js';
import RoleRepository from '../../../repository/role.repository.js';
import UserOrganizationRepository from '../../../repository/userOrganization.repository.js';
import { AppError } from '../../../utils/AppError.js';
import type { CreateRoleInput, UpdateRoleInput } from '../../../validators/role.schema.js';

class ClientRoleService {
  list = (tenant: TenantContext) => withTenant(tenant, (tx) => RoleRepository.list(tx));

  get = (tenant: TenantContext, id: string) =>
    withTenant(tenant, async (tx) => {
      const role = await RoleRepository.findById(tx, id);
      if (!role) throw AppError.notFound('Role not found');
      return role;
    });

  create = (tenant: TenantContext, input: CreateRoleInput) =>
    withTenant(tenant, (tx) =>
      RoleRepository.create(tx, {
        orgId: tenant.orgId,
        name: input.name,
        description: input.description || `${input.name} role`,
        permissions: input.permissions,
      }),
    );

  update = (tenant: TenantContext, id: string, input: UpdateRoleInput) =>
    withTenant(tenant, async (tx) => {
      const role = await RoleRepository.findById(tx, id);
      if (!role) throw AppError.notFound('Role not found');

      if (role.isSystem && input.name && input.name !== role.name) {
        throw AppError.badRequest('Built-in roles cannot be renamed', 'SYSTEM_ROLE');
      }
      if (role.permissions.includes(ALL) && input.permissions && !input.permissions.includes(ALL as never)) {
        throw AppError.badRequest('The admin role always has full access', 'SYSTEM_ROLE');
      }

      return RoleRepository.update(tx, id, {
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.permissions && !role.permissions.includes(ALL) && { permissions: input.permissions }),
      });
    });

  remove = (tenant: TenantContext, id: string) =>
    withTenant(tenant, async (tx) => {
      const role = await RoleRepository.findById(tx, id);
      if (!role) throw AppError.notFound('Role not found');
      if (role.isSystem) throw AppError.badRequest('Built-in roles cannot be deleted', 'SYSTEM_ROLE');
      const inUse = await UserOrganizationRepository.countByRole(tx, id);
      if (inUse > 0) {
        throw AppError.badRequest(`Cannot delete role. ${inUse} user(s) are assigned to this role`, 'ROLE_IN_USE');
      }
      await RoleRepository.delete(tx, id);
      return { deletedRole: { id: role.id, name: role.name } };
    });
}

export default new ClientRoleService();

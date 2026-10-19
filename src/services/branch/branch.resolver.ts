// src/services/branch/branch.resolver.ts
import type { TenantTx } from '../../config/prisma.js';
import BranchRepository from '../../repository/branch.repository.js';
import { AppError } from '../../utils/AppError.js';

/**
 * Pick the branch a new record belongs to. An explicit branchId must exist and
 * be one the caller works at; otherwise a single-branch org (or a member tied
 * to one branch) gets that branch automatically.
 */
export async function resolveBranchId(
  tx: TenantTx,
  requested: string | undefined,
  memberBranchIds: string[],
): Promise<string> {
  if (requested) {
    if (memberBranchIds.length && !memberBranchIds.includes(requested)) {
      throw AppError.forbidden('You do not work at that branch', 'BRANCH_FORBIDDEN');
    }
    const branch = await BranchRepository.findById(tx, requested);
    if (!branch?.isActive) throw AppError.badRequest('Branch not found', 'BRANCH_NOT_FOUND');
    return branch.id;
  }
  if (memberBranchIds.length === 1) return memberBranchIds[0]!;

  const branches = await BranchRepository.listActive(tx);
  if (branches.length === 1) return branches[0]!.id;
  if (branches.length === 0) throw AppError.badRequest('Create a branch first', 'NO_BRANCH');
  throw AppError.badRequest('This organization has several branches; choose one (branchId)', 'BRANCH_REQUIRED');
}

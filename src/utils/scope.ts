// src/utils/scope.ts
// Which part of the floor a staff member can see: their branches, and only
// their assigned tables unless the role holds 'floor.all'.
import { hasPermission } from '../constants/permissions.js';
import type { RequestUser } from '../Interface/GlobalInterface.js';

export interface FloorScope {
  /** Empty = every branch of the org. */
  branchIds: string[];
  /** Set when the actor only sees tables (and orders) assigned to them. */
  waiterId?: string;
}

export const floorScope = (actor: RequestUser): FloorScope => ({
  branchIds: actor.branchIds,
  ...(!hasPermission(actor.role.permissions, 'floor.all') && { waiterId: actor.id }),
});

/** Orders: the kitchen (kot.view) works every ticket, so only waiters are narrowed. */
export const orderScope = (actor: RequestUser): FloorScope =>
  hasPermission(actor.role.permissions, 'kot.view') ? { branchIds: actor.branchIds } : floorScope(actor);

export const inBranch = (scope: FloorScope, branchId: string) =>
  !scope.branchIds.length || scope.branchIds.includes(branchId);

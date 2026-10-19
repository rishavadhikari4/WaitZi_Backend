// src/Interface/GlobalInterface.ts
// Global Express Request augmentation, set by authMiddleware.
import type { TenantContext } from '../config/prisma.js';

export interface RequestUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: {
    id: string;
    name: string;
    description: string;
    permissions: string[];
  };
  orgId: string;
  /** Empty = every branch of the org. */
  branchIds: string[];
}

export interface RequestOrganization {
  id: string;
  name: string;
  slug: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
      organization?: RequestOrganization;
      /** Pass to withTenant() — set together with user and organization. */
      tenant?: TenantContext;
    }
  }
}

export {};

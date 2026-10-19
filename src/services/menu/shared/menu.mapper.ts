// src/services/menu/shared/menu.mapper.ts
// DB rows -> the shapes the frontend already reads (price in rupees,
// availabilityStatus 'Out of Stock', category populated).
import type { MenuAvailability, MenuItem } from '@prisma/client';

import { toRupees } from '../../../utils/Helpers.js';
import type { Availability } from '../../../validators/menu.schema.js';
import type { MenuItemRow } from '../../../repository/menuItem.repository.js';

export const availabilityToApi = (a: MenuAvailability): Availability => (a === 'OutOfStock' ? 'Out of Stock' : 'Available');
export const availabilityToDb = (a: Availability): MenuAvailability => (a === 'Out of Stock' ? 'OutOfStock' : 'Available');

export function menuItemToApi(item: MenuItemRow | MenuItem) {
  const { pricePaisa, availabilityStatus, categoryId, orgId: _orgId, ...rest } = item as MenuItemRow;
  return {
    ...rest,
    price: toRupees(pricePaisa),
    availabilityStatus: availabilityToApi(availabilityStatus),
    category: 'category' in item ? (item as MenuItemRow).category : categoryId,
  };
}

export function categoryToApi<T extends { orgId: string }>(category: T) {
  const { orgId: _orgId, ...rest } = category;
  return rest;
}

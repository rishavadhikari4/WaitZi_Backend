// src/services/menu/client/menu.service.ts
import { withTenant, type TenantContext } from '../../../config/prisma.js';
import CategoryRepository from '../../../repository/category.repository.js';
import MenuItemRepository from '../../../repository/menuItem.repository.js';
import { AppError } from '../../../utils/AppError.js';
import { paginationMeta, toPaisa } from '../../../utils/Helpers.js';
import type { Availability, CreateMenuItemInput, MenuQuery, UpdateMenuItemInput } from '../../../validators/menu.schema.js';
import ImageService from '../../media/image.service.js';
import { availabilityToDb, menuItemToApi } from '../shared/menu.mapper.js';

const SORT_FIELD = {
  name: 'name',
  price: 'pricePaisa',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  availabilityStatus: 'availabilityStatus',
} as const;

class ClientMenuService {
  list = (tenant: TenantContext, q: MenuQuery) =>
    withTenant(tenant, async (tx) => {
      const { items, total } = await MenuItemRepository.list(
        tx,
        {
          ...(q.category && { categoryId: q.category }),
          ...(q.availabilityStatus && { availability: availabilityToDb(q.availabilityStatus) }),
          ...(q.search && { search: q.search }),
          ...(q.minPrice !== undefined && { minPaisa: toPaisa(q.minPrice) }),
          ...(q.maxPrice !== undefined && { maxPaisa: toPaisa(q.maxPrice) }),
        },
        { skip: (q.page - 1) * q.limit, take: q.limit },
        { [SORT_FIELD[q.sortBy]]: q.sortOrder },
      );
      return { items: items.map(menuItemToApi), pagination: paginationMeta(q.page, q.limit, total) };
    });

  get = (tenant: TenantContext, id: string) =>
    withTenant(tenant, async (tx) => {
      const item = await MenuItemRepository.findById(tx, id);
      if (!item) throw AppError.notFound('Menu item not found');
      return menuItemToApi(item);
    });

  create = async (tenant: TenantContext, input: CreateMenuItemInput, image?: Buffer) => {
    await withTenant(tenant, async (tx) => {
      if (!(await CategoryRepository.findById(tx, input.category))) {
        throw AppError.badRequest('Invalid category ID', 'CATEGORY_NOT_FOUND');
      }
      if (await MenuItemRepository.findByNameInsensitive(tx, input.name)) {
        throw AppError.conflict(`Menu item '${input.name}' already exists`, 'NAME_TAKEN');
      }
    });
    const uploaded = image ? await ImageService.upload(tenant.orgId, 'menu-items', image) : undefined;
    try {
      const item = await withTenant(tenant, (tx) =>
        MenuItemRepository.create(tx, {
          orgId: tenant.orgId,
          categoryId: input.category,
          name: input.name,
          pricePaisa: toPaisa(input.price),
          description: input.description ?? '',
          availabilityStatus: availabilityToDb(input.availabilityStatus),
          ...(uploaded && { image: uploaded.url, imageId: uploaded.publicId }),
        }),
      );
      return menuItemToApi(item);
    } catch (error) {
      await ImageService.remove(uploaded?.publicId);
      throw error;
    }
  };

  update = async (tenant: TenantContext, id: string, input: UpdateMenuItemInput, image?: Buffer) => {
    if (!Object.values(input).some((v) => v !== undefined) && !image) {
      throw AppError.badRequest('No valid fields provided for update', 'NOTHING_TO_UPDATE');
    }
    const existing = await withTenant(tenant, async (tx) => {
      const item = await MenuItemRepository.findById(tx, id);
      if (!item) throw AppError.notFound('Menu item not found');
      if (input.name && (await MenuItemRepository.findByNameInsensitive(tx, input.name, id))) {
        throw AppError.conflict(`Menu item name '${input.name}' already exists`, 'NAME_TAKEN');
      }
      if (input.category && !(await CategoryRepository.findById(tx, input.category))) {
        throw AppError.badRequest('Invalid category ID', 'CATEGORY_NOT_FOUND');
      }
      return item;
    });

    const uploaded = image ? await ImageService.upload(tenant.orgId, 'menu-items', image) : undefined;
    const updated = await withTenant(tenant, (tx) =>
      MenuItemRepository.update(tx, id, {
        ...(input.name && { name: input.name }),
        ...(input.category && { categoryId: input.category }),
        ...(input.price !== undefined && { pricePaisa: toPaisa(input.price) }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.availabilityStatus && { availabilityStatus: availabilityToDb(input.availabilityStatus) }),
        ...(uploaded && { image: uploaded.url, imageId: uploaded.publicId }),
      }),
    );
    if (uploaded) await ImageService.remove(existing.imageId);
    return menuItemToApi(updated);
  };

  setAvailability = (tenant: TenantContext, id: string, availability: Availability) =>
    withTenant(tenant, async (tx) => {
      if (!(await MenuItemRepository.findById(tx, id))) throw AppError.notFound('Menu item not found');
      return menuItemToApi(await MenuItemRepository.update(tx, id, { availabilityStatus: availabilityToDb(availability) }));
    });

  /**
   * Items that appear on past orders can't be deleted (that would rewrite
   * order history); mark them out of stock instead.
   */
  remove = async (tenant: TenantContext, id: string) => {
    const item = await withTenant(tenant, async (tx) => {
      const found = await MenuItemRepository.findById(tx, id);
      if (!found) throw AppError.notFound('Menu item not found');
      const used = await MenuItemRepository.countOrderLines(tx, id);
      if (used > 0) {
        throw AppError.badRequest(
          `This item appears on ${used} past order line(s). Mark it "Out of Stock" instead of deleting it.`,
          'MENU_ITEM_IN_USE',
        );
      }
      await MenuItemRepository.delete(tx, id);
      return found;
    });
    await ImageService.remove(item.imageId);
    return { deletedItem: { id: item.id, name: item.name } };
  };
}

export default new ClientMenuService();

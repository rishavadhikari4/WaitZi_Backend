// src/services/menu/client/category.service.ts
import { withTenant, type TenantContext } from '../../../config/prisma.js';
import CategoryRepository from '../../../repository/category.repository.js';
import { AppError } from '../../../utils/AppError.js';
import { paginationMeta } from '../../../utils/Helpers.js';
import type { CategoryQuery, CreateCategoryInput, UpdateCategoryInput } from '../../../validators/menu.schema.js';
import ImageService from '../../media/image.service.js';
import { categoryToApi } from '../shared/menu.mapper.js';

class ClientCategoryService {
  list = (tenant: TenantContext, q: CategoryQuery) =>
    withTenant(tenant, async (tx) => {
      const { items, total } = await CategoryRepository.list(
        tx,
        { ...(q.isActive && { isActive: q.isActive === 'true' }), ...(q.search && { search: q.search }) },
        { skip: (q.page - 1) * q.limit, take: q.limit },
        { [q.sortBy]: q.sortOrder },
      );
      return { categories: items.map(categoryToApi), pagination: paginationMeta(q.page, q.limit, total) };
    });

  get = (tenant: TenantContext, id: string) =>
    withTenant(tenant, async (tx) => {
      const category = await CategoryRepository.findById(tx, id);
      if (!category) throw AppError.notFound('Category not found');
      return categoryToApi(category);
    });

  create = async (tenant: TenantContext, input: CreateCategoryInput, image?: Buffer) => {
    if (!image) throw AppError.badRequest('Category image is required', 'IMAGE_REQUIRED');
    await withTenant(tenant, async (tx) => {
      if (await CategoryRepository.findByNameInsensitive(tx, input.name)) {
        throw AppError.conflict(`Category '${input.name}' already exists`, 'NAME_TAKEN');
      }
    });
    const uploaded = await ImageService.upload(tenant.orgId, 'categories', image);
    try {
      const created = await withTenant(tenant, (tx) =>
        CategoryRepository.create(tx, {
          orgId: tenant.orgId,
          name: input.name,
          description: input.description,
          image: uploaded.url,
          imageId: uploaded.publicId,
        }),
      );
      return categoryToApi(created);
    } catch (error) {
      await ImageService.remove(uploaded.publicId);
      throw error;
    }
  };

  update = async (tenant: TenantContext, id: string, input: UpdateCategoryInput, image?: Buffer) => {
    if (input.name === undefined && input.description === undefined && input.isActive === undefined && !image) {
      throw AppError.badRequest('No valid fields provided for update', 'NOTHING_TO_UPDATE');
    }
    const existing = await withTenant(tenant, async (tx) => {
      const category = await CategoryRepository.findById(tx, id);
      if (!category) throw AppError.notFound('Category not found');
      if (input.name && (await CategoryRepository.findByNameInsensitive(tx, input.name, id))) {
        throw AppError.conflict(`Category name '${input.name}' already exists`, 'NAME_TAKEN');
      }
      return category;
    });

    const uploaded = image ? await ImageService.upload(tenant.orgId, 'categories', image) : undefined;
    const updated = await withTenant(tenant, (tx) =>
      CategoryRepository.update(tx, id, {
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(uploaded && { image: uploaded.url, imageId: uploaded.publicId }),
      }),
    );
    if (uploaded) await ImageService.remove(existing.imageId);
    return categoryToApi(updated);
  };

  remove = async (tenant: TenantContext, id: string) => {
    const category = await withTenant(tenant, async (tx) => {
      const c = await CategoryRepository.findById(tx, id);
      if (!c) throw AppError.notFound('Category not found');
      const items = await CategoryRepository.countMenuItems(tx, id);
      if (items > 0) {
        throw AppError.badRequest(
          `Cannot delete category. ${items} menu item(s) still use it; move or delete them first`,
          'CATEGORY_IN_USE',
        );
      }
      await CategoryRepository.delete(tx, id);
      return c;
    });
    await ImageService.remove(category.imageId);
    return { deletedCategory: { id: category.id, name: category.name } };
  };
}

export default new ClientCategoryService();

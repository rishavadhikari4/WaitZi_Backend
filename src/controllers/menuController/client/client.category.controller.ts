// src/controllers/menuController/client/client.category.controller.ts
import type { Request, Response } from 'express';

import { getValidatedParams, getValidatedQuery } from '../../../middleware/validate.middleware.js';
import ClientCategoryService from '../../../services/menu/client/category.service.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import type { CategoryQuery, CreateCategoryInput, UpdateCategoryInput } from '../../../validators/menu.schema.js';
import BaseController from '../../base.controller.js';

type IdParams = { id: string };

class ClientCategoryController extends BaseController {
  getCategories = async (req: Request, res: Response) => {
    try {
      const q = getValidatedQuery<CategoryQuery>(res);
      const { categories, pagination } = await ClientCategoryService.list(this.tenant(req), q);
      return ApiResponse.success(res, categories, 'Categories retrieved successfully', 200, {
        pagination,
        meta: {
          filter: { isActive: q.isActive !== undefined ? q.isActive === 'true' : 'all', search: q.search ?? null },
          sort: { field: q.sortBy, order: q.sortOrder },
        },
      });
    } catch (error) {
      return this.sendError(res, error, 'ClientCategoryController.getCategories', 'Failed to fetch categories');
    }
  };

  getCategory = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      return ApiResponse.success(res, await ClientCategoryService.get(this.tenant(req), id), 'Category retrieved successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientCategoryController.getCategory', 'Failed to fetch category');
    }
  };

  createCategory = async (req: Request, res: Response) => {
    try {
      const data = await ClientCategoryService.create(this.tenant(req), req.body as CreateCategoryInput, req.file?.buffer);
      return ApiResponse.created(res, data, 'Category created successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientCategoryController.createCategory', 'Failed to create category');
    }
  };

  updateCategory = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientCategoryService.update(this.tenant(req), id, req.body as UpdateCategoryInput, req.file?.buffer);
      return ApiResponse.success(res, data, 'Category updated successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientCategoryController.updateCategory', 'Failed to update category');
    }
  };

  deleteCategory = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientCategoryService.remove(this.tenant(req), id);
      return ApiResponse.success(res, data, 'Category deleted successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientCategoryController.deleteCategory', 'Failed to delete category');
    }
  };
}

export default new ClientCategoryController();

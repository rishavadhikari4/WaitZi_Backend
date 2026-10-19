// src/controllers/menuController/client/client.menu.controller.ts
import type { Request, Response } from 'express';

import { getValidatedParams, getValidatedQuery } from '../../../middleware/validate.middleware.js';
import ClientMenuService from '../../../services/menu/client/menu.service.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import type { Availability, CreateMenuItemInput, MenuQuery, UpdateMenuItemInput } from '../../../validators/menu.schema.js';
import BaseController from '../../base.controller.js';

type IdParams = { id: string };

class ClientMenuController extends BaseController {
  getMenuItems = async (req: Request, res: Response) => {
    try {
      const q = getValidatedQuery<MenuQuery>(res);
      const { items, pagination } = await ClientMenuService.list(this.tenant(req), q);
      return ApiResponse.success(res, items, 'Menu items retrieved successfully', 200, {
        pagination,
        meta: {
          filter: {
            category: q.category ?? 'all',
            availabilityStatus: q.availabilityStatus ?? 'all',
            priceRange: q.minPrice !== undefined || q.maxPrice !== undefined ? { min: q.minPrice ?? null, max: q.maxPrice ?? null } : null,
            search: q.search ?? null,
          },
          sort: { field: q.sortBy, order: q.sortOrder },
        },
      });
    } catch (error) {
      return this.sendError(res, error, 'ClientMenuController.getMenuItems', 'Failed to fetch menu items');
    }
  };

  getMenuItem = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      return ApiResponse.success(res, await ClientMenuService.get(this.tenant(req), id), 'Menu item retrieved successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientMenuController.getMenuItem', 'Failed to fetch menu item');
    }
  };

  createMenuItem = async (req: Request, res: Response) => {
    try {
      const data = await ClientMenuService.create(this.tenant(req), req.body as CreateMenuItemInput, req.file?.buffer);
      return ApiResponse.created(res, data, 'Menu item created successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientMenuController.createMenuItem', 'Failed to create menu item');
    }
  };

  updateMenuItem = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientMenuService.update(this.tenant(req), id, req.body as UpdateMenuItemInput, req.file?.buffer);
      return ApiResponse.success(res, data, 'Menu item updated successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientMenuController.updateMenuItem', 'Failed to update menu item');
    }
  };

  updateAvailability = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const { availabilityStatus } = req.body as { availabilityStatus: Availability };
      const data = await ClientMenuService.setAvailability(this.tenant(req), id, availabilityStatus);
      return ApiResponse.success(res, data, 'Availability status updated successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientMenuController.updateAvailability', 'Failed to update availability');
    }
  };

  deleteMenuItem = async (req: Request, res: Response) => {
    try {
      const { id } = getValidatedParams<IdParams>(res);
      const data = await ClientMenuService.remove(this.tenant(req), id);
      return ApiResponse.success(res, data, 'Menu item deleted successfully');
    } catch (error) {
      return this.sendError(res, error, 'ClientMenuController.deleteMenuItem', 'Failed to delete menu item');
    }
  };
}

export default new ClientMenuController();

import Menu from "../models/Menu.js";
import Category from "../models/Category.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../config/cloudinaryConfig.js";

class MenuController {
  constructor() {
    this.defaultPaginationLimit = 12;
    this.maxPaginationLimit = 50;
    this.validSortFields = ['name', 'price', 'createdAt', 'updatedAt', 'availabilityStatus'];
    this.cloudinaryOptions = {
      folder: 'waitzi/menu-items',
      resource_type: 'image',
      format: 'webp',
      transformation: [
        { width: 600, height: 400, crop: 'fill', quality: 'auto' }
      ]
    };
  }

  // Create new menu item
  async createMenuItem(req, res) {
    try {
      const { name, category, price, description, availabilityStatus = 'Available' } = req.body;

      // Validate required fields
      if (!name || !category || !price) {
        return res.status(400).json({
          success: false,
          message: "Name, category, and price are required"
        });
      }

      // Validate price
      const numPrice = parseFloat(price);
      if (isNaN(numPrice) || numPrice < 0) {
        return res.status(400).json({
          success: false,
          message: "Price must be a valid positive number"
        });
      }

      // Check if category exists
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID"
        });
      }

      // Check for existing menu item with same name
      const existingMenuItem = await Menu.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
      });

      if (existingMenuItem) {
        return res.status(409).json({
          success: false,
          message: `Menu item '${name}' already exists`
        });
      }

      let imageData = null;
      if (req.file) {
        const uploadResult = await this.uploadMenuImage(req.file.buffer);
        if (!uploadResult.success) {
          return res.status(500).json({
            success: false,
            message: uploadResult.message
          });
        }
        imageData = uploadResult.data;
      }

      // Create menu item
      const menuItemData = {
        name: name.trim(),
        category,
        price: numPrice,
        description: description?.trim() || '',
        availabilityStatus,
        ...(imageData && {
          image: imageData.secure_url,
          imageId: imageData.public_id
        })
      };

      const newMenuItem = new Menu(menuItemData);
      const savedMenuItem = await newMenuItem.save();

      console.log(`✅ Menu item '${savedMenuItem.name}' created successfully`);

      res.status(201).json({
        success: true,
        message: "Menu item created successfully",
        data: savedMenuItem
      });

    } catch (error) {
      this.handleError(error, res, 'Error creating menu item');
    }
  }

  // Get all menu items with filtering and pagination
  async getAllMenuItems(req, res) {
    try {
      const queryParams = this.parseQueryParameters(req.query);
      const filter = await this.buildFilter(queryParams);
      const sort = this.buildSort(queryParams.sortBy, queryParams.sortOrder);

      const [menuItems, totalItems] = await Promise.all([
        Menu.find(filter)
          .populate('category', 'name description image')
          .sort(sort)
          .skip((queryParams.pageNum - 1) * queryParams.limitNum)
          .limit(queryParams.limitNum)
          .lean(),
        Menu.countDocuments(filter)
      ]);

      const paginationMeta = this.buildPaginationMetadata(
        queryParams.pageNum,
        queryParams.limitNum,
        totalItems
      );

      res.status(200).json({
        success: true,
        message: "Menu items retrieved successfully",
        data: menuItems,
        pagination: paginationMeta,
        meta: {
          filter: {
            category: queryParams.category || 'all',
            availabilityStatus: queryParams.availabilityStatus || 'all',
            priceRange: queryParams.priceRange || null,
            search: queryParams.search || null
          },
          sort: {
            field: queryParams.sortBy,
            order: queryParams.sortOrder
          }
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching menu items');
    }
  }

  // Get menu items by category (for customer QR ordering)
  async getMenuByCategory(req, res) {
    try {
      const { categoryId } = req.params;

      if (!this.isValidObjectId(categoryId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID format"
        });
      }

      const category = await Category.findById(categoryId);
      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found"
        });
      }

      const menuItems = await Menu.find({
        category: categoryId,
        availabilityStatus: 'Available'
      })
      .populate('category', 'name description')
      .sort({ name: 1 })
      .lean();

      res.status(200).json({
        success: true,
        message: "Menu items retrieved successfully",
        data: {
          category: category,
          items: menuItems
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching menu by category');
    }
  }

  // Get single menu item by ID
  async getMenuItemById(req, res) {
    try {
      const { id } = req.params;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid menu item ID format"
        });
      }

      const menuItem = await Menu.findById(id)
        .populate('category', 'name description image')
        .lean();

      if (!menuItem) {
        return res.status(404).json({
          success: false,
          message: "Menu item not found"
        });
      }

      res.status(200).json({
        success: true,
        message: "Menu item retrieved successfully",
        data: menuItem
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching menu item');
    }
  }

  // Update menu item
  async updateMenuItem(req, res) {
    try {
      const { id } = req.params;
      const { name, category, price, description, availabilityStatus } = req.body;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid menu item ID format"
        });
      }

      const existingMenuItem = await Menu.findById(id);
      if (!existingMenuItem) {
        return res.status(404).json({
          success: false,
          message: "Menu item not found"
        });
      }

      const updateData = {};

      // Validate and update name
      if (name?.trim() && name.trim() !== existingMenuItem.name) {
        const nameConflict = await Menu.findOne({
          name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
          _id: { $ne: id }
        });
        if (nameConflict) {
          return res.status(409).json({
            success: false,
            message: `Menu item name '${name.trim()}' already exists`
          });
        }
        updateData.name = name.trim();
      }

      // Validate and update category
      if (category && category !== existingMenuItem.category.toString()) {
        const categoryExists = await Category.findById(category);
        if (!categoryExists) {
          return res.status(400).json({
            success: false,
            message: "Invalid category ID"
          });
        }
        updateData.category = category;
      }

      // Validate and update price
      if (price !== undefined) {
        const numPrice = parseFloat(price);
        if (isNaN(numPrice) || numPrice < 0) {
          return res.status(400).json({
            success: false,
            message: "Price must be a valid positive number"
          });
        }
        updateData.price = numPrice;
      }

      // Update other fields
      if (description !== undefined) updateData.description = description?.trim() || '';
      if (availabilityStatus) updateData.availabilityStatus = availabilityStatus;

      // Handle image update
      if (req.file) {
        const imageUpdateResult = await this.handleImageUpdate(
          req.file.buffer, 
          existingMenuItem.imageId
        );
        if (!imageUpdateResult.success) {
          return res.status(500).json({
            success: false,
            message: imageUpdateResult.message
          });
        }
        updateData.image = imageUpdateResult.data.secure_url;
        updateData.imageId = imageUpdateResult.data.public_id;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid fields provided for update"
        });
      }

      const updatedMenuItem = await Menu.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).populate('category', 'name description');

      console.log(`✅ Menu item '${updatedMenuItem.name}' updated successfully`);

      res.status(200).json({
        success: true,
        message: "Menu item updated successfully",
        data: updatedMenuItem
      });

    } catch (error) {
      this.handleError(error, res, 'Error updating menu item');
    }
  }

  // Delete menu item
  async deleteMenuItem(req, res) {
    try {
      const { id } = req.params;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid menu item ID format"
        });
      }

      const menuItem = await Menu.findById(id);
      if (!menuItem) {
        return res.status(404).json({
          success: false,
          message: "Menu item not found"
        });
      }

      // Delete image from Cloudinary if exists
      if (menuItem.imageId) {
        await this.deleteMenuImage(menuItem.imageId);
      }

      await Menu.findByIdAndDelete(id);

      console.log(`✅ Menu item '${menuItem.name}' deleted successfully`);

      res.status(200).json({
        success: true,
        message: "Menu item deleted successfully",
        data: {
          deletedItem: {
            id: menuItem._id,
            name: menuItem.name
          }
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error deleting menu item');
    }
  }

  // Update availability status (quick toggle)
  async updateAvailabilityStatus(req, res) {
    try {
      const { id } = req.params;
      const { availabilityStatus } = req.body;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid menu item ID format"
        });
      }

      if (!['Available', 'Out of Stock'].includes(availabilityStatus)) {
        return res.status(400).json({
          success: false,
          message: "Invalid availability status"
        });
      }

      const updatedMenuItem = await Menu.findByIdAndUpdate(
        id,
        { availabilityStatus },
        { new: true, runValidators: true }
      ).populate('category', 'name description');

      if (!updatedMenuItem) {
        return res.status(404).json({
          success: false,
          message: "Menu item not found"
        });
      }

      res.status(200).json({
        success: true,
        message: "Availability status updated successfully",
        data: updatedMenuItem
      });

    } catch (error) {
      this.handleError(error, res, 'Error updating availability status');
    }
  }

  // Helper methods
  async uploadMenuImage(fileBuffer) {
    try {
      const uploadResult = await uploadToCloudinary(fileBuffer, this.cloudinaryOptions);
      return { success: true, data: uploadResult };
    } catch (error) {
      console.error("Menu image upload error:", error.message);
      return { success: false, message: "Failed to upload image. Please try again." };
    }
  }

  async deleteMenuImage(imageId) {
    try {
      await deleteFromCloudinary(imageId);
    } catch (error) {
      console.warn("Failed to delete menu image from Cloudinary:", error.message);
    }
  }

  async handleImageUpdate(fileBuffer, oldImageId) {
    try {
      const uploadResult = await uploadToCloudinary(fileBuffer, this.cloudinaryOptions);
      
      if (oldImageId) {
        await this.deleteMenuImage(oldImageId);
      }

      return { success: true, data: uploadResult };
    } catch (error) {
      console.error("Menu image update error:", error.message);
      return { success: false, message: "Failed to update image. Please try again." };
    }
  }

  parseQueryParameters(query) {
    const {
      page = 1,
      limit = this.defaultPaginationLimit,
      category,
      availabilityStatus,
      search,
      minPrice,
      maxPrice,
      sortBy = 'name',
      sortOrder = 'asc'
    } = query;

    return {
      pageNum: Math.max(1, parseInt(page)),
      limitNum: Math.min(this.maxPaginationLimit, Math.max(1, parseInt(limit))),
      category,
      availabilityStatus,
      search: search?.trim(),
      minPrice: minPrice ? parseFloat(minPrice) : null,
      maxPrice: maxPrice ? parseFloat(maxPrice) : null,
      sortBy: this.validSortFields.includes(sortBy) ? sortBy : 'name',
      sortOrder: sortOrder === 'desc' ? 'desc' : 'asc',
      priceRange: (minPrice || maxPrice) ? { min: minPrice, max: maxPrice } : null
    };
  }

  async buildFilter(queryParams) {
    const filter = {};

    if (queryParams.category) {
      filter.category = queryParams.category;
    }

    if (queryParams.availabilityStatus) {
      filter.availabilityStatus = queryParams.availabilityStatus;
    }

    if (queryParams.search) {
      filter.$or = [
        { name: { $regex: queryParams.search, $options: 'i' } },
        { description: { $regex: queryParams.search, $options: 'i' } }
      ];
    }

    if (queryParams.minPrice !== null || queryParams.maxPrice !== null) {
      filter.price = {};
      if (queryParams.minPrice !== null) filter.price.$gte = queryParams.minPrice;
      if (queryParams.maxPrice !== null) filter.price.$lte = queryParams.maxPrice;
    }

    return filter;
  }

  buildSort(sortBy, sortOrder) {
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    return sort;
  }

  buildPaginationMetadata(pageNum, limitNum, totalItems) {
    const totalPages = Math.ceil(totalItems / limitNum);
    return {
      currentPage: pageNum,
      totalPages,
      totalItems,
      itemsPerPage: limitNum,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
      nextPage: pageNum < totalPages ? pageNum + 1 : null,
      prevPage: pageNum > 1 ? pageNum - 1 : null
    };
  }

  isValidObjectId(id) {
    return id?.match(/^[0-9a-fA-F]{24}$/);
  }

  handleError(error, res, context) {
    console.error(`${context}:`, error.message);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format"
      });
    }

    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: validationErrors
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Menu item already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// Create singleton instance
const menuController = new MenuController();

// Export controller methods for route handlers
export const createMenuItem = (req, res) => menuController.createMenuItem(req, res);
export const getAllMenuItems = (req, res) => menuController.getAllMenuItems(req, res);
export const getMenuByCategory = (req, res) => menuController.getMenuByCategory(req, res);
export const getMenuItemById = (req, res) => menuController.getMenuItemById(req, res);
export const updateMenuItem = (req, res) => menuController.updateMenuItem(req, res);
export const deleteMenuItem = (req, res) => menuController.deleteMenuItem(req, res);
export const updateAvailabilityStatus = (req, res) => menuController.updateAvailabilityStatus(req, res);

// Export class for advanced usage
export { MenuController };

// Export default instance
export default menuController;

import Category from "../models/Category.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../config/cloudinaryConfig.js";

class CategoryController {
  constructor() {
    this.defaultPaginationLimit = 10;
    this.maxPaginationLimit = 50;
    this.validSortFields = ['name', 'createdAt', 'updatedAt', 'isActive'];
    this.cloudinaryOptions = {
      folder: 'waitzi/categories',
      resource_type: 'image',
      format: 'webp',
      transformation: [
        { width: 400, height: 400, crop: 'fill', quality: 'auto' }
      ]
    };
  }

  async createCategory(req, res) {
    try {
      const { name, description } = req.body;

      // Validate required fields
      if (!name || !description) {
        return res.status(400).json({
          success: false,
          message: "Name and description are required"
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Category image is required"
        });
      }

      // Check for existing category
      const existingCategory = await this.findCategoryByName(name.trim());
      if (existingCategory) {
        console.log(`Category '${name}' already exists`);
        return res.status(409).json({
          success: false,
          message: `Category '${name}' already exists`
        });
      }

      // Upload image to Cloudinary
      const uploadResult = await this.uploadCategoryImage(req.file.buffer);
      if (!uploadResult.success) {
        return res.status(500).json({
          success: false,
          message: uploadResult.message
        });
      }

      // Create and save category
      const categoryData = {
        name: name.trim(),
        description: description.trim(),
        image: uploadResult.data.secure_url,
        imageId: uploadResult.data.public_id,
        isActive: true
      };

      const savedCategory = await this.saveCategory(categoryData);
      
      console.log(`✅ Category '${savedCategory.name}' created successfully`);

      res.status(201).json({
        success: true,
        message: "Category created successfully",
        data: savedCategory
      });

    } catch (error) {
      this.handleError(error, res, 'Error creating category');
    }
  }

  async getAllCategories(req, res) {
    try {
      const queryParams = this.parseQueryParameters(req.query);
      const filter = this.buildFilter(queryParams);
      const sort = this.buildSort(queryParams.sortBy, queryParams.sortOrder);

      // Execute parallel queries for better performance
      const [categories, totalCategories] = await Promise.all([
        this.findCategoriesWithPagination(filter, sort, queryParams),
        this.countCategories(filter)
      ]);

      // Build pagination metadata
      const paginationMeta = this.buildPaginationMetadata(
        queryParams.pageNum, 
        queryParams.limitNum, 
        totalCategories
      );

      res.status(200).json({
        success: true,
        message: "Categories retrieved successfully",
        data: categories,
        pagination: paginationMeta,
        meta: {
          filter: {
            isActive: queryParams.isActive !== undefined ? queryParams.isActive === 'true' : 'all',
            search: queryParams.search || null
          },
          sort: {
            field: queryParams.sortBy,
            order: queryParams.sortOrder
          }
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching categories');
    }
  }

  async getCategoryById(req, res) {
    try {
      const { id } = req.params;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID format"
        });
      }

      const category = await this.findCategoryById(id);
      
      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found"
        });
      }

      res.status(200).json({
        success: true,
        message: "Category retrieved successfully",
        data: category
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching category');
    }
  }

  async updateCategory(req, res) {
    try {
      const { id } = req.params;
      const { name, description, isActive } = req.body;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID format"
        });
      }

      const existingCategory = await this.findCategoryById(id);
      if (!existingCategory) {
        return res.status(404).json({
          success: false,
          message: "Category not found"
        });
      }

      if (name?.trim() && name.trim() !== existingCategory.name) {
        const nameConflict = await this.findCategoryByNameExcludingId(name.trim(), id);
        if (nameConflict) {
          return res.status(409).json({
            success: false,
            message: `Category name '${name.trim()}' already exists`
          });
        }
      }

      const updateData = this.buildUpdateData({ name, description, isActive });

      if (req.file) {
        const imageUpdateResult = await this.handleImageUpdate(req.file.buffer, existingCategory.imageId);
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

      const updatedCategory = await this.updateCategoryById(id, updateData);

      console.log(`✅ Category '${updatedCategory.name}' updated successfully`);

      res.status(200).json({
        success: true,
        message: "Category updated successfully",
        data: updatedCategory
      });

    } catch (error) {
      this.handleError(error, res, 'Error updating category');
    }
  }

  async deleteCategory(req, res) {
    try {
      const { id } = req.params;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID format"
        });
      }

      const category = await this.findCategoryById(id);
      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found"
        });
      }

      // Delete image from Cloudinary
      if (category.imageId) {
        await this.deleteCategoryImage(category.imageId);
      }

      // Delete category from database
      await this.deleteCategoryById(id);

      console.log(`✅ Category '${category.name}' deleted successfully`);

      res.status(200).json({
        success: true,
        message: "Category deleted successfully",
        data: { 
          deletedCategory: {
            id: category._id,
            name: category.name
          }
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error deleting category');
    }
  }


  async findCategoryByName(name) {
    return await Category.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });
  }

  async findCategoryByNameExcludingId(name, excludeId) {
    return await Category.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') },
      _id: { $ne: excludeId }
    });
  }

  async findCategoryById(id) {
    return await Category.findById(id).lean();
  }

  async saveCategory(categoryData) {
    const newCategory = new Category(categoryData);
    return await newCategory.save();
  }

  async updateCategoryById(id, updateData) {
    return await Category.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
  }

  async deleteCategoryById(id) {
    await Category.findByIdAndDelete(id);
  }

  async findCategoriesWithPagination(filter, sort, queryParams) {
    const skip = (queryParams.pageNum - 1) * queryParams.limitNum;
    return await Category.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(queryParams.limitNum)
      .lean();
  }

  async countCategories(filter) {
    return await Category.countDocuments(filter);
  }

  async uploadCategoryImage(fileBuffer) {
    try {
      const uploadResult = await uploadToCloudinary(fileBuffer, this.cloudinaryOptions);
      return {
        success: true,
        data: uploadResult
      };
    } catch (uploadError) {
      console.error("Cloudinary upload error:", uploadError.message);
      return {
        success: false,
        message: "Failed to upload image. Please try again."
      };
    }
  }

  async deleteCategoryImage(imageId) {
    try {
      await deleteFromCloudinary(imageId);
    } catch (cloudinaryError) {
      console.warn("Failed to delete image from Cloudinary:", cloudinaryError.message);
    }
  }

  async handleImageUpdate(fileBuffer, oldImageId) {
    try {
      const uploadResult = await uploadToCloudinary(fileBuffer, this.cloudinaryOptions);
      
      if (oldImageId) {
        await this.deleteCategoryImage(oldImageId);
      }

      return {
        success: true,
        data: uploadResult
      };
    } catch (imageError) {
      console.error("Image update error:", imageError.message);
      return {
        success: false,
        message: "Failed to update image. Please try again."
      };
    }
  }

  parseQueryParameters(query) {
    const { page = 1, limit = this.defaultPaginationLimit, isActive, search, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    
    return {
      pageNum: Math.max(1, parseInt(page)),
      limitNum: Math.min(this.maxPaginationLimit, Math.max(1, parseInt(limit))),
      isActive,
      search: search?.trim(),
      sortBy: this.validSortFields.includes(sortBy) ? sortBy : 'createdAt',
      sortOrder: sortOrder === 'asc' ? 'asc' : 'desc'
    };
  }

  buildFilter(queryParams) {
    const filter = {};
    
    if (queryParams.isActive !== undefined) {
      filter.isActive = queryParams.isActive === 'true';
    }

    if (queryParams.search) {
      filter.$or = [
        { name: { $regex: queryParams.search, $options: 'i' } },
        { description: { $regex: queryParams.search, $options: 'i' } }
      ];
    }

    return filter;
  }

  buildSort(sortBy, sortOrder) {
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    return sort;
  }

  buildUpdateData(updateFields) {
    const { name, description, isActive } = updateFields;
    const updateData = {};
    
    if (name?.trim()) updateData.name = name.trim();
    if (description?.trim()) updateData.description = description.trim();
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    return updateData;
  }

  buildPaginationMetadata(pageNum, limitNum, totalItems) {
    const totalPages = Math.ceil(totalItems / limitNum);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    return {
      currentPage: pageNum,
      totalPages,
      totalItems,
      itemsPerPage: limitNum,
      hasNext,
      hasPrev,
      nextPage: hasNext ? pageNum + 1 : null,
      prevPage: hasPrev ? pageNum - 1 : null
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
        message: "Invalid category ID format"
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
        message: "Category name already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// Create singleton instance
const categoryController = new CategoryController();

// Export controller methods for route handlers
export const createCategory = (req, res) => categoryController.createCategory(req, res);
export const getAllCategories = (req, res) => categoryController.getAllCategories(req, res);
export const getCategoryById = (req, res) => categoryController.getCategoryById(req, res);
export const updateCategory = (req, res) => categoryController.updateCategory(req, res);
export const deleteCategory = (req, res) => categoryController.deleteCategory(req, res);

// Export class for advanced usage
export { CategoryController };

// Export default instance
export default categoryController;
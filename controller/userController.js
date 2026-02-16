import User from "../models/User.js";
import Role from "../models/Role.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../config/cloudinaryConfig.js";
import bcrypt from "bcryptjs";

class UserController {
  constructor() {
    this.defaultPaginationLimit = 20;
    this.maxPaginationLimit = 100;
    this.validSortFields = ['firstName', 'lastName', 'email', 'createdAt', 'updatedAt', 'status'];
    this.cloudinaryOptions = {
      folder: 'waitzi/users',
      resource_type: 'image',
      format: 'webp',
      transformation: [
        { width: 400, height: 400, crop: 'fill', quality: 'auto' }
      ]
    };
  }

  // Note: Staff creation is handled by authController.createUser
  // This controller only handles existing user management

  // Get all users with filtering and pagination
  async getAllUsers(req, res) {
    try {
      const queryParams = this.parseQueryParameters(req.query);
      const filter = this.buildFilter(queryParams);
      const sort = this.buildSort(queryParams.sortBy, queryParams.sortOrder);

      const [users, totalUsers] = await Promise.all([
        User.find(filter)
          .populate('role', 'name description')
          .select('-password')
          .sort(sort)
          .skip((queryParams.pageNum - 1) * queryParams.limitNum)
          .limit(queryParams.limitNum)
          .lean(),
        User.countDocuments(filter)
      ]);

      const paginationMeta = this.buildPaginationMetadata(
        queryParams.pageNum,
        queryParams.limitNum,
        totalUsers
      );

      // Add user statistics
      const userStats = await this.getUserStatistics();

      res.status(200).json({
        success: true,
        message: "Users retrieved successfully",
        data: users,
        pagination: paginationMeta,
        stats: userStats,
        meta: {
          filter: {
            role: queryParams.role || 'all',
            status: queryParams.status || 'all',
            search: queryParams.search || null
          },
          sort: {
            field: queryParams.sortBy,
            order: queryParams.sortOrder
          }
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching users');
    }
  }

  // Get user by ID
  async getUserById(req, res) {
    try {
      const { id } = req.params;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format"
        });
      }

      const user = await User.findById(id)
        .populate('role', 'name description')
        .select('-password')
        .lean();

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      res.status(200).json({
        success: true,
        message: "User retrieved successfully",
        data: user
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching user');
    }
  }

  // Get users by role (for staff assignments)
  async getUsersByRole(req, res) {
    try {
      const { roleId } = req.params;
      const { status = 'Active' } = req.query;

      if (!this.isValidObjectId(roleId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role ID format"
        });
      }

      const filter = { role: roleId };
      if (status !== 'all') {
        filter.status = status;
      }

      const users = await User.find(filter)
        .populate('role', 'name description')
        .select('firstName lastName email number status image')
        .sort({ firstName: 1, lastName: 1 })
        .lean();

      res.status(200).json({
        success: true,
        message: "Users by role retrieved successfully",
        data: users
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching users by role');
    }
  }

  // Update user
  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { firstName, lastName, email, number, address, role, status } = req.body;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format"
        });
      }

      const existingUser = await User.findById(id);
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      const updateData = {};

      // Validate and update basic fields
      if (firstName?.trim()) updateData.firstName = firstName.trim();
      if (lastName?.trim()) updateData.lastName = lastName.trim();
      if (address?.trim()) updateData.address = address.trim();

      // Validate and update email
      if (email?.trim() && email.toLowerCase().trim() !== existingUser.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({
            success: false,
            message: "Invalid email format"
          });
        }

        const emailConflict = await User.findOne({
          email: email.toLowerCase().trim(),
          _id: { $ne: id }
        });

        if (emailConflict) {
          return res.status(409).json({
            success: false,
            message: "Email already exists"
          });
        }

        updateData.email = email.toLowerCase().trim();
      }

      // Validate and update phone number
      if (number?.trim() && number.trim() !== existingUser.number) {
        const numberConflict = await User.findOne({
          number: number.trim(),
          _id: { $ne: id }
        });

        if (numberConflict) {
          return res.status(409).json({
            success: false,
            message: "Phone number already exists"
          });
        }

        updateData.number = number.trim();
      }

      // Validate and update role
      if (role && role !== existingUser.role.toString()) {
        const roleExists = await Role.findById(role);
        if (!roleExists) {
          return res.status(400).json({
            success: false,
            message: "Invalid role ID"
          });
        }
        updateData.role = role;
      }

      // Update status
      if (status && ['Active', 'Inactive'].includes(status)) {
        updateData.status = status;
      }

      // Handle image update
      if (req.file) {
        const imageUpdateResult = await this.handleImageUpdate(
          req.file.buffer,
          existingUser.imageId
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

      const updatedUser = await User.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      )
      .populate('role', 'name description')
      .select('-password');

      console.log(`✅ User updated: ${updatedUser.firstName} ${updatedUser.lastName}`);

      res.status(200).json({
        success: true,
        message: "User updated successfully",
        data: updatedUser
      });

    } catch (error) {
      this.handleError(error, res, 'Error updating user');
    }
  }

  // Update user status (activate/deactivate)
  async updateUserStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format"
        });
      }

      if (!['Active', 'Inactive'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be either 'Active' or 'Inactive'"
        });
      }

      const updatedUser = await User.findByIdAndUpdate(
        id,
        { status },
        { new: true, runValidators: true }
      )
      .populate('role', 'name description')
      .select('-password');

      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      res.status(200).json({
        success: true,
        message: "User status updated successfully",
        data: updatedUser
      });

    } catch (error) {
      this.handleError(error, res, 'Error updating user status');
    }
  }

  // Update user password
  async updateUserPassword(req, res) {
    try {
      const { id } = req.params;
      const { currentPassword, newPassword } = req.body;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format"
        });
      }

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password and new password are required"
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters long"
        });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect"
        });
      }

      // Hash new password
      const saltRounds = 12;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

      await User.findByIdAndUpdate(id, { password: hashedNewPassword });

      console.log(`✅ Password updated for user: ${user.firstName} ${user.lastName}`);

      res.status(200).json({
        success: true,
        message: "Password updated successfully"
      });

    } catch (error) {
      this.handleError(error, res, 'Error updating password');
    }
  }

  // Delete user
  async deleteUser(req, res) {
    try {
      const { id } = req.params;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format"
        });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      // Delete user image from Cloudinary if exists
      if (user.imageId && user.imageId !== 'default') {
        await this.deleteUserImage(user.imageId);
      }

      await User.findByIdAndDelete(id);

      console.log(`✅ User deleted: ${user.firstName} ${user.lastName}`);

      res.status(200).json({
        success: true,
        message: "User deleted successfully",
        data: {
          deletedUser: {
            id: user._id,
            name: `${user.firstName} ${user.lastName}`,
            email: user.email
          }
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error deleting user');
    }
  }

  // Get current user profile (for authenticated user)
  async getProfile(req, res) {
    try {
      const userId = req.user?.userId; // Fixed: auth middleware sets userId, not id

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const user = await User.findById(userId)
        .populate('role', 'name description')
        .select('-password')
        .lean();

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      res.status(200).json({
        success: true,
        message: "Profile retrieved successfully",
        data: user
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching profile');
    }
  }

  // Update current user profile
  async updateProfile(req, res) {
    try {
      const userId = req.user?.userId; // Fixed: auth middleware sets userId, not id
      const { firstName, lastName, address, number } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const existingUser = await User.findById(userId);
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      const updateData = {};

      // Update basic fields
      if (firstName?.trim()) updateData.firstName = firstName.trim();
      if (lastName?.trim()) updateData.lastName = lastName.trim();
      if (address?.trim()) updateData.address = address.trim();

      // Validate and update phone number
      if (number?.trim() && number.trim() !== existingUser.number) {
        const numberConflict = await User.findOne({
          number: number.trim(),
          _id: { $ne: userId }
        });

        if (numberConflict) {
          return res.status(409).json({
            success: false,
            message: "Phone number already exists"
          });
        }

        updateData.number = number.trim();
      }

      // Handle profile image update
      if (req.file) {
        const imageUpdateResult = await this.handleImageUpdate(
          req.file.buffer,
          existingUser.imageId
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

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      )
      .populate('role', 'name description')
      .select('-password');

      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: updatedUser
      });

    } catch (error) {
      this.handleError(error, res, 'Error updating profile');
    }
  }

  // Get user statistics
  async getUserStatistics() {
    try {
      const [
        totalUsers,
        activeUsers,
        roleStats
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ status: 'Active' }),
        User.aggregate([
          {
            $lookup: {
              from: 'roles',
              localField: 'role',
              foreignField: '_id',
              as: 'roleInfo'
            }
          },
          {
            $unwind: '$roleInfo'
          },
          {
            $group: {
              _id: '$roleInfo.name',
              count: { $sum: 1 },
              active: {
                $sum: {
                  $cond: [{ $eq: ['$status', 'Active'] }, 1, 0]
                }
              }
            }
          }
        ])
      ]);

      const result = {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
        byRole: {}
      };

      roleStats.forEach(stat => {
        result.byRole[stat._id] = {
          total: stat.count,
          active: stat.active
        };
      });

      return result;
    } catch (error) {
      console.error('Error calculating user statistics:', error);
      return null;
    }
  }

  // Helper methods
  async uploadUserImage(fileBuffer) {
    try {
      const uploadResult = await uploadToCloudinary(fileBuffer, this.cloudinaryOptions);
      return { success: true, data: uploadResult };
    } catch (error) {
      console.error("User image upload error:", error.message);
      return { success: false, message: "Failed to upload image. Please try again." };
    }
  }

  async deleteUserImage(imageId) {
    try {
      await deleteFromCloudinary(imageId);
    } catch (error) {
      console.warn("Failed to delete user image from Cloudinary:", error.message);
    }
  }

  async handleImageUpdate(fileBuffer, oldImageId) {
    try {
      const uploadResult = await uploadToCloudinary(fileBuffer, this.cloudinaryOptions);

      if (oldImageId && oldImageId !== 'default') {
        await this.deleteUserImage(oldImageId);
      }

      return { success: true, data: uploadResult };
    } catch (error) {
      console.error("User image update error:", error.message);
      return { success: false, message: "Failed to update image. Please try again." };
    }
  }

  parseQueryParameters(query) {
    const {
      page = 1,
      limit = this.defaultPaginationLimit,
      role,
      status,
      search,
      sortBy = 'firstName',
      sortOrder = 'asc'
    } = query;

    return {
      pageNum: Math.max(1, parseInt(page)),
      limitNum: Math.min(this.maxPaginationLimit, Math.max(1, parseInt(limit))),
      role,
      status,
      search: search?.trim(),
      sortBy: this.validSortFields.includes(sortBy) ? sortBy : 'firstName',
      sortOrder: sortOrder === 'desc' ? 'desc' : 'asc'
    };
  }

  buildFilter(queryParams) {
    const filter = {};

    if (queryParams.role) {
      filter.role = queryParams.role;
    }

    if (queryParams.status) {
      filter.status = queryParams.status;
    }

    if (queryParams.search) {
      filter.$or = [
        { firstName: { $regex: queryParams.search, $options: 'i' } },
        { lastName: { $regex: queryParams.search, $options: 'i' } },
        { email: { $regex: queryParams.search, $options: 'i' } },
        { number: { $regex: queryParams.search, $options: 'i' } }
      ];
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
      const field = Object.keys(error.keyValue)[0];
      return res.status(409).json({
        success: false,
        message: `${field} already exists`
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// Create singleton instance
const userController = new UserController();

// Export controller methods for route handlers (createUser removed - handled by authController)
export const getAllUsers = (req, res) => userController.getAllUsers(req, res);
export const getUserById = (req, res) => userController.getUserById(req, res);
export const getUsersByRole = (req, res) => userController.getUsersByRole(req, res);
export const updateUser = (req, res) => userController.updateUser(req, res);
export const updateUserStatus = (req, res) => userController.updateUserStatus(req, res);
export const updateUserPassword = (req, res) => userController.updateUserPassword(req, res);
export const deleteUser = (req, res) => userController.deleteUser(req, res);
export const getProfile = (req, res) => userController.getProfile(req, res);
export const updateProfile = (req, res) => userController.updateProfile(req, res);

// Export class for advanced usage
export { UserController };

// Export default instance
export default userController;

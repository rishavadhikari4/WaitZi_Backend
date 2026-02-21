import Role from "../models/Role.js";
import User from "../models/User.js";

class RoleController {
  constructor() {
    this.systemRoles = {
      admin: {
        name: 'admin',
        description: 'System administrator with full access to all features and data'
      }
    };
  }

  async getAllRoles(req, res) {
    try {
      const roles = await this.findAllRoles();
      
      res.status(200).json({
        success: true,
        message: "Roles fetched successfully",
        data: roles
      });
    } catch (error) {
      this.handleError(error, res, 'Error fetching roles');
    }
  }

  async getRoleById(req, res) {
    try {
      const { id } = req.params;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role ID format"
        });
      }

      const role = await this.findRoleById(id);
      
      if (!role) {
        return res.status(404).json({
          success: false,
          message: "Role not found"
        });
      }
      
      res.status(200).json({
        success: true,
        message: "Role retrieved successfully",
        data: role
      });
    } catch (error) {
      this.handleError(error, res, 'Error fetching role');
    }
  }

  async createRole(req, res) {
    try {
      const { name, description } = req.body;
      
      if (!name?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Role name is required"
        });
      }

      const normalizedName = name.toLowerCase().trim();
      
      const existingRole = await this.findRoleByName(normalizedName);
      
      if (existingRole) {
        return res.status(409).json({
          success: false,
          message: "Role already exists",
          data: existingRole
        });
      }

      const roleData = {
        name: normalizedName,
        description: description?.trim() || `${name} role`
      };

      const savedRole = await this.saveRole(roleData);
      console.log(`🆕 Created role: ${savedRole.name}`);
      
      res.status(201).json({
        success: true,
        message: "Role created successfully",
        data: savedRole
      });
    } catch (error) {
      this.handleError(error, res, 'Error creating role');
    }
  }

  async updateRole(req, res) {
    try {
      const { id } = req.params;
      const { name, description } = req.body;
      
      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role ID format"
        });
      }

      const existingRole = await this.findRoleById(id);
      if (!existingRole) {
        return res.status(404).json({
          success: false,
          message: "Role not found"
        });
      }

      if (name?.trim()) {
        const normalizedName = name.toLowerCase().trim();
        const nameConflict = await this.findRoleByNameExcludingId(normalizedName, id);
        
        if (nameConflict) {
          return res.status(409).json({
            success: false,
            message: "Role name already exists"
          });
        }
      }

      const updateData = this.buildUpdateData({ name, description });
      
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid fields provided for update"
        });
      }

      const updatedRole = await this.updateRoleById(id, updateData);
      
      console.log(`✅ Updated role: ${updatedRole.name}`);
      
      res.status(200).json({
        success: true,
        message: "Role updated successfully",
        data: updatedRole
      });
    } catch (error) {
      this.handleError(error, res, 'Error updating role');
    }
  }

  async deleteRole(req, res) {
    try {
      const { id } = req.params;
      
      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role ID format"
        });
      }


      const role = await this.findRoleById(id);
      if (!role) {
        return res.status(404).json({
          success: false,
          message: "Role not found"
        });
      }


      const usersWithRole = await this.countUsersWithRole(id);
      
      if (usersWithRole > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete role. ${usersWithRole} user(s) are assigned to this role`
        });
      }
      
      await this.deleteRoleById(id);
      
      console.log(`🗑️  Deleted role: ${role.name}`);
      
      res.status(200).json({
        success: true,
        message: "Role deleted successfully",
        data: {
          deletedRole: {
            id: role._id,
            name: role.name
          }
        }
      });
    } catch (error) {
      this.handleError(error, res, 'Error deleting role');
    }
  }

  async initializeSystemRoles() {
    try {
      console.log('🔍 Initializing system roles...');
      
      const results = [];
      
      for (const [key, roleData] of Object.entries(this.systemRoles)) {
        const result = await this.createSystemRoleIfNotExists(roleData);
        results.push(result);
      }
      
      const createdRoles = results.filter(r => r.created).length;
      const existingRoles = results.filter(r => !r.created).length;
      
      console.log(`✅ System roles initialized: ${createdRoles} created, ${existingRoles} already existed`);
      
      return {
        success: true,
        message: 'System roles initialized successfully',
        summary: {
          created: createdRoles,
          existing: existingRoles,
          total: results.length
        },
        roles: results
      };
      
    } catch (error) {
      console.error('❌ Error initializing system roles:', error.message);
      throw new Error(`Failed to initialize system roles: ${error.message}`);
    }
  }

  async findAllRoles() {
    return await Role.find({}).lean();
  }

  async findRoleById(id) {
    return await Role.findById(id).lean();
  }

  async findRoleByName(name) {
    return await Role.findOne({ name: name.toLowerCase().trim() });
  }

  async findRoleByNameExcludingId(name, excludeId) {
    return await Role.findOne({ 
      name: name.toLowerCase().trim(),
      _id: { $ne: excludeId }
    });
  }

  async saveRole(roleData) {
    const newRole = new Role(roleData);
    return await newRole.save();
  }

  async updateRoleById(id, updateData) {
    return await Role.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
  }


  async deleteRoleById(id) {
    await Role.findByIdAndDelete(id);
  }

  async countUsersWithRole(roleId) {
    return await User.countDocuments({ role: roleId });
  }

  async createSystemRoleIfNotExists(roleData) {
    const existingRole = await this.findRoleByName(roleData.name);
    
    if (existingRole) {
      return {
        success: true,
        message: `${roleData.name} role already exists`,
        role: existingRole,
        created: false
      };
    }
    
    const savedRole = await this.saveRole(roleData);
    console.log(`✅ Created system role: ${savedRole.name}`);
    
    return {
      success: true,
      message: `${roleData.name} role created successfully`,
      role: savedRole,
      created: true
    };
  }

  buildUpdateData(updateFields) {
    const { name, description } = updateFields;
    const updateData = {};
    
    if (name?.trim()) updateData.name = name.toLowerCase().trim();
    if (description?.trim()) updateData.description = description.trim();

    return updateData;
  }

  isValidObjectId(id) {
    return id?.match(/^[0-9a-fA-F]{24}$/);
  }

  handleError(error, res, context) {
    console.error(`${context}:`, error.message);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: "Invalid role ID format"
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
        message: "Role name already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// Create singleton instance
const roleController = new RoleController();

// Export controller methods for route handlers
export const getAllRoles = (req, res) => roleController.getAllRoles(req, res);
export const getRoleById = (req, res) => roleController.getRoleById(req, res);
export const createRole = (req, res) => roleController.createRole(req, res);
export const updateRole = (req, res) => roleController.updateRole(req, res);
export const deleteRole = (req, res) => roleController.deleteRole(req, res);

// Export initialization function (backward compatible)
export const initializeAdminRole = () => roleController.initializeSystemRoles();

// Export class for advanced usage
export { RoleController };

// Export default instance
export default roleController;
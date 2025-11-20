import Role from "../models/Role.js";
import User from "../models/User.js";

export const getAllRoles = async (req, res) => {
  try {
    const roles = await Role.find({});
    
    res.status(200).json({
      success: true,
      message:"Roles Fetched Successfully",
      data: roles
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getRoleById = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role not found"
      });
    }
    
    res.status(200).json({
      success: true,
      data: role
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const createRole = async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Role name is required"
      });
    }

    const existingRole = await Role.findOne({ name: name.toLowerCase().trim() });
    
    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: "Role already exists",
        data: existingRole
      });
    }

    const newRole = new Role({
      name: name.toLowerCase().trim(),
      description: description?.trim() || `${name} role`
    });

    const savedRole = await newRole.save();
    console.log(`🆕 Created role: ${savedRole.name}`);
    
    res.status(201).json({
      success: true,
      message: "Role created successfully",
      data: savedRole
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const updateRole = async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (name) {
      const existingRole = await Role.findOne({ 
        name: name.toLowerCase().trim(),
        _id: { $ne: req.params.id }
      });
      
      if (existingRole) {
        return res.status(400).json({
          success: false,
          message: "Role name already exists"
        });
      }
    }
    
    const updatedRole = await Role.findByIdAndUpdate(
      req.params.id,
      {
        ...(name && { name: name.toLowerCase().trim() }),
        ...(description && { description: description.trim() })
      },
      { new: true, runValidators: true }
    );
    
    if (!updatedRole) {
      return res.status(404).json({
        success: false,
        message: "Role not found"
      });
    }
    
    res.status(200).json({
      success: true,
      message: "Role updated successfully",
      data: updatedRole
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

export const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;
    
    const usersWithRole = await User.countDocuments({ role: id });
    
    if (usersWithRole > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. ${usersWithRole} user(s) are assigned to this role`
      });
    }
    
    const deletedRole = await Role.findByIdAndDelete(id);
    
    if (!deletedRole) {
      return res.status(404).json({
        success: false,
        message: "Role not found"
      });
    }
    
    res.status(200).json({
      success: true,
      message: "Role deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Initialize admin role - only creates if it doesn't exist
 * This function should be called once during application startup
 */
export const initializeAdminRole = async () => {
  try {
    console.log('🔍 Checking for admin role...');
    
    // Check if admin role already exists
    const existingAdminRole = await Role.findOne({ name: 'admin' });
    
    if (existingAdminRole) {
      console.log('✅ Admin role already exists');
      return {
        success: true,
        message: 'Admin role already exists',
        role: existingAdminRole,
        created: false
      };
    }
    
    // Create admin role if it doesn't exist
    const adminRole = new Role({
      name: 'admin',
      description: 'System administrator with full access to all features and data'
    });
    
    const savedAdminRole = await adminRole.save();
    console.log('✅ Admin role created successfully');
    
    return {
      success: true,
      message: 'Admin role created successfully',
      role: savedAdminRole,
      created: true
    };
    
  } catch (error) {
    console.error('❌ Error initializing admin role:', error.message);
    throw new Error(`Failed to initialize admin role: ${error.message}`);
  }
};
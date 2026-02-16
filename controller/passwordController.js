import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

class PasswordController {
  constructor() {
    this.saltRounds = 12;
    this.resetTokenExpiry = 15 * 60 * 1000; // 15 minutes
  }

  // Request password reset (forgot password)
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required"
        });
      }

      const user = await User.findOne({ 
        email: email.toLowerCase().trim(),
        status: 'Active'
      }).populate('role');

      if (!user) {
        // Don't reveal if email exists for security
        return res.status(200).json({
          success: true,
          message: "If an account with that email exists, a reset link has been sent"
        });
      }

      // Generate secure reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
      
      // Set reset token and expiry
      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = new Date(Date.now() + this.resetTokenExpiry);
      await user.save();

      // In a real application, send email here
      // For now, we'll return the token (remove in production)
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
      
      // TODO: Send email with reset link
      console.log(`🔑 Password reset requested for ${email}`);
      console.log(`🔗 Reset URL: ${resetUrl}`);
      
      const response = {
        success: true,
        message: "Password reset link sent to your email",
      };

      // Only include reset token in development
      if (process.env.NODE_ENV === 'development') {
        response.developmentOnly = {
          resetToken,
          resetUrl,
          expiresAt: user.resetPasswordExpires
        };
      }

      res.status(200).json(response);

    } catch (error) {
      this.handleError(error, res, 'Error processing forgot password request');
    }
  }

  // Reset password using token
  async resetPassword(req, res) {
    try {
      const { token, newPassword, confirmPassword } = req.body;

      if (!token || !newPassword || !confirmPassword) {
        return res.status(400).json({
          success: false,
          message: "Token, new password, and confirm password are required"
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          success: false,
          message: "Passwords do not match"
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters long"
        });
      }

      // Hash the token to compare with stored hash
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      
      // Find user with valid reset token
      const user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired reset token"
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, this.saltRounds);
      
      // Update password and clear reset token
      user.password = hashedPassword;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      user.passwordChangedAt = new Date();
      await user.save();

      console.log(`🔑 Password reset successfully for user: ${user.email}`);

      res.status(200).json({
        success: true,
        message: "Password reset successful. You can now login with your new password."
      });

    } catch (error) {
      this.handleError(error, res, 'Error resetting password');
    }
  }

  // Change password for authenticated user
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body;
      const userId = req.user.userId;

      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password, new password, and confirm password are required"
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          success: false,
          message: "New passwords do not match"
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters long"
        });
      }

      if (currentPassword === newPassword) {
        return res.status(400).json({
          success: false,
          message: "New password must be different from current password"
        });
      }

      // Find user
      const user = await User.findById(userId);
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
      const hashedNewPassword = await bcrypt.hash(newPassword, this.saltRounds);
      
      // Update password
      user.password = hashedNewPassword;
      user.passwordChangedAt = new Date();
      await user.save();

      console.log(`🔑 Password changed successfully for user: ${user.email}`);

      res.status(200).json({
        success: true,
        message: "Password changed successfully"
      });

    } catch (error) {
      this.handleError(error, res, 'Error changing password');
    }
  }

  // Validate reset token (check if token is valid without resetting)
  async validateResetToken(req, res) {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: "Reset token is required"
        });
      }

      // Hash the token to compare with stored hash
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      
      // Find user with valid reset token
      const user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: Date.now() }
      }).select('email resetPasswordExpires');

      if (!user) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired reset token"
        });
      }

      res.status(200).json({
        success: true,
        message: "Reset token is valid",
        data: {
          email: user.email,
          expiresAt: user.resetPasswordExpires,
          timeRemaining: Math.max(0, Math.floor((user.resetPasswordExpires - Date.now()) / 1000))
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error validating reset token');
    }
  }

  // Generate temporary password (admin function)
  async generateTemporaryPassword(req, res) {
    try {
      const { userId } = req.params;
      const adminUser = req.user;

      // Verify admin permissions
      if (adminUser.role.name.toLowerCase() !== 'admin') {
        return res.status(403).json({
          success: false,
          message: "Only admins can generate temporary passwords"
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      // Generate temporary password
      const tempPassword = crypto.randomBytes(8).toString('hex');
      const hashedTempPassword = await bcrypt.hash(tempPassword, this.saltRounds);
      
      // Update user password
      user.password = hashedTempPassword;
      user.passwordChangedAt = new Date();
      user.mustChangePassword = true; // Flag to force password change on next login
      await user.save();

      console.log(`🔑 Temporary password generated for user: ${user.email} by admin: ${adminUser.email}`);

      res.status(200).json({
        success: true,
        message: "Temporary password generated successfully",
        data: {
          temporaryPassword: tempPassword,
          email: user.email,
          mustChangePassword: true
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error generating temporary password');
    }
  }

  // Helper method for error handling
  handleError(error, res, context) {
    console.error(`${context}:`, error.message);

    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: validationErrors
      });
    }

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format"
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// Create singleton instance
const passwordController = new PasswordController();

// Export controller methods for route handlers
export const forgotPassword = (req, res) => passwordController.forgotPassword(req, res);
export const resetPassword = (req, res) => passwordController.resetPassword(req, res);
export const changePassword = (req, res) => passwordController.changePassword(req, res);
export const validateResetToken = (req, res) => passwordController.validateResetToken(req, res);
export const generateTemporaryPassword = (req, res) => passwordController.generateTemporaryPassword(req, res);

// Export class for advanced usage
export { PasswordController };

// Export default instance
export default passwordController;
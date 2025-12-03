import User from "../models/User.js";
import Role from "../models/Role.js";
import bcrypt from "bcryptjs";
import TokenHelper from "../utils/tokenHelper.js";

class AuthController {
  constructor() {
    this.saltRounds = 12;
    this.cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    };
  }

  async findExistingRole(identifier) {
    try {
      let role;

      if (typeof identifier === 'string' && identifier.match(/^[0-9a-fA-F]{24}$/)) {
        role = await Role.findById(identifier);
        if (!role) {
          throw new Error(`Role with ID ${identifier} not found`);
        }
        return role;
      }

      const roleName = identifier.toLowerCase().trim();
      role = await Role.findOne({ name: roleName });

      if (!role) {
        throw new Error(`Role '${roleName}' does not exist. Please create the role first or use an existing role.`);
      }

      return role;
    } catch (error) {
      throw new Error(`Role validation error: ${error.message}`);
    }
  }

  async createUser(req, res) {
    try {
      const { firstName, lastName, address, number, email, password, role } = req.body;

      const existingUser = await User.findOne({ 
        $or: [{ email: email.toLowerCase().trim() }, { number: number.trim() }] 
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "User with this email or phone number already exists"
        });
      }

      let userRole;
      try {
        userRole = await this.findExistingRole(role);
      } catch (roleError) {
        return res.status(400).json({
          success: false,
          message: roleError.message
        });
      }

      const hashedPassword = await this.hashPassword(password);

      const newUser = new User({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        number: number.trim(),
        address: address?.trim() || '',
        role: userRole._id
      });

      const savedUser = await newUser.save();
      await savedUser.populate('role');

      const userResponse = this.sanitizeUserResponse(savedUser);

      res.status(201).json({
        success: true,
        message: "User created successfully",
        data: userResponse
      });

    } catch (error) {
      this.handleError(error, res, 'Error creating user');
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ 
        email: email.toLowerCase().trim(),
        status: 'Active'
      }).populate('role');

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password"
        });
      }

      const isPasswordValid = await this.verifyPassword(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password"
        });
      }

      const tokens = this.generateTokens(user);
      
      res.cookie('refreshToken', tokens.refreshToken, this.cookieOptions);

      const userResponse = this.sanitizeUserResponse(user);

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          user: userResponse,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn
        },
        meta: {
          loginTime: new Date().toISOString(),
          tokenType: 'Bearer'
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Login error');
    }
  }

  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: "Refresh token is required"
        });
      }

      let decoded;
      try {
        decoded = TokenHelper.verifyRefreshToken(refreshToken);
      } catch (tokenError) {
        return res.status(401).json({
          success: false,
          message: tokenError.message
        });
      }

      const user = await User.findById(decoded.userId).populate('role');
      if (!user || user.status !== 'Active') {
        return res.status(401).json({
          success: false,
          message: "User not found or inactive"
        });
      }

      const tokens = this.generateTokens(user);

      res.status(200).json({
        success: true,
        message: "Token refreshed successfully",
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Token refresh error');
    }
  }

  async logout(req, res) {
    try {
      res.clearCookie('refreshToken');

      res.status(200).json({
        success: true,
        message: "Logout successful"
      });
    } catch (error) {
      this.handleError(error, res, 'Logout error');
    }
  }

  async verifyToken(req, res) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).json({
          success: false,
          message: "Authorization header is missing"
        });
      }

      let token, decoded;
      try {
        token = TokenHelper.extractTokenFromHeader(authHeader);
        decoded = TokenHelper.verifyAccessToken(token);
      } catch (tokenError) {
        return res.status(401).json({
          success: false,
          message: tokenError.message
        });
      }

      const user = await User.findById(decoded.userId).populate('role');
      if (!user || user.status !== 'Active') {
        return res.status(401).json({
          success: false,
          message: "User not found or inactive"
        });
      }

      const userResponse = this.sanitizeUserResponse(user);

      res.status(200).json({
        success: true,
        message: "Token is valid",
        data: {
          user: userResponse,
          isNearExpiry: TokenHelper.isTokenNearExpiry(token)
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Token verification error');
    }
  }

  async hashPassword(password) {
    const salt = await bcrypt.genSalt(this.saltRounds);
    return await bcrypt.hash(password, salt);
  }

  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  generateTokens(user) {
    const tokenPayload = {
      userId: user._id,
      email: user.email,
      role: {
        id: user.role._id,
        name: user.role.name
      }
    };

    return TokenHelper.generateTokenPair(tokenPayload);
  }

  sanitizeUserResponse(user) {
    const { password, ...userResponse } = user.toObject();
    return userResponse;
  }

  handleError(error, res, message) {
    console.error(`${message}:`, error.message);

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `${field} already exists`
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

    res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
}

const authController = new AuthController();

export const createUser = (req, res) => authController.createUser(req, res);
export const login = (req, res) => authController.login(req, res);
export const refreshToken = (req, res) => authController.refreshToken(req, res);
export const logout = (req, res) => authController.logout(req, res);
export const verifyToken = (req, res) => authController.verifyToken(req, res);

export { AuthController };
export default authController;
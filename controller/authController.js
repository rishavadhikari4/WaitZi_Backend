import User from "../models/User.js";
import Role from "../models/Role.js";
import bcrypt from "bcryptjs";
import TokenHelper from "../utils/tokenHelper.js";

const findExistingRole = async (identifier) => {
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
};

export const createUser = async (req, res) => {
    try {
        const { firstName, lastName, address, number, email, password, role } = req.body;

        const existingUser = await User.findOne({ 
            $or: [{ email }, { number }] 
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User with this email or phone number already exists",
            });
        }

        let userRole;
        try {
            userRole = await findExistingRole(role);
        } catch (roleError) {
            return res.status(400).json({
                success: false,
                message: roleError.message
            });
        }

        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            number: number.trim(),
            address: address.trim(),
            role: userRole._id,
        });

        const savedUser = await newUser.save();
        await savedUser.populate('role');

        const { password: _, ...userResponse } = savedUser.toObject();

        res.status(201).json({
            success: true,
            message: "User created successfully",
            data: userResponse
        });
    } catch (error) {
        console.error("Error creating user:", error.message);

        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                success: false,
                message: `${field} already exists`,
            });
        }

        res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

export const login = async (req, res) => {
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

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        // Generate token pair using TokenHelper
        const tokenPayload = {
            userId: user._id,
            email: user.email,
            role: {
                id: user.role._id,
                name: user.role.name
            }
        };

        let tokens;
        try {
            tokens = TokenHelper.generateTokenPair(tokenPayload);
        } catch (tokenError) {
            console.error("Token generation error:", tokenError.message);
            return res.status(500).json({
                success: false,
                message: "Error generating authentication tokens"
            });
        }

        const { password: _, ...userResponse } = user.toObject();

        // Set refresh token as httpOnly cookie (optional security enhancement)
        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

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
        console.error("Login error:", error.message);
        res.status(500).json({
            success: false,
            message: "Internal server error during login"
        });
    }
};

export const refreshToken = async (req, res) => {
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

        const tokenPayload = {
            userId: user._id,
            email: user.email,
            role: {
                id: user.role._id,
                name: user.role.name
            }
        };

        const tokens = TokenHelper.generateTokenPair(tokenPayload);

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
        console.error("Token refresh error:", error.message);
        res.status(500).json({
            success: false,
            message: "Internal server error during token refresh"
        });
    }
};

export const logout = async (req, res) => {
    try {
        // Clear refresh token cookie
        res.clearCookie('refreshToken');

        res.status(200).json({
            success: true,
            message: "Logout successful"
        });
    } catch (error) {
        console.error("Logout error:", error.message);
        res.status(500).json({
            success: false,
            message: "Internal server error during logout"
        });
    }
};

export const verifyToken = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "Authorization header is missing"
            });
        }

        let token;
        try {
            token = TokenHelper.extractTokenFromHeader(authHeader);
        } catch (extractError) {
            return res.status(401).json({
                success: false,
                message: extractError.message
            });
        }

        let decoded;
        try {
            decoded = TokenHelper.verifyAccessToken(token);
        } catch (verifyError) {
            return res.status(401).json({
                success: false,
                message: verifyError.message
            });
        }

        // Find user and populate role
        const user = await User.findById(decoded.userId).populate('role');

        if (!user || user.status !== 'Active') {
            return res.status(401).json({
                success: false,
                message: "User not found or inactive"
            });
        }

        // Remove password from response
        const { password: _, ...userResponse } = user.toObject();

        res.status(200).json({
            success: true,
            message: "Token is valid",
            data: {
                user: userResponse,
                isNearExpiry: TokenHelper.isTokenNearExpiry(token)
            }
        });

    } catch (error) {
        console.error("Token verification error:", error.message);
        res.status(500).json({
            success: false,
            message: "Internal server error during token verification"
        });
    }
};
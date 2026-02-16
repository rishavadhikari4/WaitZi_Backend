import TokenHelper from "../utils/tokenHelper.js";
import User from "../models/User.js";

class AuthMiddleware {
    constructor() {
        this.authenticate = this.authenticate.bind(this);
        this.optionalAuthenticate = this.optionalAuthenticate.bind(this);
    }

    async authenticate(req, res, next) {
        try {
            if (!req?.headers) {
                return res.status(500).json({ 
                    success: false,
                    message: "Internal Server Error" 
                });
            }

            let token;
            try {
                // Try to extract token from either Authorization header or cookies
                token = TokenHelper.extractToken(req);
            } catch (extractError) {
                console.log('Auth middleware - token extraction failed:', extractError.message);
                return res.status(401).json({ 
                    success: false,
                    message: extractError.message,
                    debug: {
                        hasAuthHeader: !!req.headers.authorization,
                        hasCookies: !!req.cookies,
                        cookieNames: Object.keys(req.cookies || {}),
                        requestPath: req.path
                    }
                });
            }

            let decoded;
            try {
                decoded = TokenHelper.verifyAccessToken(token);
            } catch (verifyError) {
                console.log('Auth middleware - token verification failed:', verifyError.message);
                return res.status(401).json({ 
                    success: false,
                    message: verifyError.message 
                });
            }

            const user = await User.findById(decoded.userId).populate('role');
            
            if (!user) {
                return res.status(401).json({ 
                    success: false,
                    message: "User not found" 
                });
            }

            if (user.status !== 'Active') {
                return res.status(401).json({ 
                    success: false,
                    message: "User account is inactive" 
                });
            }

            req.user = {
                userId: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: {
                    id: user.role._id,
                    name: user.role.name,
                    description: user.role.description
                },
                status: user.status
            };

            if (TokenHelper.isTokenNearExpiry(token)) {
                res.set('X-Token-Warning', 'Token expires soon');
            }

            console.log(`✅ Authentication successful for user: ${user.email}`);
            next();
        } catch (error) {
            console.error("Authentication middleware error:", error.message);
            
            return res.status(500).json({ 
                success: false,
                message: "Server error during authentication" 
            });
        }
    }

    async optionalAuthenticate(req, res, next) {
        try {
            let token;
            
            try {
                // Try to extract token from either Authorization header or cookies
                token = TokenHelper.extractToken(req);
            } catch (extractError) {
                req.user = null;
                return next();
            }

            try {
                const decoded = TokenHelper.verifyAccessToken(token);
                const user = await User.findById(decoded.userId).populate('role');
                
                if (user && user.status === 'Active') {
                    req.user = {
                        userId: user._id,
                        email: user.email,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        role: {
                            id: user.role._id,
                            name: user.role.name,
                            description: user.role.description
                        },
                        status: user.status
                    };
                } else {
                    req.user = null;
                }
            } catch (authError) {
                req.user = null;
            }

            next();
        } catch (error) {
            console.error("Optional auth middleware error:", error.message);
            req.user = null;
            next();
        }
    }
}

const authMiddlewareInstance = new AuthMiddleware();

export const authMiddleware = authMiddlewareInstance.authenticate;
export const optionalAuthMiddleware = authMiddlewareInstance.optionalAuthenticate;

export default authMiddlewareInstance;

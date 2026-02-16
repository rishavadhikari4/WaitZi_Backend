class RoleMiddleware {
    constructor() {
        this.authorizeRole = this.authorizeRole.bind(this);
    }

    authorizeRole(allowedRoles, options = {}) {
        const { strict = false, adminOverride = true } = options;
        
        return async (req, res, next) => {
            try {
                if (!req.user) {
                    return res.status(401).json({
                        success: false,
                        message: "Authentication required"
                    });
                }

                const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
                const normalizedRoles = rolesArray.map(role => role.toLowerCase().trim());

                const userRole = req.user.role.name.toLowerCase().trim();

                if (adminOverride && userRole === 'admin') {
                    return next();
                }

                const hasPermission = normalizedRoles.includes(userRole);

                if (!hasPermission) {
                    return res.status(403).json({
                        success: false,
                        message: `Access denied. Required role(s): ${rolesArray.join(', ')}. Your role: ${req.user.role.name}`,
                        details: {
                            userRole: req.user.role.name,
                            requiredRoles: rolesArray,
                            strict: strict
                        }
                    });
                }

                req.roleInfo = {
                    userRole: req.user.role.name,
                    allowedRoles: rolesArray,
                    isAdmin: userRole === 'admin'
                };

                next();
            } catch (error) {
                console.error("Role authorization error:", error.message);
                return res.status(500).json({
                    success: false,
                    message: "Server error during role authorization"
                });
            }
        };
    }
}

const roleMiddleware = new RoleMiddleware();

export const authorizeRole = (allowedRoles, options = {}) => roleMiddleware.authorizeRole(allowedRoles, options);

// Export the roleMiddleware as named export for compatibility
export { roleMiddleware };

export default roleMiddleware;
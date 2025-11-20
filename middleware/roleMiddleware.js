
export const authorizeRole = (allowedRoles, options = {}) => {
    const { strict = false, adminOverride = true } = options;
    
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required"
                });
            }

            // Normalize allowed roles to array
            const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
            const normalizedRoles = rolesArray.map(role => role.toLowerCase().trim());

            // Get user's role
            const userRole = req.user.role.name.toLowerCase().trim();

            // Admin override check (if enabled)
            if (adminOverride && userRole === 'admin') {
                return next();
            }

            // Check if user's role is in allowed roles
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

            // Add role info to request for use in route handlers
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
};
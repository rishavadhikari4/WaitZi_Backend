import { body, param, validationResult } from "express-validator";

// Fixed validation middleware
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: errors.array()
        });
    }
    next();
};

const createUserValidation = [
    body('firstName')
        .trim()
        .notEmpty()
        .withMessage("First Name is required")
        .isLength({ min: 2, max: 50 })
        .withMessage("First Name must be between 2-50 characters")
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage("First Name can only contain letters and spaces"),
    
    body('lastName')
        .trim()
        .notEmpty()
        .withMessage("Last Name is required")
        .isLength({ min: 2, max: 50 })
        .withMessage("Last Name must be between 2-50 characters")
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage("Last Name can only contain letters and spaces"),
    
    body('email')
        .isEmail()
        .withMessage('Valid email is required')
        .normalizeEmail()
        .toLowerCase(),
    
    body('number')
        .isMobilePhone('any', { strictMode: false })
        .withMessage('Valid phone number is required')
        .isLength({ min: 10, max: 15 })
        .withMessage('Phone number must be between 10-15 digits'),
    
    body('address')
        .trim()
        .notEmpty()
        .withMessage("Address is required")
        .isLength({ min: 5, max: 200 })
        .withMessage("Address must be between 5-200 characters"),
    
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    
    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Password confirmation does not match password');
            }
            return true;
        }),
    
    body('role')
        .notEmpty()
        .withMessage("Role is required"),
    
    validate 
];

const loginValidation = [
  body('email')
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required'),
  validate
];


const validateUserId = [
    param('id')
        .isMongoId()
        .withMessage('Valid user ID is required'),
    
    validate
];

export {
    validate,
    createUserValidation,
    loginValidation,
    validateUserId
};
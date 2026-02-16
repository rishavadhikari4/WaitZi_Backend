import { body, query, param, validationResult } from 'express-validator';

// Helper function to handle validation errors
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// User update validation (no creation - handled by auth)
export const validateUserUpdate = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid user ID'),

  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2-50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('First name must contain only letters and spaces'),

  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2-50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Last name must contain only letters and spaces'),

  body('email')
    .optional()
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),

  body('number')
    .optional()
    .trim()
    .matches(/^(\+977)?9[78]\d{8}$/)
    .withMessage('Valid Nepali phone number is required (e.g. 98XXXXXXXX or +97798XXXXXXXX)'),

  body('address')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Address must be between 5-200 characters'),

  body('role')
    .optional()
    .isMongoId()
    .withMessage('Please provide a valid role ID'),

  body('status')
    .optional()
    .isIn(['Active', 'Inactive'])
    .withMessage('Status must be either Active or Inactive'),

  handleValidationErrors
];

// User status update validation
export const validateUserStatusUpdate = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid user ID'),

  body('status')
    .isIn(['Active', 'Inactive'])
    .withMessage('Status must be either Active or Inactive'),

  handleValidationErrors
];

// Password update validation
export const validatePasswordUpdate = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid user ID'),

  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),

  body('newPassword')
    .isLength({ min: 6, max: 100 })
    .withMessage('New password must be between 6-100 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number'),

  handleValidationErrors
];

// Profile update validation
export const validateProfileUpdate = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2-50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('First name must contain only letters and spaces'),

  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2-50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Last name must contain only letters and spaces'),

  body('address')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Address must be between 5-200 characters'),

  body('number')
    .optional()
    .trim()
    .matches(/^(\+977)?9[78]\d{8}$/)
    .withMessage('Valid Nepali phone number is required (e.g. 98XXXXXXXX or +97798XXXXXXXX)'),

  handleValidationErrors
];

// User query validation
export const validateUserQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1-100'),

  query('role')
    .optional()
    .isMongoId()
    .withMessage('Role must be a valid MongoDB ID'),

  query('status')
    .optional()
    .isIn(['Active', 'Inactive'])
    .withMessage('Status must be either Active or Inactive'),

  query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1-100 characters'),

  query('sortBy')
    .optional()
    .isIn(['firstName', 'lastName', 'email', 'createdAt', 'updatedAt', 'status'])
    .withMessage('Invalid sort field'),

  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be either asc or desc'),

  handleValidationErrors
];

// Users by role query validation
export const validateUsersByRoleQuery = [
  param('roleId')
    .isMongoId()
    .withMessage('Please provide a valid role ID'),

  query('status')
    .optional()
    .custom((value) => {
      if (value === 'all') return true;
      return ['Active', 'Inactive'].includes(value);
    })
    .withMessage('Status must be Active, Inactive, or all'),

  handleValidationErrors
];

// MongoDB ID validation
export const validateMongoId = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid ID'),

  handleValidationErrors
];
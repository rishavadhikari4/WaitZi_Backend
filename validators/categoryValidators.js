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

// Category creation validation
export const validateCategoryCreation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Category name must be between 2-100 characters'),

  body('description')
    .trim()
    .isLength({ min: 2, max: 500 })
    .withMessage('Description must be between 2-500 characters'),

  handleValidationErrors
];

// Category update validation
export const validateCategoryUpdate = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid category ID'),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Category name must be between 2-100 characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ min: 2, max: 500 })
    .withMessage('Description must be between 2-500 characters'),

  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean value'),

  handleValidationErrors
];

// Category query validation
export const validateCategoryQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1-50'),

  query('isActive')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('isActive must be true or false'),

  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search query must not exceed 100 characters'),

  query('sortBy')
    .optional()
    .isIn(['name', 'createdAt', 'updatedAt', 'isActive'])
    .withMessage('Invalid sort field'),

  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be either asc or desc'),

  handleValidationErrors
];

// MongoDB ID validation
export const validateMongoId = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid category ID'),

  handleValidationErrors
];

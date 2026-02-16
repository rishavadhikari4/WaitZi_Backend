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

// Menu item creation validation
export const validateMenuItemCreation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Menu item name must be between 2-100 characters'),

  body('category')
    .isMongoId()
    .withMessage('Please provide a valid category ID'),

  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),

  body('availabilityStatus')
    .optional()
    .isIn(['Available', 'Out of Stock'])
    .withMessage('Availability status must be either Available or Out of Stock'),

  handleValidationErrors
];

// Menu item update validation
export const validateMenuItemUpdate = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid menu item ID'),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Menu item name must be between 2-100 characters'),

  body('category')
    .optional()
    .isMongoId()
    .withMessage('Please provide a valid category ID'),

  body('price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),

  body('availabilityStatus')
    .optional()
    .isIn(['Available', 'Out of Stock'])
    .withMessage('Availability status must be either Available or Out of Stock'),

  handleValidationErrors
];

// Availability status update validation
export const validateAvailabilityUpdate = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid menu item ID'),

  body('availabilityStatus')
    .isIn(['Available', 'Out of Stock'])
    .withMessage('Availability status must be either Available or Out of Stock'),

  handleValidationErrors
];

// Get menu query validation
export const validateMenuQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1-50'),

  query('category')
    .optional()
    .isMongoId()
    .withMessage('Category must be a valid MongoDB ID'),

  query('availabilityStatus')
    .optional()
    .isIn(['Available', 'Out of Stock'])
    .withMessage('Availability status must be either Available or Out of Stock'),

  query('minPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum price must be a positive number'),

  query('maxPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum price must be a positive number'),

  query('sortBy')
    .optional()
    .isIn(['name', 'price', 'createdAt', 'updatedAt', 'availabilityStatus'])
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
    .withMessage('Please provide a valid ID'),

  handleValidationErrors
];

export const validateCategoryId = [
  param('categoryId')
    .isMongoId()
    .withMessage('Please provide a valid category ID'),

  handleValidationErrors
];
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

// Order creation validation (for QR code customers)
export const validateOrderCreation = [
  body('tableId')
    .isMongoId()
    .withMessage('Please provide a valid table ID'),

  body('customerName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Customer name must be between 2-100 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Customer name must contain only letters and spaces'),

  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required'),

  body('items.*.menuItem')
    .isMongoId()
    .withMessage('Each item must have a valid menu item ID'),

  body('items.*.quantity')
    .isInt({ min: 1, max: 20 })
    .withMessage('Quantity must be between 1-20'),

  body('items.*.notes')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Notes must not exceed 200 characters'),

  body('note')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Order note must not exceed 500 characters'),

  body('discount')
    .optional()
    .isFloat({ min: 0, max: 10000 })
    .withMessage('Discount must be a positive number'),

  handleValidationErrors
];

// Order status update validation
export const validateOrderStatusUpdate = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid order ID'),

  body('status')
    .isIn(['Pending', 'InKitchen', 'Cancelled', 'Served', 'Paid'])
    .withMessage('Status must be Pending, InKitchen, Cancelled, Served, or Paid'),

  body('cookedBy')
    .optional()
    .isMongoId()
    .withMessage('Cooked by must be a valid user ID'),

  body('servedBy')
    .optional()
    .isMongoId()
    .withMessage('Served by must be a valid user ID'),

  handleValidationErrors
];

// Order item status update validation
export const validateOrderItemStatusUpdate = [
  param('orderId')
    .isMongoId()
    .withMessage('Please provide a valid order ID'),

  param('itemId')
    .isMongoId()
    .withMessage('Please provide a valid item ID'),

  body('status')
    .isIn(['Pending', 'Cooking', 'Ready', 'Served'])
    .withMessage('Item status must be Pending, Cooking, Ready, or Served'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Notes must not exceed 200 characters'),

  handleValidationErrors
];

// Add items to order validation
export const validateAddItemsToOrder = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid order ID'),

  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required'),

  body('items.*.menuItem')
    .isMongoId()
    .withMessage('Each item must have a valid menu item ID'),

  body('items.*.quantity')
    .isInt({ min: 1, max: 20 })
    .withMessage('Quantity must be between 1-20'),

  body('items.*.notes')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Notes must not exceed 200 characters'),

  handleValidationErrors
];

// Cancel order validation
export const validateCancelOrder = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid order ID'),

  body('reason')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Cancellation reason must not exceed 300 characters'),

  handleValidationErrors
];

// Order query validation
export const validateOrderQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1-100'),

  query('status')
    .optional()
    .isIn(['Pending', 'InKitchen', 'Cancelled', 'Served', 'Paid'])
    .withMessage('Status must be Pending, InKitchen, Cancelled, Served, or Paid'),

  query('table')
    .optional()
    .isMongoId()
    .withMessage('Table must be a valid MongoDB ID'),

  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date'),

  query('sortBy')
    .optional()
    .isIn(['createdAt', 'updatedAt', 'totalAmount', 'finalAmount', 'status'])
    .withMessage('Invalid sort field'),

  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be either asc or desc'),

  handleValidationErrors
];

// Kitchen orders query validation
export const validateKitchenOrdersQuery = [
  query('status')
    .optional()
    .isIn(['Pending', 'InKitchen', 'all'])
    .withMessage('Kitchen status must be Pending, InKitchen, or all'),

  handleValidationErrors
];

// MongoDB ID validation
export const validateMongoId = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid ID'),

  handleValidationErrors
];

export const validateTableId = [
  param('tableId')
    .isMongoId()
    .withMessage('Please provide a valid table ID'),

  handleValidationErrors
];
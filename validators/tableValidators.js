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

// Table creation validation
export const validateTableCreation = [
  body('tableNumber')
    .isInt({ min: 1, max: 999 })
    .withMessage('Table number must be between 1-999'),

  body('capacity')
    .isInt({ min: 1, max: 20 })
    .withMessage('Table capacity must be between 1-20 people'),

  body('assignedWaiter')
    .optional()
    .isMongoId()
    .withMessage('Assigned waiter must be a valid user ID'),

  handleValidationErrors
];

// Table update validation
export const validateTableUpdate = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid table ID'),

  body('tableNumber')
    .optional()
    .isInt({ min: 1, max: 999 })
    .withMessage('Table number must be between 1-999'),

  body('capacity')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Table capacity must be between 1-20 people'),

  body('status')
    .optional()
    .isIn(['Available', 'Occupied', 'Reserved'])
    .withMessage('Status must be Available, Occupied, or Reserved'),

  body('assignedWaiter')
    .optional()
    .custom((value) => {
      if (value === null || value === '') return true;
      return /^[0-9a-fA-F]{24}$/.test(value);
    })
    .withMessage('Assigned waiter must be a valid user ID or null'),

  handleValidationErrors
];

// Table status update validation
export const validateTableStatusUpdate = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid table ID'),

  body('status')
    .isIn(['Available', 'Occupied', 'Reserved'])
    .withMessage('Status must be Available, Occupied, or Reserved'),

  handleValidationErrors
];

// Assign order to table validation
export const validateOrderAssignment = [
  body('tableId')
    .isMongoId()
    .withMessage('Please provide a valid table ID'),

  body('orderId')
    .isMongoId()
    .withMessage('Please provide a valid order ID'),

  handleValidationErrors
];

// Table query validation
export const validateTableQuery = [
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
    .isIn(['Available', 'Occupied', 'Reserved'])
    .withMessage('Status must be Available, Occupied, or Reserved'),

  query('capacity')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Capacity must be between 1-20'),

  query('assignedWaiter')
    .optional()
    .isMongoId()
    .withMessage('Assigned waiter must be a valid user ID'),

  query('sortBy')
    .optional()
    .isIn(['tableNumber', 'capacity', 'status', 'createdAt'])
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
export const validateTableId = [
  param('tableId')
    .isMongoId()
    .withMessage('Please provide a valid ID'),

  handleValidationErrors
];

export const validateTableNumber = [
  param('tableNumber')
    .isInt({ min: 1, max: 999 })
    .withMessage('Table number must be between 1-999'),

  handleValidationErrors
];
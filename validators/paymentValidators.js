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

// Payment processing validation
export const validatePaymentProcessing = [
  body('orderId')
    .isMongoId()
    .withMessage('Please provide a valid order ID'),

  body('paymentMethod')
    .isIn(['Cash', 'Card', 'Fonepay', 'NepalPay', 'Khalti'])
    .withMessage('Payment method must be Cash, Card, Fonepay, NepalPay, or Khalti'),

  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number'),

  body('transactionId')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Transaction ID must be between 1-100 characters'),

  body('handledBy')
    .optional()
    .isMongoId()
    .withMessage('Handled by must be a valid user ID'),

  handleValidationErrors
];

// Payment status update validation
export const validatePaymentStatusUpdate = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid payment ID'),

  body('paymentStatus')
    .isIn(['Paid', 'Pending', 'Failed', 'Refunded'])
    .withMessage('Payment status must be Paid, Pending, Failed, or Refunded'),

  body('transactionId')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Transaction ID must be between 1-100 characters'),

  body('handledBy')
    .optional()
    .isMongoId()
    .withMessage('Handled by must be a valid user ID'),

  handleValidationErrors
];

// Refund processing validation
export const validateRefundProcessing = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid payment ID'),

  body('refundAmount')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Refund amount must be a positive number'),

  body('reason')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Refund reason must not exceed 300 characters'),

  body('handledBy')
    .optional()
    .isMongoId()
    .withMessage('Handled by must be a valid user ID'),

  handleValidationErrors
];

// Payment query validation
export const validatePaymentQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1-100'),

  query('paymentStatus')
    .optional()
    .isIn(['Paid', 'Pending', 'Failed', 'Refunded'])
    .withMessage('Payment status must be Paid, Pending, Failed, or Refunded'),

  query('paymentMethod')
    .optional()
    .isIn(['Cash', 'Card', 'Fonepay', 'NepalPay', 'Khalti'])
    .withMessage('Payment method must be Cash, Card, Fonepay, NepalPay, or Khalti'),

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
    .isIn(['paymentTime', 'amount', 'createdAt', 'updatedAt'])
    .withMessage('Invalid sort field'),

  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be either asc or desc'),

  handleValidationErrors
];

// Daily sales report validation
export const validateDailySalesReport = [
  query('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO date'),

  handleValidationErrors
];

// MongoDB ID validation
export const validateMongoId = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid ID'),

  handleValidationErrors
];

export const validateOrderId = [
  param('orderId')
    .isMongoId()
    .withMessage('Please provide a valid order ID'),

  handleValidationErrors
];
import { query, validationResult } from 'express-validator';

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

// Sales analytics query validation
export const validateSalesQuery = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date'),

  query('period')
    .optional()
    .isIn(['today', 'week', 'month', 'year'])
    .withMessage('Period must be today, week, month, or year'),

  handleValidationErrors
];

// Overview query validation
export const validateOverviewQuery = [
  query('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO date'),

  handleValidationErrors
];

// Menu analytics query validation
export const validateMenuAnalyticsQuery = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1-50'),

  handleValidationErrors
];

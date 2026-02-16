import { body, param, validationResult } from 'express-validator';

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

// Branded QR code validation
export const validateBrandedQR = [
  param('tableId')
    .isMongoId()
    .withMessage('Please provide a valid table ID'),

  body('logoUrl')
    .optional()
    .isURL()
    .withMessage('Logo URL must be a valid URL'),

  body('color')
    .optional()
    .matches(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
    .withMessage('Color must be a valid hex color code'),

  body('size')
    .optional()
    .isInt({ min: 100, max: 1000 })
    .withMessage('QR size must be between 100-1000 pixels'),

  body('margin')
    .optional()
    .isInt({ min: 0, max: 10 })
    .withMessage('Margin must be between 0-10'),

  handleValidationErrors
];

// Validate userId for password generation
export const validateUserId = [
  param('userId')
    .isMongoId()
    .withMessage('Please provide a valid user ID'),

  handleValidationErrors
];

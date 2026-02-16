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

// Role creation validation
export const validateRoleCreation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Role name must be between 2-50 characters')
    .matches(/^[a-zA-Z_-]+$/)
    .withMessage('Role name must contain only letters, hyphens, and underscores'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Description must not exceed 200 characters'),

  handleValidationErrors
];

// Role update validation
export const validateRoleUpdate = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid role ID'),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Role name must be between 2-50 characters')
    .matches(/^[a-zA-Z_-]+$/)
    .withMessage('Role name must contain only letters, hyphens, and underscores'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Description must not exceed 200 characters'),

  handleValidationErrors
];

// MongoDB ID validation
export const validateMongoId = [
  param('id')
    .isMongoId()
    .withMessage('Please provide a valid role ID'),

  handleValidationErrors
];

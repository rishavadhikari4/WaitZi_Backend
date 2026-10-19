// src/config/multer.ts
import path from 'node:path';

import multer from 'multer';

import { AppError } from '../utils/AppError.js';

const IMAGE_TYPES = /jpeg|jpg|png|webp/;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env['MAX_FILE_SIZE']) || 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = IMAGE_TYPES.test(path.extname(file.originalname).toLowerCase()) && IMAGE_TYPES.test(file.mimetype);
    if (ok) return cb(null, true);
    cb(AppError.badRequest('Only JPEG, PNG or WebP images are allowed', 'INVALID_FILE_TYPE'));
  },
});

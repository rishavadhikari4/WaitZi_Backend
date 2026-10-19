// src/services/media/image.service.ts
// Cloudinary uploads, one folder per organization so tenants' assets stay apart.
import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from 'cloudinary';

import config from '../../config/config.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';

export type ImageKind = 'users' | 'menu-items' | 'categories';

const TRANSFORMS: Record<ImageKind, UploadApiOptions['transformation']> = {
  users: [{ width: 400, height: 400, crop: 'fill', quality: 'auto' }],
  'menu-items': [{ width: 800, height: 600, crop: 'fill', quality: 'auto' }],
  categories: [{ width: 600, height: 400, crop: 'fill', quality: 'auto' }],
};

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const { cloudName, apiKey, apiSecret } = config.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    throw AppError.internal('Image uploads are not configured on this server', 'UPLOADS_DISABLED');
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  configured = true;
}

class ImageService {
  upload(orgId: string, kind: ImageKind, buffer: Buffer): Promise<{ url: string; publicId: string }> {
    ensureConfigured();
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { resource_type: 'image', format: 'webp', folder: `waitzi/${orgId}/${kind}`, transformation: TRANSFORMS[kind] },
          (error, result?: UploadApiResponse) => {
            if (error || !result) {
              logger.error(`Cloudinary upload failed: ${error?.message}`);
              return reject(AppError.internal('Failed to upload image. Please try again.', 'UPLOAD_FAILED'));
            }
            resolve({ url: result.secure_url, publicId: result.public_id });
          },
        )
        .end(buffer);
    });
  }

  /** Best effort: a failed delete only leaves an orphaned image behind. */
  async remove(publicId: string | null | undefined): Promise<void> {
    if (!publicId || publicId === 'default') return;
    try {
      ensureConfigured();
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch (error) {
      logger.warn(`Cloudinary delete failed for ${publicId}: ${(error as Error).message}`);
    }
  }
}

export default new ImageService();

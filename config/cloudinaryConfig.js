import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config();

class CloudinaryManager {
  constructor(config = {}) {
    this.config = {
      cloud_name: config.cloud_name || process.env.CLOUDINARY_CLOUD_NAME,
      api_key: config.api_key || process.env.CLOUDINARY_API_KEY,
      api_secret: config.api_secret || process.env.CLOUDINARY_API_SECRET,
      secure: config.secure !== undefined ? config.secure : true
    };

    this.validateConfig();
    this.initializeCloudinary();
  }

  validateConfig() {
    const required = ['cloud_name', 'api_key', 'api_secret'];
    const missing = required.filter(key => !this.config[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing Cloudinary configuration: ${missing.join(', ')}`);
    }
  }

  initializeCloudinary() {
    cloudinary.config(this.config);
  }

  uploadImage(fileBuffer, options = {}) {
    return new Promise((resolve, reject) => {
      const defaultOptions = {
        resource_type: "image",
        ...options
      };

      const stream = cloudinary.uploader.upload_stream(
        defaultOptions,
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error.message);
            return reject(error);
          }
          resolve(result);
        }
      );
      stream.end(fileBuffer);
    });
  }

  deleteImage(publicId, options = {}) {
    return new Promise((resolve, reject) => {
      const defaultOptions = {
        resource_type: "image",
        ...options
      };

      cloudinary.uploader.destroy(
        publicId,
        defaultOptions,
        (error, result) => {
          if (error) {
            console.error('Cloudinary delete error:', error.message);
            return reject(error);
          }
          resolve(result);
        }
      );
    });
  }

  getConfig() {
    return {
      cloud_name: this.config.cloud_name,
      secure: this.config.secure,
      configured: !!(this.config.api_key && this.config.api_secret)
    };
  }
}

// Create and export singleton instance
const cloudinaryManager = new CloudinaryManager();

// Export class for advanced usage
export { CloudinaryManager };

export const uploadToCloudinary = (fileBuffer, options = {}) => {
  return cloudinaryManager.uploadImage(fileBuffer, options);
};

export const deleteFromCloudinary = (publicId, options = {}) => {
  return cloudinaryManager.deleteImage(publicId, options);
};

// Export default instance
export default cloudinaryManager;

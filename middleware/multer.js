import multer from 'multer';
import path from 'path';

class FileUploadMiddleware {
    constructor() {
        this.allowedTypes = /jpeg|jpg|png/;
        this.storage = multer.memoryStorage();
        this.upload = multer({ 
            storage: this.storage, 
            fileFilter: this.fileFilter.bind(this) 
        });
    }

    fileFilter(req, file, cb) {
        const isExtValid = this.allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const isMimeValid = this.allowedTypes.test(file.mimetype);
        if (isExtValid && isMimeValid) {
            return cb(null, true);
        }
        cb(new Error('Only images are allowed'));
    }

    single(fieldName) {
        return this.upload.single(fieldName);
    }

    array(fieldName, maxCount) {
        return this.upload.array(fieldName, maxCount);
    }

    fields(fields) {
        return this.upload.fields(fields);
    }
}

const fileUploadMiddleware = new FileUploadMiddleware();

export const upload = fileUploadMiddleware.upload;
export const uploadSingle = (fieldName) => fileUploadMiddleware.single(fieldName);
export const uploadArray = (fieldName, maxCount) => fileUploadMiddleware.array(fieldName, maxCount);
export const uploadFields = (fields) => fileUploadMiddleware.fields(fields);

export default fileUploadMiddleware;
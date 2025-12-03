import express from "express";
import { createCategory, getAllCategories, getCategoryById } from "../controller/categoryController.js";
import { uploadSingle } from "../middleware/multer.js";

const router = express.Router();

router.post('/', uploadSingle('image'), createCategory);
router.get('/', getAllCategories);
router.get('/:id', getCategoryById);

export default router;
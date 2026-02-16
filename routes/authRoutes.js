import express from "express";
import { 
  createUser, 
  login, 
  logout, 
  refreshToken, 
  verifyToken 
} from "../controller/authController.js";
import { createUserValidation, loginValidation } from "../middleware/validators.js";
import { authLimiter, staffCreationLimiter, generalLimiter } from "../middleware/rateLimiter.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authorizeRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.post('/register', staffCreationLimiter, authMiddleware, authorizeRole(['admin']), createUserValidation, createUser);
router.post('/login', authLimiter, loginValidation, login);
router.post('/logout', generalLimiter, logout);
router.post('/refresh-token', authLimiter, refreshToken);
router.get('/verify', generalLimiter, verifyToken);

export default router;
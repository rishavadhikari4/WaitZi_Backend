import express from "express";
import { 
  createUser, 
  login, 
  logout, 
  refreshToken, 
  verifyToken 
} from "../controller/authController.js";
import { createUserValidation, loginValidation } from "../middleware/validators.js";

const router = express.Router();

// Authentication routes
router.post('/register', createUserValidation, createUser);
router.post('/login', loginValidation, login);
router.post('/logout', logout);
router.post('/refresh-token', refreshToken);
router.get('/verify', verifyToken);

export default router;
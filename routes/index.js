import authRoutes from "./authRoutes.js";
import roleRoutes from "./roleRoutes.js";
import express from "express";

const router = express.Router();

router.use('/auths', authRoutes);
router.use('/roles', roleRoutes);

export default router;
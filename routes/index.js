import authRoutes from "./authRoutes.js";
import categoryRoutes from "./categoryRoutes.js";
import roleRoutes from "./roleRoutes.js";

import express from "express";

const router = express.Router();

router.use('/auths', authRoutes);
router.use('/categories',categoryRoutes);
router.use('/roles', roleRoutes);

export default router;
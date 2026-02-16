import authRoutes from "./authRoutes.js";
import categoryRoutes from "./categoryRoutes.js";
import roleRoutes from "./roleRoutes.js";
import menuRoutes from "./menuRoutes.js";
import tableRoutes from "./tableRoutes.js";
import orderRoutes from "./orderRoutes.js";
import paymentRoutes from "./paymentRoutes.js";
import userRoutes from "./userRoutes.js";
import qrRoutes from "./qrRoutes.js";
import dashboardRoutes from "./dashboardRoutes.js";
import passwordRoutes from "./passwordRoutes.js";

import express from "express";

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/roles', roleRoutes);
router.use('/menu', menuRoutes);
router.use('/tables', tableRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/users', userRoutes);
router.use('/qr', qrRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/password', passwordRoutes);

export default router;
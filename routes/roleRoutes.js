import express from "express";
import { 
  getAllRoles, 
  getRoleById, 
  createRole, 
  updateRole, 
  deleteRole 
} from "../controller/roleController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authorizeRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.get('/', getAllRoles);

router.get('/:id', getRoleById);

router.post('/',authMiddleware,authorizeRole(["Admin"]), createRole);

router.patch('/:id', updateRole);

router.delete('/:id', deleteRole);

export default router;
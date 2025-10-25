import express from "express";
import { getUserPages } from "../controllers/pagesController.js";

const router = express.Router();
router.get("/pages", getUserPages);
export default router;
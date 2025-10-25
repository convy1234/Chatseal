import express from "express";
import { getConversations, getMessages, sendMessage } from "../controllers/messengerController.js";

const router = express.Router();

router.get("/conversations", getConversations);
router.get("/messages", getMessages);
router.post("/send-message", sendMessage);

export default router;

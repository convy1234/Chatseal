import express from "express";
import {
  startOAuth,
  oauthCallback,
  verifyWebhook,
  receiveWebhook,
  sendMessage,
  getMessages,
  manualConnect,
  manualVerify,
  listTenants,
} from "../controllers/whatsappController.js";

const router = express.Router();

/* ---------------------- PHASE 1: OAUTH ---------------------- */
// Start OAuth flow
router.get("/oauth/start", startOAuth);
router.get("/oauth/callback", oauthCallback);

/* ---------------------- PHASE 2: WEBHOOK ---------------------- */
// Webhook verification (GET) & message reception (POST)
router.get("/webhook", verifyWebhook);
router.post("/webhook", receiveWebhook);

/* ---------------------- PHASE 3: MESSAGES ---------------------- */
// Send a WhatsApp message
router.post("/messages/send", sendMessage);

// Fetch all messages for a tenant
router.get("/messages/:tenantId", getMessages);

/* ---------------------- PHASE 4: MANUAL CONNECT ---------------------- */
router.post("/manual/connect", manualConnect);
router.post("/manual/verify", manualVerify);

/* ---------------------- PHASE 5: TENANTS ---------------------- */
router.get("/tenants", listTenants);

export default router;

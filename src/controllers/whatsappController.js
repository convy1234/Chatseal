import axios from "axios";
import dotenv from "dotenv";
import crypto from "crypto";
import Tenant from "../models/tenantModel.js";
import Message from "../models/messageModel.js";
import { io } from "../server.js";

dotenv.config();

/* ---------------------- helpers ---------------------- */

// Build current base URL from request host unless PUBLIC_BASE_URL is set
const REDIRECT_PATH = "/api/whatsapp/oauth/callback";
function getBaseUrl(req) {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
}

function verifyMetaSignature(req) {
  const appSecret = process.env.META_APP_SECRET;
  const headerSig = req.get("X-Hub-Signature-256");
  if (!appSecret) return true;
  if (!headerSig || !req.rawBody) return false;

  const expected =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(req.rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(headerSig), Buffer.from(expected));
}

function parseInboundBody(m) {
  const t = m.type;
  if (t === "text") return m.text?.body || "";
  if (t === "image") return m.image?.caption ? `[image] ${m.image.caption}` : "[image]";
  if (t === "audio") return "[audio]";
  if (t === "video") return m.video?.caption ? `[video] ${m.video.caption}` : "[video]";
  if (t === "document") return m.document?.caption ? `[document] ${m.document.caption}` : "[document]";
  if (t === "location") return `[location] lat=${m.location?.latitude}, lng=${m.location?.longitude}`;
  if (t === "contacts") return "[contacts]";
  if (t === "sticker") return "[sticker]";
  if (t === "interactive") {
    const btn = m.interactive?.button_reply;
    const list = m.interactive?.list_reply;
    if (btn) return `[button] ${btn.title} (${btn.id})`;
    if (list) return `[list] ${list.title} (${list.id})`;
    return "[interactive]";
  }
  if (t === "reaction") return `[reaction] ${m.reaction?.emoji || ""}`;
  return `[${t || "unknown"}]`;
}

function toDateFromUnixSeconds(sec) {
  if (!sec) return new Date();
  const n = Number(sec);
  return Number.isFinite(n) ? new Date(n * 1000) : new Date();
}

/* ---------------------- PHASE 1: OAUTH ---------------------- */

// Build the dialog URL with a redirect that matches the current host (or PUBLIC_BASE_URL)
export const startOAuth = (req, res) => {
  const redirectUri = `${getBaseUrl(req)}${REDIRECT_PATH}`;

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    redirect_uri: redirectUri,
  scope: "whatsapp_business_management,whatsapp_business_messaging,business_management,public_profile,email",
    response_type: "code",
  });

  console.log("[OAuth] Using redirect_uri:", redirectUri);
  res.redirect(`https://www.facebook.com/v23.0/dialog/oauth?${params.toString()}`);
};

export const oauthCallback = async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: "Missing code" });

  // Must match exactly what we used in startOAuth (same host)
  const redirectUri = `${getBaseUrl(req)}${REDIRECT_PATH}`;
  console.log("[OAuth] Exchanging code with redirect_uri:", redirectUri);

  try {
    // 1) Exchange code -> user access token
    const tokenRes = await axios.get(
      `https://graph.facebook.com/v23.0/oauth/access_token`,
      {
        params: {
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          redirect_uri: redirectUri,
          code,
        },
      }
    );
    const accessToken = tokenRes.data.access_token;

    // Debug: inspect token scopes up-front to catch Missing Permission early
    let scopes = [];
    try {
      const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
      const dbg = await axios.get(`https://graph.facebook.com/v23.0/debug_token`, {
        params: { input_token: accessToken, access_token: appToken },
      });
      scopes = dbg.data?.data?.scopes || [];
      console.log("[OAuth] Token scopes:", scopes);
    } catch (e) {
      console.warn("[OAuth] debug_token failed:", e.response?.data || e.message);
    }

    const requiredScopes = [
      "whatsapp_business_management",
      "whatsapp_business_messaging",
    ];
    const missing = requiredScopes.filter((s) => !scopes.includes(s));
    if (missing.length) {
      return res.status(403).json({
        error: "Missing required scopes",
        missing,
        hint:
          "Re-run OAuth and grant permissions. Ensure your app is added to the WABA and your user has access.",
      });
    }

    // 2) Discover WABA ID
    let wabaId = null;
    try {
      const wabas1 = await axios.get(
        `https://graph.facebook.com/v23.0/me/whatsapp_business_accounts`,
        { params: { access_token: accessToken, fields: "id,name" } }
      );
      wabaId = wabas1.data?.data?.[0]?.id || null;
    } catch (e) {
      console.error("[OAuth] Failed: /me/whatsapp_business_accounts =>", e.response?.data || e.message);
    }

    if (!wabaId) {
      try {
        const me = await axios.get(`https://graph.facebook.com/v23.0/me`, {
          params: {
            access_token: accessToken,
            fields: "name,businesses{owned_whatsapp_business_account{id,name}}",
          },
        });
        const businesses = me.data?.businesses || [];
        for (const b of businesses) {
          const ow = b?.owned_whatsapp_business_account;
          if (ow?.id) {
            wabaId = ow.id;
            break;
          }
        }
      } catch (e) {
        console.error("[OAuth] Failed: /me with businesses{owned_whatsapp_business_account} =>", e.response?.data || e.message);
      }
    }

    if (!wabaId) throw new Error("No WhatsApp Business Account found.");

    // 3) Read WABA name
    let businessName = "WhatsApp Business";
    try {
      const wabaInfo = await axios.get(
        `https://graph.facebook.com/v23.0/${wabaId}`,
        { params: { access_token: accessToken, fields: "name" } }
      );
      businessName = wabaInfo.data?.name || businessName;
    } catch (e) {
      console.error(`[OAuth] Failed: /${wabaId} fields=name =>`, e.response?.data || e.message);
    }

    // 4) Fetch phone numbers
    const phoneRes = await axios.get(
      `https://graph.facebook.com/v23.0/${wabaId}/phone_numbers`,
      { params: { access_token: accessToken } }
    );
    const phone = phoneRes.data?.data?.[0];
    if (!phone?.id) throw new Error("No phone number is connected to this WABA.");
    const phoneNumberId = phone.id;
    const displayPhone = phone.display_phone_number;

    // 5) Upsert tenant
    let tenant = await Tenant.findOne({ wabaId });
    if (!tenant) {
      tenant = await Tenant.create({
        name: businessName,
        wabaId,
        accessToken,
        phoneNumberId,
        phoneNumber: displayPhone,
      });
    } else {
      tenant.name = businessName;
      tenant.accessToken = accessToken;
      tenant.phoneNumberId = phoneNumberId;
      tenant.phoneNumber = displayPhone || tenant.phoneNumber;
      await tenant.save();
    }

    res.json({ success: true, message: "WhatsApp account connected", tenant });
  } catch (error) {
    console.error("❌ OAuth error:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message || "OAuth error" });
  }
};

/* ---------------------- PHASE 2: WEBHOOKS ---------------------- */

// GET: Verification when adding webhook in Meta dashboard
export const verifyWebhook = (req, res) => {
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    return res.status(200).send(challenge);
  } else {
    console.log("❌ Webhook verification failed");
    return res.sendStatus(403);
  }
};

// POST: Receiving messages & statuses
export const receiveWebhook = async (req, res) => {
  try {
    if (!verifyMetaSignature(req)) {
      console.warn("❌ Invalid X-Hub-Signature-256");
      return res.sendStatus(401);
    }

    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    if (!value) return res.sendStatus(200);

    // 1) Status updates for outbound messages
    if (value.statuses?.length) {
      for (const s of value.statuses) {
        const update = {
          status: s.status, // sent | delivered | read | failed | deleted
          timestamp: toDateFromUnixSeconds(s.timestamp),
        };
        if (s.conversation) update.conversation = s.conversation;
        if (s.pricing) update.pricing = s.pricing;
        if (s.errors?.length) update.error = s.errors[0];

        await Message.updateOne({ waMessageId: s.id }, { $set: update });
      }
      return res.sendStatus(200);
    }

    // 2) Inbound messages
    if (value.messages?.length) {
      const m = value.messages[0];
      const phone_number_id = value.metadata?.phone_number_id;

      const tenant = await Tenant.findOne({ phoneNumberId: phone_number_id });
      if (!tenant) return res.sendStatus(200);

      // dedupe
      const existing = await Message.findOne({ waMessageId: m.id });
      if (existing) return res.sendStatus(200);

      const waType = m.type;
      const body = parseInboundBody(m);
      const profileName = value.contacts?.[0]?.profile?.name;

      const saved = await Message.create({
        tenantId: tenant._id,
        from: m.from,
        to: tenant.phoneNumberId,
        message: body,
        direction: "inbound",
        waMessageId: m.id,
        waType,
        profileName,
        timestamp: toDateFromUnixSeconds(m.timestamp),
        status: "received",
      });

      io.to(tenant._id.toString()).emit("newMessage", saved);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook receive error:", err.response?.data || err);
    return res.sendStatus(500);
  }
};

/* ---------------------- PHASE 3: SEND & FETCH MESSAGES ---------------------- */

// Send a WhatsApp text message
export const sendMessage = async (req, res) => {
  const { tenantId, to, message } = req.body;
  if (!tenantId || !to || !message)
    return res.status(400).json({ error: "tenantId, to, and message are required" });

  try {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    // Preflight: ensure sender phone number is CONNECTED in WhatsApp Manager
    try {
      const pn = await axios.get(
        `https://graph.facebook.com/v23.0/${tenant.phoneNumberId}`,
        {
          params: { access_token: tenant.accessToken, fields: "id,display_phone_number,status,name_status" },
          timeout: 15000,
        }
      );
      const status = String(pn.data?.status || "").toUpperCase();
      if (status && status !== "CONNECTED") {
        return res.status(409).json({
          error: `Sender phone status is '${pn.data?.status}'. Complete registration in WhatsApp Manager → API Setup.`,
          details: pn.data,
        });
      }
    } catch (preErr) {
      const ge = preErr.response?.data?.error;
      if (ge?.code === 190) {
        return res.status(401).json({ error: "Access token invalid or expired" });
      }
      // Otherwise, proceed. Send call will surface a clearer error.
    }

    const response = await axios.post(
      `https://graph.facebook.com/v23.0/${tenant.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${tenant.accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const waMessageId = response.data?.messages?.[0]?.id;

    const msg = await Message.create({
      tenantId: tenant._id,
      from: tenant.phoneNumberId,
      to,
      message,
      direction: "outbound",
      waMessageId,
      waType: "text",
      status: "sent",
      timestamp: new Date(),
    });

    io.to(tenant._id.toString()).emit("newMessage", msg);

    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error("❌ Send message error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
};

// Fetch all messages for a tenant
export const getMessages = async (req, res) => {
  const { tenantId } = req.params;
  try {
    const messages = await Message.find({ tenantId }).sort({ timestamp: 1 });
    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// List tenants (safe fields only)
export const listTenants = async (_req, res) => {
  try {
    const tenants = await Tenant.find({}, "name phoneNumber phoneNumberId wabaId isTest");
    res.json({ success: true, tenants });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ---------------------- PHASE 4: MANUAL CONNECT ---------------------- */

// Upsert a tenant using manual WABA credentials
// Security: require X-Admin-Key that matches process.env.ADMIN_API_KEY
export const manualConnect = async (req, res) => {
  try {
    const adminKeyHeader = req.get("x-admin-key");
    const adminKeyEnv = process.env.ADMIN_API_KEY;
    if (!adminKeyEnv) {
      return res.status(501).json({
        error: "ADMIN_API_KEY not configured",
        hint: "Set ADMIN_API_KEY in .env to enable manual connect",
      });
    }
    if (!adminKeyHeader || adminKeyHeader !== adminKeyEnv) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { name, wabaId, phoneNumberId, phoneNumber, accessToken, isTest } = req.body || {};
    if (!name || !wabaId || !phoneNumberId || !accessToken) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["name", "wabaId", "phoneNumberId", "accessToken"],
      });
    }

    // Sanitize token: strip anything after whitespace (common paste error)
    const cleanAccessToken = String(accessToken).trim().split(/\s+/)[0];

    // If display phone is not provided, try to fetch it from Graph
    let resolvedDisplayPhone = phoneNumber || undefined;
    if (!resolvedDisplayPhone) {
      try {
        const pn = await axios.get(`https://graph.facebook.com/v23.0/${phoneNumberId}`, {
          params: { access_token: cleanAccessToken, fields: "display_phone_number" },
          timeout: 15000,
        });
        resolvedDisplayPhone = pn.data?.display_phone_number || undefined;
      } catch (e) {
        console.warn("[ManualConnect] Could not fetch display_phone_number:", e.response?.data || e.message);
      }
    }

    let tenant = await Tenant.findOne({ wabaId });
    if (!tenant) {
      tenant = await Tenant.create({
        name,
        wabaId,
        phoneNumberId,
        phoneNumber: resolvedDisplayPhone,
        accessToken: cleanAccessToken,
        isTest: !!isTest,
      });
    } else {
      tenant.name = name;
      tenant.phoneNumberId = phoneNumberId;
      if (resolvedDisplayPhone) tenant.phoneNumber = resolvedDisplayPhone;
      tenant.accessToken = cleanAccessToken;
      if (typeof isTest !== "undefined") tenant.isTest = !!isTest;
      await tenant.save();
    }

    return res.json({ success: true, tenant });
  } catch (err) {
    console.error("[ManualConnect] error:", err);
    return res.status(500).json({ error: err.message || "manual connect failed" });
  }
};

// Verify a WABA/PhoneNumberID/AccessToken combo by pinging Graph
export const manualVerify = async (req, res) => {
  try {
    const adminKeyHeader = req.get("x-admin-key");
    const adminKeyEnv = process.env.ADMIN_API_KEY;
    if (!adminKeyEnv) {
      return res.status(501).json({
        error: "ADMIN_API_KEY not configured",
        hint: "Set ADMIN_API_KEY in .env to enable manual verify",
      });
    }
    if (!adminKeyHeader || adminKeyHeader !== adminKeyEnv) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { tenantId, wabaId: bodyWaba, phoneNumberId: bodyPnId, accessToken: bodyToken } = req.body || {};

    let wabaId = bodyWaba;
    let phoneNumberId = bodyPnId;
    let accessToken = bodyToken ? String(bodyToken).trim().split(/\s+/)[0] : undefined;

    if (tenantId) {
      const t = await Tenant.findById(tenantId);
      if (!t) return res.status(404).json({ error: "Tenant not found" });
      wabaId = wabaId || t.wabaId;
      phoneNumberId = phoneNumberId || t.phoneNumberId;
      accessToken = accessToken || (t.accessToken ? String(t.accessToken).trim().split(/\s+/)[0] : undefined);
    }

    if (!wabaId || !phoneNumberId || !accessToken) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["wabaId", "phoneNumberId", "accessToken"],
        hint: tenantId ? "Tenant is missing some fields; pass explicit values or update tenant." : undefined,
      });
    }

    const out = { checks: {}, hints: [] };

    // 1) Check token scopes
    const requiredScopes = [
      "whatsapp_business_management",
      "whatsapp_business_messaging",
    ];
    try {
      const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
      const dbg = await axios.get(`https://graph.facebook.com/v23.0/debug_token`, {
        params: { input_token: accessToken, access_token: appToken },
      });
      const scopes = dbg.data?.data?.scopes || [];
      const missing = requiredScopes.filter((s) => !scopes.includes(s));
      out.checks.scopes = scopes;
      out.checks.missing_scopes = missing;
      if (missing.length) {
        out.hints.push("Grant required scopes during OAuth or use a System User token with these permissions.");
      }
    } catch (e) {
      out.checks.scopes_error = e.response?.data || e.message;
      out.hints.push("Token debug failed; token may be invalid or app credentials not set.");
    }

    // 2) Verify WABA access
    try {
      const wabaInfo = await axios.get(`https://graph.facebook.com/v23.0/${wabaId}`, {
        params: { access_token: accessToken, fields: "id,name" },
      });
      out.checks.waba = wabaInfo.data;
    } catch (e) {
      const ge = e.response?.data?.error;
      out.checks.waba_error = ge || e.message;
      if (ge?.code === 190) out.hints.push("Access token invalid/expired; generate a fresh token.");
      if (ge?.code === 100 || ge?.code === 10) out.hints.push("Missing Permission or not authorized for this WABA. Ensure app is added to WABA and user/system user has access.");
    }

    // 3) Verify Phone Number ID
    try {
      const pn = await axios.get(`https://graph.facebook.com/v23.0/${phoneNumberId}`, {
        params: { access_token: accessToken, fields: "id,display_phone_number" },
      });
      out.checks.phone_number = pn.data;
    } catch (e) {
      const ge = e.response?.data?.error;
      out.checks.phone_number_error = ge || e.message;
      if (ge?.code === 190) out.hints.push("Access token invalid/expired; generate a fresh token.");
      if (ge?.code === 100 || ge?.code === 10) out.hints.push("Phone number not accessible by this token/WABA. Confirm phone number belongs to the WABA and app has access.");
    }

    // 4) List WABA phone numbers with status to detect 'Account not registered'
    try {
      const list = await axios.get(`https://graph.facebook.com/v23.0/${wabaId}/phone_numbers`, {
        params: { access_token: accessToken, fields: "id,display_phone_number,status,name_status,verified_name,quality_rating" },
      });
      out.checks.waba_phone_numbers = list.data?.data || [];
      const match = out.checks.waba_phone_numbers.find((n) => String(n.id) === String(phoneNumberId));
      if (match && match.status && match.status.toUpperCase() !== "CONNECTED") {
        out.hints.push(`Phone number status is '${match.status}'. Complete registration/verification in WhatsApp Manager → API Setup → Add phone number.`);
      }
    } catch (e) {
      out.checks.waba_phone_numbers_error = e.response?.data || e.message;
    }

    const ok = !out.checks.missing_scopes?.length && out.checks.waba && out.checks.phone_number;
    return res.json({ success: !!ok, ...out });
  } catch (err) {
    console.error("[ManualVerify] error:", err);
    return res.status(500).json({ error: err.message || "manual verify failed" });
  }
};

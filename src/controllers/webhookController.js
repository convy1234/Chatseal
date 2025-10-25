import Message from "../models/messageModel.js";
import Tenant from "../models/tenantModel.js";

// Webhook verification (Meta calls this when you set up)
export const verifyWebhook = (req, res) => {
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
};

// Receiving incoming messages
export const receiveWebhook = async (req, res) => {
  try {
    const data = req.body;

    if (data.entry && data.entry[0].changes[0].value.messages) {
      const message = data.entry[0].changes[0].value.messages[0];
      const metadata = data.entry[0].changes[0].value.metadata;
      const phone_number_id = metadata.phone_number_id;

      // Find tenant by phone number ID
      const tenant = await Tenant.findOne({ phoneNumberId: phone_number_id });
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });

      await Message.create({
        tenantId: tenant._id,
        from: message.from,
        message: message.text?.body || "",
        direction: "inbound",
        timestamp: new Date(),
      });

      console.log("💬 New message received:", message.text?.body);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.sendStatus(500);
  }
};

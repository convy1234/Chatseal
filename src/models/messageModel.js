// models/messageModel.js
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },
  from: String,
  to: String,
  message: String,
  direction: { type: String, enum: ["inbound", "outbound"] },

  // New fields:
  waMessageId: { type: String, unique: true, sparse: true }, // dedupe key
  waType: String,               // text, image, interactive, etc.
  profileName: String,          // contact profile name if provided
  status: { type: String, default: "delivered" }, // sent | delivered | read | failed | received

  timestamp: { type: Date, default: Date.now },
}, { minimize: true });

export default mongoose.model("Message", messageSchema);

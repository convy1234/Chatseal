import mongoose from "mongoose";

const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  phoneNumber: { type: String },
  phoneNumberId: { type: String },
  wabaId: { type: String },
  accessToken: { type: String },
  isTest: { type: Boolean, default: false },
  webhookSecret: { type: String },
  planType: { type: String, default: "free" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Tenant", tenantSchema);

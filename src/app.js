import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import whatsappRoutes from "./routes/whatsappRoutes.js";
import debugRoutes from "./routes/debug.js";
import facebookAuthRoutes from "./routes/facebookAuth.js";
import messengerRoutes from "./routes/messenger.js";
import pagesRoutes from "./routes/pages.js";
import facebookRoutes from "./routes/facebook.js";
import instagramRoutes from "./routes/instagram.js"; // ADD THIS LINE

dotenv.config();
const app = express();

// Trust proxy if you're behind ngrok/reverse proxies (optional but handy)
app.set("trust proxy", 1);

// CORS first
app.use(cors());

// IMPORTANT: capture raw body for webhook HMAC verification
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => res.send("ChatSeal API Running"));

app.get("/api/pages/messenger/callback", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === "my_verify_token") {
    console.log("WEBHOOK VERIFIED ✅");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403); // Forbidden if token doesn't match
  }
});

// Routes
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api", debugRoutes);
app.use("/api/auth", facebookAuthRoutes);
app.use("/api/messenger", messengerRoutes);
app.use("/api", pagesRoutes);
app.use("/api/facebook", facebookRoutes);
app.use("/api", instagramRoutes); // ADD THIS LINE

// Static frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/app", express.static(path.join(__dirname, "../client/public")));

export default app;
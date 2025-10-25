import dotenv from "dotenv";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import http from "http";
import { Server } from "socket.io";


dotenv.config();

const PORT = process.env.PORT || 5000;

connectDB();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
export const io = new Server(server, {
  cors: {
    origin: "*", // or your frontend URL
    methods: ["GET", "POST"]
  }
});

// Listen for client connections
io.on("connection", (socket) => {
  console.log("⚡ New client connected:", socket.id);

  // Optionally join tenant room
  socket.on("joinTenantRoom", (tenantId) => {
    socket.join(tenantId);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

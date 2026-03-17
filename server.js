// ============================================================
// backend/server.js
// CombiChatBot-WattshApp — Main Server
// Express + Socket.io + Firebase Admin + Routes
// ============================================================

require("dotenv").config();
const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");
const cors       = require("cors");
const path       = require("path");
const admin      = require("firebase-admin");
const fs         = require("fs");

// ── Firebase Admin Init ─────────────────────────────────────
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./firebase-service-account.json";
if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌  Firebase service account JSON not found at:", serviceAccountPath);
  console.error("    Download it from Firebase Console → Project Settings → Service Accounts");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(path.resolve(serviceAccountPath))),
});

const db = admin.firestore();

// ── Express App ─────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// ── CORS ────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

app.use(express.json());

// ── Socket.io ───────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Export io for use in other modules
global.io = io;
global.db = db;

// ── Routes ──────────────────────────────────────────────────
const botRoutes  = require("./routes/botRoutes");
const authRoutes = require("./routes/authRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/bot",  botRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Socket.io Connection Handler ────────────────────────────
io.on("connection", (socket) => {
  console.log(`🔌  Client connected: ${socket.id}`);

  // Client subscribes to a specific bot's events
  socket.on("subscribe_bot", (botId) => {
    socket.join(`bot:${botId}`);
    console.log(`📡  Socket ${socket.id} subscribed to bot:${botId}`);
  });

  socket.on("unsubscribe_bot", (botId) => {
    socket.leave(`bot:${botId}`);
  });

  socket.on("disconnect", () => {
    console.log(`🔌  Client disconnected: ${socket.id}`);
  });
});

// ── Session Cleanup on Exit ─────────────────────────────────
const { cleanupAllSessions } = require("./whatsapp");
process.on("SIGINT",  async () => { await cleanupAllSessions(); process.exit(0); });
process.on("SIGTERM", async () => { await cleanupAllSessions(); process.exit(0); });

// ── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🚀  CombiChatBot-WattshApp Backend`);
  console.log(`    Server running on http://localhost:${PORT}`);
  console.log(`    WebSocket ready on ws://localhost:${PORT}\n`);
});

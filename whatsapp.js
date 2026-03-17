// ============================================================
// backend/whatsapp.js
// WhatsApp connection via @whiskeysockets/baileys
// Handles: QR generation, session management, message handling
// ============================================================

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
} = require("@whiskeysockets/baileys");

const QRCode = require("qrcode");
const pino   = require("pino");
const path   = require("path");
const fs     = require("fs");
const { generateAIReply } = require("./ai");

// ── Session registry ─────────────────────────────────────────
// Map<botId, { socket, store, status }>
const sessions = new Map();

const SESSIONS_DIR = process.env.SESSIONS_DIR || "./sessions";

// Ensure sessions directory exists
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// ── Start Bot ────────────────────────────────────────────────
async function startBot(botConfig) {
  const { botId } = botConfig;

  // Prevent duplicate sessions
  if (sessions.has(botId)) {
    const existing = sessions.get(botId);
    if (existing.status === "online" || existing.status === "connecting") {
      console.log(`⚡  Bot ${botId} already active (${existing.status})`);
      return;
    }
    await stopBot(botId);
  }

  console.log(`🤖  Starting bot: ${botId} (${botConfig.botName})`);

  // Update DB status
  await updateBotStatus(botId, "connecting");

  // Emit to frontend
  emitToBot(botId, "bot:status", { botId, status: "connecting" });

  const sessionDir = path.join(SESSIONS_DIR, botId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const store = makeInMemoryStore({
    logger: pino({ level: "silent" }),
  });

  const socket = makeWASocket({
    version,
    auth:   state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["CombiChatBot", "Chrome", "1.0.0"],
  });

  store.bind(socket.ev);

  sessions.set(botId, { socket, store, status: "connecting", config: botConfig });

  // ── Event: Credentials Update ──────────────────────────────
  socket.ev.on("creds.update", saveCreds);

  // ── Event: Connection Update ───────────────────────────────
  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // QR Code received — convert to data URL and emit to frontend
    if (qr) {
      console.log(`📱  QR generated for bot: ${botId}`);
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, {
          width: 300,
          margin: 2,
          color: { dark: "#00d4ff", light: "#0a0f1e" },
        });
        emitToBot(botId, "bot:qr", { botId, qr: qrDataUrl });
      } catch (err) {
        console.error("QR generation error:", err);
      }
    }

    if (connection === "open") {
      console.log(`✅  Bot connected: ${botId}`);
      const session = sessions.get(botId);
      if (session) session.status = "online";

      await updateBotStatus(botId, "online");
      emitToBot(botId, "bot:status", { botId, status: "online" });
      emitToBot(botId, "bot:qr_clear", { botId });

      // Send greeting if configured (optional: only once per session)
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log(`🔴  Bot disconnected: ${botId} (reason: ${reason})`);

      const session = sessions.get(botId);
      if (session) session.status = "offline";

      await updateBotStatus(botId, "offline");
      emitToBot(botId, "bot:status", { botId, status: "offline" });

      // Auto-reconnect unless logged out
      if (reason !== DisconnectReason.loggedOut) {
        console.log(`🔄  Auto-reconnecting bot: ${botId} in 5s`);
        setTimeout(() => startBot(botConfig), 5000);
      } else {
        console.log(`🚪  Bot logged out: ${botId} — clearing session`);
        sessions.delete(botId);
        clearSession(botId);
      }
    }
  });

  // ── Event: Incoming Messages ───────────────────────────────
  socket.ev.on("messages.upsert", async ({ messages: msgs, type }) => {
    if (type !== "notify") return;

    for (const msg of msgs) {
      // Skip outgoing messages, status updates, and group messages
      if (msg.key.fromMe)                            continue;
      if (msg.key.remoteJid === "status@broadcast") continue;
      if (msg.key.remoteJid.endsWith("@g.us"))      continue; // skip groups

      const sender  = msg.key.remoteJid;
      const msgText = extractMessageText(msg);
      if (!msgText) continue;

      console.log(`💬  [${botId}] Message from ${sender}: ${msgText.substring(0, 50)}`);

      // Log incoming message to Firestore
      const incomingDoc = await logMessage(botId, sender, msgText, "incoming");

      // Emit to dashboard in real time
      emitToBot(botId, "bot:message", {
        botId,
        messageId: incomingDoc.id,
        sender,
        message:   msgText,
        type:      "incoming",
        timestamp: new Date().toISOString(),
      });

      // Generate AI reply
      try {
        const session = sessions.get(botId);
        if (!session || session.status !== "online") continue;

        const config     = session.config;
        const aiReply    = await generateAIReply(config, msgText, sender);

        // Send reply via WhatsApp
        await socket.sendMessage(sender, { text: aiReply });

        // Log outgoing message
        const outDoc = await logMessage(botId, sender, aiReply, "outgoing");

        // Emit reply to dashboard
        emitToBot(botId, "bot:message", {
          botId,
          messageId: outDoc.id,
          sender,
          message:   aiReply,
          type:      "outgoing",
          timestamp: new Date().toISOString(),
        });

        // Increment message counter
        await global.db.collection("bots").doc(botId).update({
          messagesCount: require("firebase-admin").firestore.FieldValue.increment(2),
          updatedAt: new Date().toISOString(),
        });

      } catch (aiErr) {
        console.error(`❌  AI reply error for bot ${botId}:`, aiErr.message);
      }
    }
  });
}

// ── Stop Bot ─────────────────────────────────────────────────
async function stopBot(botId) {
  const session = sessions.get(botId);
  if (!session) return;

  console.log(`🛑  Stopping bot: ${botId}`);
  try {
    session.socket.end();
  } catch (_) {}

  sessions.delete(botId);
  await updateBotStatus(botId, "offline");
  emitToBot(botId, "bot:status", { botId, status: "offline" });
}

// ── Cleanup All Sessions ──────────────────────────────────────
async function cleanupAllSessions() {
  console.log("🧹  Cleaning up all WhatsApp sessions...");
  for (const [botId] of sessions) {
    await stopBot(botId).catch(() => {});
  }
}

// ── Helpers ───────────────────────────────────────────────────

function extractMessageText(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ""
  );
}

async function updateBotStatus(botId, status) {
  try {
    await global.db.collection("bots").doc(botId).update({
      status,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("DB status update error:", err.message);
  }
}

async function logMessage(botId, sender, message, type) {
  const msgData = {
    botId,
    sender,
    message,
    type,       // "incoming" | "outgoing"
    timestamp:  new Date().toISOString(),
  };
  const ref = await global.db.collection("messages").add(msgData);
  return { id: ref.id, ...msgData };
}

function emitToBot(botId, event, data) {
  if (global.io) {
    global.io.to(`bot:${botId}`).emit(event, data);
  }
}

function clearSession(botId) {
  const sessionDir = path.join(SESSIONS_DIR, botId);
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
    console.log(`🗑️   Session cleared: ${botId}`);
  }
}

function getSessionStatus(botId) {
  return sessions.get(botId)?.status || "offline";
}

module.exports = { startBot, stopBot, cleanupAllSessions, getSessionStatus };

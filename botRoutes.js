// ============================================================
// backend/routes/botRoutes.js
// Bot CRUD, start/stop/restart, QR, message logs
// ============================================================

const express           = require("express");
const router            = express.Router();
const { verifyToken }   = require("../middleware/auth");
const { v4: uuidv4 }    = require("uuid");
const whatsapp          = require("../whatsapp");

// ── Helper: ensure bot belongs to user ──────────────────────
async function getOwnedBot(botId, uid) {
  const doc = await global.db.collection("bots").doc(botId).get();
  if (!doc.exists)               throw { code: 404, msg: "Bot not found" };
  if (doc.data().userId !== uid) throw { code: 403, msg: "Forbidden" };
  return { id: doc.id, ...doc.data() };
}

// ── Create Bot ───────────────────────────────────────────────
// POST /api/bot/create
router.post("/create", verifyToken, async (req, res) => {
  try {
    const {
      botName,
      businessName,
      phoneNumber,
      prompt,
      productLink,
      greetingMessage,
    } = req.body;

    if (!botName || !prompt) {
      return res.status(400).json({ error: "botName and prompt are required" });
    }

    const botId = uuidv4();
    const botData = {
      botId,
      userId:          req.user.uid,
      botName:         botName.trim(),
      businessName:    businessName?.trim() || "",
      phoneNumber:     phoneNumber?.trim() || "",
      prompt:          prompt.trim(),
      productLink:     productLink?.trim() || "",
      greetingMessage: greetingMessage?.trim() || "Hello! How can I help you today?",
      status:          "offline",    // offline | connecting | online
      messagesCount:   0,
      createdAt:       new Date().toISOString(),
      updatedAt:       new Date().toISOString(),
    };

    await global.db.collection("bots").doc(botId).set(botData);

    // Also add to user's bot list
    await global.db.collection("users").doc(req.user.uid).update({
      botIds: require("firebase-admin").firestore.FieldValue.arrayUnion(botId),
    }).catch(() => {}); // ignore if field doesn't exist yet

    res.json({ success: true, botId, bot: botData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── List User's Bots ─────────────────────────────────────────
// GET /api/bot/list
router.get("/list", verifyToken, async (req, res) => {
  try {
    const snap = await global.db.collection("bots")
      .where("userId", "==", req.user.uid)
      .orderBy("createdAt", "desc")
      .get();

    const bots = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ bots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get Single Bot ───────────────────────────────────────────
// GET /api/bot/:botId
router.get("/:botId", verifyToken, async (req, res) => {
  try {
    const bot = await getOwnedBot(req.params.botId, req.user.uid);
    res.json({ bot });
  } catch (e) {
    res.status(e.code || 500).json({ error: e.msg || e.message });
  }
});

// ── Update Bot Settings ──────────────────────────────────────
// PUT /api/bot/:botId
router.put("/:botId", verifyToken, async (req, res) => {
  try {
    await getOwnedBot(req.params.botId, req.user.uid); // ownership check
    const { botName, businessName, prompt, productLink, greetingMessage } = req.body;
    const updates = {};
    if (botName)         updates.botName         = botName.trim();
    if (businessName)    updates.businessName    = businessName.trim();
    if (prompt)          updates.prompt          = prompt.trim();
    if (productLink !== undefined) updates.productLink = productLink.trim();
    if (greetingMessage) updates.greetingMessage = greetingMessage.trim();
    updates.updatedAt = new Date().toISOString();

    await global.db.collection("bots").doc(req.params.botId).update(updates);
    res.json({ success: true });
  } catch (e) {
    res.status(e.code || 500).json({ error: e.msg || e.message });
  }
});

// ── Delete Bot ───────────────────────────────────────────────
// DELETE /api/bot/:botId
router.delete("/:botId", verifyToken, async (req, res) => {
  try {
    const bot = await getOwnedBot(req.params.botId, req.user.uid);
    // Stop session if running
    await whatsapp.stopBot(bot.botId).catch(() => {});
    await global.db.collection("bots").doc(bot.botId).delete();
    res.json({ success: true });
  } catch (e) {
    res.status(e.code || 500).json({ error: e.msg || e.message });
  }
});

// ── Start Bot ────────────────────────────────────────────────
// POST /api/bot/:botId/start
router.post("/:botId/start", verifyToken, async (req, res) => {
  try {
    const bot = await getOwnedBot(req.params.botId, req.user.uid);
    await whatsapp.startBot(bot);
    res.json({ success: true, message: "Bot starting — check QR code" });
  } catch (e) {
    res.status(e.code || 500).json({ error: e.msg || e.message });
  }
});

// ── Stop Bot ─────────────────────────────────────────────────
// POST /api/bot/:botId/stop
router.post("/:botId/stop", verifyToken, async (req, res) => {
  try {
    const bot = await getOwnedBot(req.params.botId, req.user.uid);
    await whatsapp.stopBot(bot.botId);
    res.json({ success: true, message: "Bot stopped" });
  } catch (e) {
    res.status(e.code || 500).json({ error: e.msg || e.message });
  }
});

// ── Restart Bot ──────────────────────────────────────────────
// POST /api/bot/:botId/restart
router.post("/:botId/restart", verifyToken, async (req, res) => {
  try {
    const bot = await getOwnedBot(req.params.botId, req.user.uid);
    await whatsapp.stopBot(bot.botId);
    setTimeout(() => whatsapp.startBot(bot), 2000);
    res.json({ success: true, message: "Bot restarting..." });
  } catch (e) {
    res.status(e.code || 500).json({ error: e.msg || e.message });
  }
});

// ── Get Chat Logs ────────────────────────────────────────────
// GET /api/bot/:botId/messages?limit=50&startAfter=<timestamp>
router.get("/:botId/messages", verifyToken, async (req, res) => {
  try {
    await getOwnedBot(req.params.botId, req.user.uid); // ownership check
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    let query = global.db.collection("messages")
      .where("botId", "==", req.params.botId)
      .orderBy("timestamp", "desc")
      .limit(limit);

    const snap = await query.get();
    const messages = snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
    res.json({ messages });
  } catch (e) {
    res.status(e.code || 500).json({ error: e.msg || e.message });
  }
});

// ── Bot Stats ─────────────────────────────────────────────────
// GET /api/bot/:botId/stats
router.get("/:botId/stats", verifyToken, async (req, res) => {
  try {
    await getOwnedBot(req.params.botId, req.user.uid);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const snap = await global.db.collection("messages")
      .where("botId", "==", req.params.botId)
      .where("timestamp", ">=", today.toISOString())
      .get();

    const todayMessages = snap.size;
    const uniqueCustomers = new Set(snap.docs.map(d => d.data().sender)).size;
    const aiReplies = snap.docs.filter(d => d.data().type === "outgoing").length;

    res.json({ todayMessages, uniqueCustomers, aiReplies });
  } catch (e) {
    res.status(e.code || 500).json({ error: e.msg || e.message });
  }
});

module.exports = router;

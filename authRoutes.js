// ============================================================
// backend/routes/authRoutes.js
// Auth-related endpoints — profile, stats
// ============================================================

const express       = require("express");
const router        = express.Router();
const { verifyToken } = require("../middleware/auth");

// GET /api/auth/profile — returns current user info
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const userDoc = await global.db.collection("users").doc(req.user.uid).get();
    if (!userDoc.exists) {
      // Auto-create user doc on first access
      const userData = {
        uid:       req.user.uid,
        email:     req.user.email,
        createdAt: new Date().toISOString(),
        plan:      "free",
      };
      await global.db.collection("users").doc(req.user.uid).set(userData);
      return res.json(userData);
    }
    res.json(userDoc.data());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// ============================================================
// frontend/app.js
// CombiChatBot-WattshApp — Shared Frontend Utilities
// Firebase Auth + API client + Toast + Socket helpers
// ============================================================

const API_BASE = "http://localhost:3001/api";

// ── Firebase Init ─────────────────────────────────────────────
let _auth, _db, _currentUser = null;

function initFirebase() {
  firebase.initializeApp(window.firebaseConfig);
  _auth = firebase.auth();
  _db   = firebase.firestore();

  _auth.onAuthStateChanged((user) => {
    _currentUser = user;
    window.dispatchEvent(new CustomEvent("auth:change", { detail: { user } }));
  });
}

// ── Auth Helpers ──────────────────────────────────────────────
async function getIdToken() {
  if (!_currentUser) throw new Error("Not authenticated");
  return await _currentUser.getIdToken();
}

async function register(email, password) {
  return await _auth.createUserWithEmailAndPassword(email, password);
}

async function login(email, password) {
  return await _auth.signInWithEmailAndPassword(email, password);
}

async function logout() {
  await _auth.signOut();
  window.location.href = "login.html";
}

function requireAuth() {
  return new Promise((resolve) => {
    const unsub = _auth.onAuthStateChanged((user) => {
      unsub();
      if (!user) {
        window.location.href = "login.html";
        return;
      }
      resolve(user);
    });
  });
}

// ── API Client ────────────────────────────────────────────────
async function apiRequest(method, endpoint, body = null) {
  const token = await getIdToken();
  const opts  = {
    method,
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(`${API_BASE}${endpoint}`, opts);
  const data = await res.json();

  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const api = {
  get:    (endpoint)       => apiRequest("GET",    endpoint),
  post:   (endpoint, body) => apiRequest("POST",   endpoint, body),
  put:    (endpoint, body) => apiRequest("PUT",    endpoint, body),
  delete: (endpoint)       => apiRequest("DELETE", endpoint),
};

// ── Toast Notifications ───────────────────────────────────────
function createToastContainer() {
  let el = document.getElementById("toast-container");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast-container";
    el.className = "toast-container";
    document.body.appendChild(el);
  }
  return el;
}

function showToast(message, type = "info", duration = 4000) {
  const container = createToastContainer();
  const icons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span style="font-size:1.1rem">${icons[type] || "ℹ️"}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "toast-in 0.3s ease reverse";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Socket.io Client ──────────────────────────────────────────
let _socket = null;

function connectSocket() {
  if (_socket) return _socket;
  _socket = io("http://localhost:3001", { withCredentials: true });
  _socket.on("connect",    () => console.log("🔌 Socket connected:", _socket.id));
  _socket.on("disconnect", () => console.log("🔌 Socket disconnected"));
  return _socket;
}

function subscribeToBot(botId) {
  const socket = connectSocket();
  socket.emit("subscribe_bot", botId);
  return socket;
}

// ── Format Helpers ────────────────────────────────────────────
function formatTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleDateString();
}

function formatPhone(jid) {
  // WhatsApp JID: 62812345678@s.whatsapp.net → +62 812-345-678
  if (!jid) return "Unknown";
  return "+" + jid.replace(/@.*$/, "").replace(/(\d{2})(\d{3})(\d{4})(\d*)/, "$1 $2-$3-$4");
}

function truncate(str, n = 80) {
  if (!str) return "";
  return str.length > n ? str.substring(0, n) + "…" : str;
}

// ── Status Badge HTML ─────────────────────────────────────────
function statusBadge(status) {
  const map = {
    online:      '<span class="badge badge-online"><span class="badge-dot"></span>Online</span>',
    offline:     '<span class="badge badge-offline"><span class="badge-dot"></span>Offline</span>',
    connecting:  '<span class="badge badge-connecting"><span class="badge-dot"></span>Connecting</span>',
  };
  return map[status] || map.offline;
}

// ── DOM Helpers ───────────────────────────────────────────────
function $(selector, parent = document) { return parent.querySelector(selector); }
function $$(selector, parent = document) { return [...parent.querySelectorAll(selector)]; }

function setLoading(btn, loading, text = "") {
  if (loading) {
    btn.dataset.origText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${text || "Loading..."}`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.origText || btn.innerHTML;
  }
}

// ── Init on load ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  if (typeof firebase !== "undefined" && window.firebaseConfig) {
    initFirebase();
  }
});

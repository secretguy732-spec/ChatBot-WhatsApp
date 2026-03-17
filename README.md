# 🤖 CombiChatBot-WattshApp

> WhatsApp AI Chatbot SaaS Platform — Full Stack (Node.js + Firebase + OpenAI + Baileys)

---

## 📁 Project Structure

```
combichatbot-wattshapp/
├── frontend/
│   ├── index.html          # Landing page
│   ├── login.html          # Login
│   ├── register.html       # Registration
│   ├── dashboard.html      # Main dashboard
│   ├── create-bot.html     # Create/configure bot
│   ├── bot-control.html    # QR + start/stop controls
│   ├── chat-logs.html      # Real-time chat history
│   ├── settings.html       # User settings
│   ├── style.css           # Shared dark neon theme
│   └── app.js              # Shared JS utilities (Firebase, API, Socket)
│
├── backend/
│   ├── server.js           # Express + Socket.io main server
│   ├── whatsapp.js         # Baileys WhatsApp connection engine
│   ├── ai.js               # OpenAI GPT auto-reply engine
│   ├── package.json
│   ├── .env.example        # Environment variable template
│   ├── routes/
│   │   ├── authRoutes.js   # Auth endpoints
│   │   └── botRoutes.js    # Bot CRUD + start/stop/messages
│   └── middleware/
│       └── auth.js         # Firebase token verification
│
└── firebase/
    └── firebase-config.js  # Firebase project config (shared)
```

---

## ⚙️ Prerequisites

- **Node.js** v18+
- **npm** v9+
- A **Firebase project** (free tier works)
- An **OpenAI API key**
- A WhatsApp account to connect (use a secondary number for testing)

---

## 🚀 Installation & Setup

### Step 1 — Clone / Extract the project

```bash
cd combichatbot-wattshapp/backend
```

### Step 2 — Install backend dependencies

```bash
npm install
```

This installs:
- `@whiskeysockets/baileys` — WhatsApp Web API
- `express` + `socket.io` — Server + real-time
- `openai` — AI replies
- `firebase-admin` — Firestore + Auth verification
- `qrcode` — QR code generation
- `cors`, `dotenv`, `pino`

---

## 🔥 Firebase Setup

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Add project** → name it (e.g. `combichatbot`)
3. Disable Google Analytics (optional) → Create

### 2. Enable Authentication

1. Go to **Authentication** → **Get Started**
2. Enable **Email/Password** provider

### 3. Create Firestore Database

1. Go to **Firestore Database** → **Create database**
2. Choose **Production mode**
3. Select a region

### 4. Add Firestore Security Rules

Go to Firestore → **Rules** tab, paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /bots/{botId} {
      allow read, write: if request.auth != null &&
        resource.data.userId == request.auth.uid;
      allow create: if request.auth != null;
    }
    match /messages/{msgId} {
      allow read: if request.auth != null;
      allow write: if false; // only backend writes messages
    }
  }
}
```

### 5. Get Frontend Config

1. Go to **Project Settings** → **General**
2. Scroll to **Your apps** → **Add app** → Web (`</>`)
3. Register app → copy the `firebaseConfig` object
4. Paste into `firebase/firebase-config.js`:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "your-project.firebaseapp.com",
  projectId:         "your-project-id",
  storageBucket:     "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123"
};
```

### 6. Get Service Account (for backend)

1. Go to **Project Settings** → **Service Accounts**
2. Click **Generate new private key** → Download JSON
3. Save as `backend/firebase-service-account.json`

⚠️ **NEVER commit this file to Git** — add to `.gitignore`

---

## 🔑 Configure Environment Variables

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
PORT=3001
OPENAI_API_KEY=sk-proj-your-openai-key-here
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
FRONTEND_URL=http://localhost:5500
SESSIONS_DIR=./sessions
```

### Get your OpenAI API Key

1. Go to [platform.openai.com](https://platform.openai.com)
2. **API Keys** → **Create new secret key**
3. Copy and paste into `.env`

> 💡 The system uses `gpt-3.5-turbo` by default (cheapest). Change in `backend/ai.js` to `gpt-4o` for better quality.

---

## ▶️ Running the Backend

```bash
cd backend
node server.js
```

Or with auto-reload during development:

```bash
npm run dev   # uses nodemon
```

You should see:
```
🚀  CombiChatBot-WattshApp Backend
    Server running on http://localhost:3001
    WebSocket ready on ws://localhost:3001
```

---

## 🌐 Running the Frontend

The frontend is plain HTML/CSS/JS — **no build step needed**.

**Option A — VS Code Live Server** (recommended for dev):
1. Install **Live Server** extension in VS Code
2. Right-click `frontend/index.html` → **Open with Live Server**
3. Opens at `http://127.0.0.1:5500`

**Option B — Python HTTP server**:
```bash
cd frontend
python3 -m http.server 5500
```

**Option C — Any static file host** (see Deployment below)

---

## 📱 Using the Platform

1. Open `http://localhost:5500/index.html`
2. Click **Get Started** → Register with email + password
3. Log in → you're on the Dashboard
4. Click **Create Bot** → fill the form:
   - Bot Name, Business Name
   - AI Prompt (instructions for the AI)
   - Product/Store link
   - Greeting message
5. Click **Create Bot & Continue**
6. You land on **Bot Control** page
7. Click **▶ Start Bot**
8. A QR code appears — scan it with WhatsApp:
   - Open WhatsApp on your phone
   - Tap ⋮ → **Linked Devices** → **Link a Device**
   - Scan the QR
9. Bot status changes to 🟢 **Online**
10. Send a test message from another phone to the connected number
11. Watch the AI reply in real time on **Chat Logs**

---

## 🗄️ Firestore Data Structure

```
users/
  {uid}/
    email: string
    createdAt: string (ISO)
    plan: "free" | "business" | "enterprise"

bots/
  {botId}/
    userId: string
    botName: string
    businessName: string
    phoneNumber: string
    prompt: string
    productLink: string
    greetingMessage: string
    status: "offline" | "connecting" | "online"
    messagesCount: number
    createdAt: string
    updatedAt: string

messages/
  {messageId}/
    botId: string
    sender: string  (WhatsApp JID)
    message: string
    type: "incoming" | "outgoing"
    timestamp: string (ISO)
```

---

## 🌍 Deployment

### Backend — Deploy to Railway / Render / VPS

**Railway (easiest):**
```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway init
railway up
```

Set environment variables in Railway dashboard.

**Render:**
1. Push backend to GitHub
2. New Web Service → connect repo
3. Build: `npm install` | Start: `node server.js`
4. Add env vars in Render dashboard

**VPS (Ubuntu):**
```bash
# Install Node
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
npm install -g pm2

# Run
cd backend
pm2 start server.js --name combichatbot
pm2 save
pm2 startup
```

### Frontend — Deploy to Netlify / Vercel / Firebase Hosting

**Netlify (drag & drop):**
1. Go to [netlify.com](https://netlify.com)
2. Drag the `frontend/` folder into the deploy area
3. Done — gets a `.netlify.app` URL

**Firebase Hosting:**
```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # set public dir to "frontend"
firebase deploy
```

### ⚠️ After deploying backend, update `API_BASE` in `frontend/app.js`:
```js
// Change this line:
const API_BASE = "http://localhost:3001/api";
// To your deployed URL:
const API_BASE = "https://your-backend.railway.app/api";
```

Also update `FRONTEND_URL` in backend `.env` to your deployed frontend URL (for CORS).

---

## 🔧 Customization

### Change AI Model
In `backend/ai.js`, line with `model:`:
```js
model: "gpt-4o",           // Best quality
model: "gpt-3.5-turbo",    // Default (cheapest)
model: "gpt-4o-mini",      // Good balance
```

### Add Keyword Triggers
In `backend/whatsapp.js`, before calling `generateAIReply`:
```js
// Simple keyword trigger example
if (msgText.toLowerCase().includes("harga") || msgText.toLowerCase().includes("price")) {
  await socket.sendMessage(sender, { text: `Check our prices at: ${config.productLink}` });
  continue;
}
```

### Multi-language Support
The AI prompt automatically detects and responds in the customer's language. To force a language, add to the system prompt:
```
Always respond in Bahasa Indonesia.
```

### Disable Group Messages
Already disabled by default in `whatsapp.js`:
```js
if (msg.key.remoteJid.endsWith("@g.us")) continue; // skip groups
```

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| QR not showing | Check backend is running on port 3001 |
| "Unauthorized" errors | Check Firebase config in `firebase-config.js` |
| AI not replying | Check `OPENAI_API_KEY` in `.env` |
| Bot keeps disconnecting | Normal — it auto-reconnects. Check internet |
| Session lost after restart | Sessions are saved in `backend/sessions/` folder |
| CORS error in browser | Add your frontend URL to `FRONTEND_URL` in `.env` |
| Firestore permission denied | Check security rules are published |

---

## 📦 Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JS |
| Styling | Custom CSS (dark neon theme) |
| Auth | Firebase Authentication |
| Database | Firebase Firestore |
| Backend | Node.js + Express |
| WhatsApp | @whiskeysockets/baileys |
| AI Engine | OpenAI GPT-3.5/4 |
| Real-time | Socket.io (WebSocket) |
| QR Code | qrcode npm package |

---

## ⚠️ Legal Notice

This platform uses WhatsApp Web automation via Baileys.
- Use only with numbers you own or have permission to automate
- WhatsApp may ban numbers that violate their Terms of Service
- For production use, consider the official [WhatsApp Business API](https://business.whatsapp.com/products/business-platform)
- Recommended: use a dedicated secondary number for bot purposes

---

## 🆘 Support

- Check the Troubleshooting table above
- Review browser console (F12) for frontend errors
- Review terminal output for backend errors
- Ensure all `.env` values are correctly set

---

Built with ❤️ — CombiChatBot-WattshApp

// ============================================================
// backend/ai.js
// OpenAI GPT integration for auto-reply generation
// ============================================================

const OpenAI = require("openai");

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: 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,
});

// ── Conversation history per sender ──────────────────────────
// Map<`${botId}:${sender}`, Array<{role, content}>>
// Keeps last N messages for context
const conversationHistory = new Map();
const MAX_HISTORY = 10; // last 10 exchanges

// ── Generate AI Reply ─────────────────────────────────────────
async function generateAIReply(botConfig, userMessage, sender) {
  const {
    botId,
    botName,
    businessName,
    prompt,
    productLink,
    greetingMessage,
  } = botConfig;

  // Build system prompt
  const systemPrompt = buildSystemPrompt({
    botName,
    businessName,
    customPrompt: prompt,
    productLink,
  });

  // Get or initialize conversation history
  const historyKey = `${botId}:${sender}`;
  if (!conversationHistory.has(historyKey)) {
    conversationHistory.set(historyKey, []);
  }
  const history = conversationHistory.get(historyKey);

  // Add user message to history
  history.push({ role: "user", content: userMessage });

  // Keep history trimmed
  while (history.length > MAX_HISTORY * 2) {
    history.splice(0, 2);
  }

  try {
    const response = await openai.chat.completions.create({
      model:       "gpt-3.5-turbo",
      max_tokens:  400,
      temperature: 0.7,
      messages:    [
        { role: "system", content: systemPrompt },
        ...history,
      ],
    });

    const reply = response.choices[0]?.message?.content?.trim() || 
                  "Sorry, I couldn't process your request. Please try again.";

    // Add assistant reply to history
    history.push({ role: "assistant", content: reply });

    console.log(`🤖  AI reply generated (${reply.length} chars)`);
    return reply;

  } catch (err) {
    console.error("OpenAI API error:", err.message);

    // Fallback reply if OpenAI fails
    const fallback = productLink
      ? `Hello! Thank you for contacting ${businessName || "us"}. Visit our store: ${productLink}`
      : `Hello! Thank you for contacting ${businessName || "us"}. We'll get back to you soon.`;

    return fallback;
  }
}

// ── Build System Prompt ───────────────────────────────────────
function buildSystemPrompt({ botName, businessName, customPrompt, productLink }) {
  let system = `You are ${botName || "an AI assistant"}, a professional customer service chatbot`;
  
  if (businessName) {
    system += ` for ${businessName}`;
  }

  system += ".\n\n";

  if (customPrompt) {
    system += `${customPrompt}\n\n`;
  } else {
    system += `Your role is to help customers with their questions, guide them to products, and provide excellent customer service.\n\n`;
  }

  if (productLink) {
    system += `Our store/product link: ${productLink}\n`;
    system += `When relevant, guide customers to visit this link.\n\n`;
  }

  system += `Guidelines:
- Keep replies concise and friendly (max 3-4 sentences)
- Always be polite and professional
- If you don't know something, offer to connect them with a human agent
- Respond in the same language the customer uses
- Use emojis sparingly to be friendly but professional`;

  return system;
}

// ── Clear History (when bot restarts) ────────────────────────
function clearBotHistory(botId) {
  for (const key of conversationHistory.keys()) {
    if (key.startsWith(`${botId}:`)) {
      conversationHistory.delete(key);
    }
  }
}

module.exports = { generateAIReply, clearBotHistory };

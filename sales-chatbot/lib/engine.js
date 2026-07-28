/*
 * engine.js — Logique métier partagée du chatbot de vente.
 *
 * Source unique utilisée à la fois par :
 *   - server.js            (serveur Node classique : local, Render, Railway…)
 *   - api/[...path].js      (fonctions serverless Vercel)
 *
 * Gère l'état des sessions, la conversation (Claude si clé dispo, sinon repli
 * hors-ligne), la capture des leads et la configuration du catalogue.
 *
 * ⚠️ Prototype : état EN MÉMOIRE. En serverless (Vercel), cet état n'est pas
 * garanti d'être partagé entre les instances/redémarrages à froid — c'est
 * suffisant pour une démo, mais la production doit utiliser PostgreSQL/Redis
 * (voir ../../ARCHITECTURE.md).
 */

const rec = require("./recommender");
const claude = require("./claude");

// Catalogue par défaut chargé via require (tracé et embarqué par les bundlers,
// y compris celui de Vercel).
let DEFAULT_CATALOG = [];
try {
  DEFAULT_CATALOG = require("../demo/catalog.sample.json");
} catch (e) {
  DEFAULT_CATALOG = [];
}

// ---------------- État en mémoire ----------------
const sessions = new Map();
const leads = [];

function getSession(id) {
  if (!sessions.has(id)) {
    sessions.set(id, {
      messages: [],
      claudeMessages: [],
      lead: {},
      lastProducts: [],
      catalog: null,
      brand: null,
    });
  }
  return sessions.get(id);
}

function recordLead(sessionId, lead) {
  if (!lead || (!lead.email && !lead.need && !lead.budget_cents)) return;
  const existing = leads.find((l) => l.sessionId === sessionId);
  const entry = { sessionId, ...lead, updatedAt: new Date().toISOString() };
  if (existing) Object.assign(existing, entry);
  else leads.push({ createdAt: new Date().toISOString(), ...entry });
}

// ---------------- Chat ----------------
async function handleChat(body) {
  body = body || {};
  const sessionId = body.sessionId || "anon";
  const message = String(body.message || "").slice(0, 2000);
  const session = getSession(sessionId);

  // La clé est lue à chaque appel (compatible chargement .env tardif + serverless).
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
  const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

  if (Array.isArray(body.catalog) && body.catalog.length) session.catalog = body.catalog;
  if (body.brand) session.brand = body.brand;
  const catalog = session.catalog || DEFAULT_CATALOG;

  session.messages.push({ role: "user", content: message });

  let result;
  let source = "offline";

  if (ANTHROPIC_API_KEY) {
    try {
      session.claudeMessages.push({ role: "user", content: message });
      result = await claude.converse({
        apiKey: ANTHROPIC_API_KEY,
        model: MODEL,
        brand: session.brand,
        messages: session.claudeMessages,
        catalog,
        session,
      });
      session.claudeMessages = result.messages;
      source = "claude";
    } catch (e) {
      // Trace visible dans les logs Vercel pour diagnostiquer l'échec Claude.
      console.error("[Exceptionel][Claude] appel échoué, repli hors-ligne →", e && e.message);
      result = rec.respond(session, message, catalog);
      source = "offline-fallback";
    }
  } else {
    result = rec.respond(session, message, catalog);
  }

  session.messages.push({ role: "assistant", content: result.reply });
  recordLead(sessionId, session.lead);

  return {
    reply: result.reply,
    products: (result.products || []).map((p) => ({
      id: p.id,
      name: p.name,
      price: rec.formatPrice(p),
      price_cents: rec.priceCents(p),
      description: p.description || p.shortPitch || "",
      image_url: p.image_url || p.image || "",
      url: p.url || "#",
    })),
    actions: result.actions || [],
    lead: session.lead || {},
    tools: result.tools || [],
    source,
  };
}

// ---------------- Config catalogue / marque ----------------
function setConfig(body) {
  body = body || {};
  const session = getSession(body.sessionId || "anon");
  if (Array.isArray(body.catalog)) session.catalog = body.catalog;
  if (body.brand) session.brand = body.brand;
  return { ok: true, products: (session.catalog || DEFAULT_CATALOG).length };
}

// ---------------- Leads ----------------
function getLeads() {
  return { leads, count: leads.length };
}

// ---------------- Santé ----------------
function health() {
  return {
    ok: true,
    mode: process.env.ANTHROPIC_API_KEY ? "claude" : "offline",
    catalog: DEFAULT_CATALOG.length,
    sessions: sessions.size,
    leads: leads.length,
  };
}

// ---------------- Diagnostic Claude ----------------
// Teste réellement l'appel à Claude et renvoie l'erreur exacte le cas échéant.
async function diagnose() {
  const key = process.env.ANTHROPIC_API_KEY || "";
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  if (!key) {
    return {
      key_present: false,
      claude_ok: false,
      hint: "No ANTHROPIC_API_KEY detected in the Vercel environment variables.",
    };
  }
  // List of models actually available for this account (useful for model errors).
  let available_models = null;
  try {
    available_models = await claude.listModels(key);
  } catch (e) {
    available_models = "unavailable: " + String((e && e.message) || e);
  }
  try {
    const sample = await claude.ping(key, model);
    return { key_present: true, model, claude_ok: true, sample, available_models };
  } catch (e) {
    const msg = String((e && e.message) || e);
    let hint = "Unknown error — copy this message to your developer.";
    if (/401|authentication|invalid x-api-key|invalid api/i.test(msg))
      hint = "Invalid or mis-pasted API key in Vercel → re-paste it then Redeploy.";
    else if (/credit|billing|quota|balance/i.test(msg))
      hint = "Insufficient Anthropic credit → add credit at console.anthropic.com (Billing).";
    else if (/model|not_found|not found/i.test(msg))
      hint = "Invalid model name → set ANTHROPIC_MODEL to a valid model.";
    else if (/429|rate/i.test(msg))
      hint = "Rate limit reached → try again or raise your limits.";
    return { key_present: true, model, claude_ok: false, error: msg, hint, available_models };
  }
}

module.exports = { handleChat, setConfig, getLeads, health, diagnose, DEFAULT_CATALOG };

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
const db = require("./db");

// Catalogue par défaut chargé via require (tracé et embarqué par les bundlers,
// y compris celui de Vercel).
let DEFAULT_CATALOG = [];
try {
  DEFAULT_CATALOG = require("../demo/catalog.sample.json");
} catch (e) {
  DEFAULT_CATALOG = [];
}

// ---------------- État en mémoire (sessions de conversation) ----------------
const sessions = new Map();

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

// Persiste un prospect QUALIFIÉ (avec email) une seule fois par session,
// rattaché au marchand (user_id). Stocké en base (ou en mémoire en démo).
async function recordLead(userId, session) {
  const lead = (session && session.lead) || {};
  if (!lead.email) return; // on ne persiste que les leads qualifiés
  if (session.leadInserted) return;
  session.leadInserted = true;
  try {
    await db.insert("leads", {
      user_id: userId || "demo",
      email: lead.email,
      need: lead.need || null,
      budget_cents: lead.budget_cents || null,
      score: lead.score || null,
      status: lead.status || "qualified",
    });
  } catch (e) {
    session.leadInserted = false; // autorise une nouvelle tentative
    console.error("[Exceptionel][leads] persist failed →", e && e.message);
  }
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

  // Capture d'email ROBUSTE : si l'utilisateur a écrit un email dans son
  // message, on qualifie le lead (même si Claude n'a pas appelé capture_lead).
  const foundEmail = rec.extractEmail(message);
  if (foundEmail) {
    session.lead = session.lead || {};
    if (!session.lead.email) session.lead.email = foundEmail;
    if (!session.lead.need) session.lead.need = session.messages.length ? session.messages[0].content : null;
    if (!session.lead.status) session.lead.status = "qualified";
    if (session.lead.score == null) session.lead.score = 50;
  }

  await recordLead(body.__userId, session);

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

// ---------------- Leads (persistés, par marchand) ----------------
async function getLeads(userId) {
  const rows = await db.select("leads", { user_id: userId || "demo" });
  return { leads: rows, count: rows.length };
}

// Diagnostic : teste réellement l'écriture/lecture dans la table `leads`.
async function dbcheck() {
  const info = { configured: db.isConfigured() };
  if (!db.isConfigured()) {
    info.error = "SUPABASE non configuré sur ce projet (SUPABASE_URL / SUPABASE_SERVICE_KEY manquants).";
    return info;
  }
  try {
    const row = await db.insert("leads", { user_id: "__diag__", email: "diag@example.com", status: "diag" });
    info.insert_ok = true;
    info.inserted_id = row && row.id;
    const rows = await db.select("leads", { user_id: "__diag__" });
    info.select_count = rows.length;
    info.ok = true;
  } catch (e) {
    info.ok = false;
    info.error = String((e && e.message) || e);
  }
  return info;
}

// ---------------- Santé ----------------
function health() {
  return {
    ok: true,
    mode: process.env.ANTHROPIC_API_KEY ? "claude" : "offline",
    storage: db.isConfigured() ? "postgres" : "in-memory (demo)",
    catalog: DEFAULT_CATALOG.length,
    sessions: sessions.size,
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

module.exports = { handleChat, setConfig, getLeads, dbcheck, health, diagnose, DEFAULT_CATALOG };

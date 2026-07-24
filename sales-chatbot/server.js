/*
 * server.js — Backend du prototype "Chatbot de vente" Exceptionel AI.
 *
 * ZÉRO DÉPENDANCE (Node natif). Lancer :  node server.js
 *
 * Rôles :
 *   - Sert le widget embarquable (public/embed.js) et la boutique de démo (demo/).
 *   - POST /api/chat   : conversation de vente (Claude si clé dispo, sinon repli).
 *   - POST /api/config : associe un catalogue + une marque à une session.
 *   - GET  /api/leads  : liste des prospects qualifiés (pour le dashboard/démo).
 *
 * Persistance : en mémoire (prototype). En prod → PostgreSQL (voir ARCHITECTURE.md).
 *
 * Vraie IA : définir ANTHROPIC_API_KEY pour activer Claude + function calling.
 *   export ANTHROPIC_API_KEY="sk-ant-..."
 *   node server.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const rec = require("./lib/recommender");
const claude = require("./lib/claude");

const PORT = process.env.PORT || 4000;
const ROOT = __dirname;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

// ---------------- État en mémoire ----------------
const sessions = new Map(); // sessionId -> { messages, claudeMessages, lead, lastProducts, catalog, brand }
const leads = []; // prospects capturés (tous sessions)

let DEFAULT_CATALOG = [];
try {
  DEFAULT_CATALOG = JSON.parse(fs.readFileSync(path.join(ROOT, "demo", "catalog.sample.json"), "utf8"));
} catch (e) {
  DEFAULT_CATALOG = [];
}

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

// ---------------- Helpers HTTP ----------------
function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function sendJSON(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*", // prototype : ouvert. Prod : allowlist par clé.
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(obj));
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404");
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(content);
  });
}

// ---------------- Logique de chat ----------------
async function handleChat(body) {
  const sessionId = body.sessionId || "anon";
  const message = String(body.message || "").slice(0, 2000);
  const session = getSession(sessionId);

  // Catalogue : fourni à la volée, sinon celui de la session, sinon défaut.
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
      session.claudeMessages = result.messages; // conserve le contexte (outils inclus)
      source = "claude";
    } catch (e) {
      // Bascule transparente vers le moteur hors-ligne
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

// ---------------- Serveur ----------------
const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    return res.end();
  }

  // --- API ---
  if (req.method === "POST" && urlPath === "/api/chat") {
    const body = await readBody(req);
    try {
      const out = await handleChat(body);
      return sendJSON(res, 200, out);
    } catch (e) {
      return sendJSON(res, 500, { error: e.message });
    }
  }

  if (req.method === "POST" && urlPath === "/api/config") {
    const body = await readBody(req);
    const session = getSession(body.sessionId || "anon");
    if (Array.isArray(body.catalog)) session.catalog = body.catalog;
    if (body.brand) session.brand = body.brand;
    return sendJSON(res, 200, { ok: true, products: (session.catalog || DEFAULT_CATALOG).length });
  }

  if (req.method === "GET" && urlPath === "/api/leads") {
    return sendJSON(res, 200, { leads, count: leads.length });
  }

  if (req.method === "GET" && urlPath === "/api/health") {
    return sendJSON(res, 200, {
      ok: true,
      mode: ANTHROPIC_API_KEY ? "claude" : "offline",
      catalog: DEFAULT_CATALOG.length,
      sessions: sessions.size,
      leads: leads.length,
    });
  }

  // --- Fichiers statiques ---
  let rel = urlPath === "/" ? "/demo/index.html" : urlPath;
  const filePath = path.join(ROOT, path.normalize(rel));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  return serveStatic(res, filePath);
});

server.listen(PORT, () => {
  console.log("\n  Exceptionel AI — Chatbot de vente (prototype)");
  console.log("  → Démo boutique : http://localhost:" + PORT);
  console.log("  → Widget        : http://localhost:" + PORT + "/public/embed.js");
  console.log("  → Leads (API)   : http://localhost:" + PORT + "/api/leads");
  console.log("  → IA            : " + (ANTHROPIC_API_KEY ? "Claude ACTIVÉ (" + MODEL + ")" : "mode hors-ligne (aucune ANTHROPIC_API_KEY)"));
  console.log("");
});

module.exports = { server, handleChat };

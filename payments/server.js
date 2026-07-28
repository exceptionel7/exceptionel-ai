/*
 * server.js — Serveur Node classique du module Paiements Stripe.
 *
 * ZÉRO DÉPENDANCE (Node natif). Lancer :  node server.js
 * Pour Vercel, voir api/index.js + vercel.json (logique partagée via lib/engine.js).
 *
 * Clés (fichier .env en local, variables d'environnement sinon) :
 *   STRIPE_SECRET_KEY      → paiements réels (sk_test_... ou sk_live_...)
 *   STRIPE_WEBHOOK_SECRET  → vérification des webhooks (whsec_...)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

(function loadEnv() {
  try {
    const content = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    content.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith("#")) return;
      let val = m[2].trim();
      if (/^(".*"|'.*')$/.test(val)) val = val.slice(1, -1);
      if (!(m[1] in process.env)) process.env[m[1]] = val;
    });
  } catch (e) { /* pas de .env */ }
})();

const engine = require("./lib/engine");

const PORT = process.env.PORT || 6000;
const ROOT = __dirname;

function readRaw(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve(body));
  });
}

function sendJSON(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(obj));
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("404"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" });
    return res.end();
  }

  try {
    if (req.method === "POST" && urlPath === "/api/checkout") {
      const raw = await readRaw(req);
      let body = {}; try { body = JSON.parse(raw || "{}"); } catch (e) {}
      return sendJSON(res, 200, await engine.createCheckout(body));
    }
    if (req.method === "POST" && urlPath === "/api/webhook") {
      const raw = await readRaw(req); // corps BRUT (indispensable pour la signature)
      const result = engine.handleWebhook(raw, req.headers["stripe-signature"]);
      return sendJSON(res, result.status, result.body);
    }
    if (req.method === "GET" && urlPath === "/api/orders") return sendJSON(res, 200, engine.listOrders());
    if (req.method === "GET" && urlPath === "/api/health") return sendJSON(res, 200, engine.health());
  } catch (e) {
    return sendJSON(res, 500, { error: e.message });
  }

  const rel = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.join(ROOT, path.normalize(rel));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
  return serveStatic(res, filePath);
});

server.listen(PORT, () => {
  const h = engine.health();
  console.log("\n  Exceptionel AI — Paiements Stripe (prototype)");
  console.log("  → Démo    : http://localhost:" + PORT);
  console.log("  → Paiement: " + h.payments + " (" + h.key_type + ") | Webhook: " + (h.webhook_configured ? "configuré" : "non"));
  console.log("");
});

module.exports = { server };

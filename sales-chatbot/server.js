/*
 * server.js — Serveur Node classique du chatbot de vente Exceptionel AI.
 *
 * ZÉRO DÉPENDANCE (Node natif). Idéal en local et sur les hébergeurs qui font
 * tourner un serveur permanent (Render, Railway, Fly.io…). Lancer :
 *     node server.js
 *
 * Pour Vercel (serverless), voir le dossier api/ et vercel.json — la logique
 * métier est partagée via lib/engine.js.
 *
 * Vraie IA : définir ANTHROPIC_API_KEY (fichier .env en local, ou variables
 * d'environnement de l'hébergeur en production).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

// Charge un fichier .env local s'il existe (zéro dépendance). Le .env n'est
// JAMAIS versionné (voir .gitignore) : c'est là que vous mettez votre clé.
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
  } catch (e) {
    /* pas de .env : on continue avec les variables d'environnement système */
  }
})();

const engine = require("./lib/engine");
const identity = require("./lib/identity");

const PORT = process.env.PORT || 4000;
const ROOT = __dirname;

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
    "Access-Control-Allow-Origin": "*",
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

  // --- API (déléguée au moteur partagé) ---
  try {
    if (req.method === "POST" && urlPath === "/api/chat") {
      const body = await readBody(req);
      body.__userId = identity.resolveUserId(req.headers, body);
      return sendJSON(res, 200, await engine.handleChat(body));
    }
    if (req.method === "POST" && urlPath === "/api/config") {
      return sendJSON(res, 200, engine.setConfig(await readBody(req)));
    }
    if (req.method === "GET" && urlPath === "/api/leads") {
      const u = new URL(req.url, "http://localhost");
      const userId = identity.resolveUserId(req.headers, { merchantId: u.searchParams.get("merchantId") });
      return sendJSON(res, 200, await engine.getLeads(userId));
    }
    if (req.method === "GET" && urlPath === "/api/health") {
      return sendJSON(res, 200, engine.health());
    }
    if (req.method === "GET" && urlPath === "/api/catalog") {
      return sendJSON(res, 200, engine.getCatalog());
    }
    if (req.method === "POST" && urlPath === "/api/catalog/refresh") {
      return sendJSON(res, 200, await engine.refreshCatalog());
    }
    if (req.method === "GET" && urlPath === "/api/dbcheck") {
      return sendJSON(res, 200, await engine.dbcheck());
    }
    if (req.method === "GET" && urlPath === "/api/diag") {
      return sendJSON(res, 200, await engine.diagnose());
    }
  } catch (e) {
    return sendJSON(res, 500, { error: e.message });
  }

  // --- Fichiers statiques ---
  const rel = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.join(ROOT, path.normalize(rel));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  return serveStatic(res, filePath);
});

server.listen(PORT, () => {
  const mode = process.env.ANTHROPIC_API_KEY
    ? "Claude ACTIVÉ (" + (process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514") + ")"
    : "mode hors-ligne (aucune ANTHROPIC_API_KEY)";
  console.log("\n  Exceptionel AI — Chatbot de vente (prototype)");
  console.log("  → Démo boutique : http://localhost:" + PORT);
  console.log("  → Widget        : http://localhost:" + PORT + "/public/embed.js");
  console.log("  → Leads (API)   : http://localhost:" + PORT + "/api/leads");
  console.log("  → IA            : " + mode);
  console.log("");
});

module.exports = { server };

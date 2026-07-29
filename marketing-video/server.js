/*
 * server.js — Serveur Node classique du module Génération Vidéo Marketing.
 *
 * ZÉRO DÉPENDANCE (Node natif). Lancer :  node server.js
 * Pour Vercel (serverless), voir api/index.js + vercel.json (logique partagée
 * via lib/engine.js).
 *
 * Clés (fichier .env en local, ou variables d'environnement de l'hébergeur) :
 *   ANTHROPIC_API_KEY   → script généré par Claude (sinon repli hors-ligne)
 *   HEYGEN_API_KEY / RUNWAY_API_KEY → rendu vidéo réel (sinon mock)
 *   META_ACCESS_TOKEN + META_IG_USER_ID / META_FB_PAGE_ID → publication Meta
 *   TIKTOK_ACCESS_TOKEN → publication TikTok
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
  } catch (e) {
    /* pas de .env */
  }
})();

const engine = require("./lib/engine");
const identity = require("./lib/identity");

const PORT = process.env.PORT || 5000;
const ROOT = __dirname;

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch { resolve({}); }
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
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" });
    return res.end();
  }
  try {
    if (req.method === "POST" && urlPath === "/api/script") return sendJSON(res, 200, await engine.generateScript(await readBody(req)));
    if (req.method === "POST" && urlPath === "/api/generate") {
      const body = await readBody(req);
      body.__userId = identity.resolveUserId(req.headers, body);
      return sendJSON(res, 200, await engine.generateVideo(body));
    }
    if (req.method === "GET" && urlPath === "/api/videos") {
      const u = new URL(req.url, "http://localhost");
      const userId = identity.resolveUserId(req.headers, { merchantId: u.searchParams.get("merchantId") });
      return sendJSON(res, 200, await engine.listVideos(userId));
    }
    if (req.method === "GET" && urlPath === "/api/assets") {
      const ua = new URL(req.url, "http://localhost");
      return sendJSON(res, 200, await engine.heygenAssets({ type: ua.searchParams.get("type") }));
    }
    if (req.method === "GET" && urlPath === "/api/status") {
      const u = new URL(req.url, "http://localhost");
      return sendJSON(res, 200, await engine.videoStatus({ provider: u.searchParams.get("provider"), jobId: u.searchParams.get("jobId") }));
    }
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
  console.log("\n  Exceptionel AI — Génération Vidéo Marketing (prototype)");
  console.log("  → Démo    : http://localhost:" + PORT);
  console.log("  → Script  : " + h.script_ai + " | Vidéo : " + h.video_provider);
  console.log("  → Réseaux : IG=" + h.social.instagram + " FB=" + h.social.facebook + " TikTok=" + h.social.tiktok);
  console.log("");
});

module.exports = { server };

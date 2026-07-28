/*
 * server.js — Auth server (classic Node). Zero dependency.
 *   node server.js
 *
 * Env (.env locally, environment variables in production):
 *   AUTH_JWT_SECRET        long random string used to sign JWTs
 *   SUPABASE_URL           https://xxxx.supabase.co  (enables real persistence)
 *   SUPABASE_SERVICE_KEY   service_role key (server only)
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
  } catch (e) { /* no .env */ }
})();

const engine = require("./lib/engine");

const PORT = process.env.PORT || 7000;
const ROOT = __dirname;

function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } });
  });
}
function sendJSON(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(obj));
}
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
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
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" });
    return res.end();
  }
  try {
    if (req.method === "POST" && urlPath === "/api/signup") { const r = await engine.signup(await readBody(req)); return sendJSON(res, r.status, r.body); }
    if (req.method === "POST" && urlPath === "/api/login") { const r = await engine.login(await readBody(req)); return sendJSON(res, r.status, r.body); }
    if (req.method === "GET" && urlPath === "/api/me") { const r = await engine.me(req.headers["authorization"]); return sendJSON(res, r.status, r.body); }
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
  console.log("\n  Exceptionel AI — Auth & accounts (prototype)");
  console.log("  → Demo    : http://localhost:" + PORT);
  console.log("  → Storage : " + h.storage);
  console.log("  → JWT secret: " + (h.jwt_secret_set ? "set" : "DEFAULT (insecure — set AUTH_JWT_SECRET)"));
  console.log("");
});

module.exports = { server };

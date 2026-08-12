/*
 * api/index.js — Fonction serverless Vercel (unique) du module vidéo.
 *
 * vercel.json route /api/* vers cette fonction (sous-chemin dans ?__path=...).
 * Routes : script / generate / videos / health. Logique dans lib/engine.js.
 */

const engine = require("../lib/engine");
const identity = require("../lib/identity");
const tiktok = require("../lib/tiktok-oauth");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function baseUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return "https://" + host;
}
function htmlPage(res, code, inner) {
  res.statusCode = code;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(
    "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
    "<title>Connect TikTok — Exceptionel AI</title>" +
    "<body style=\"font-family:system-ui,sans-serif;background:#0f1115;color:#e7e9ee;min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;padding:24px\">" +
    "<div style=\"max-width:640px;width:100%;background:#171a21;border:1px solid #262b36;border-radius:16px;padding:28px\">" +
    inner + "</div></body>"
  );
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>\"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    if (typeof req.body === "string") { try { return resolve(JSON.parse(req.body || "{}")); } catch { return resolve({}); } }
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
  });
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const q = (req.query && req.query.__path) || "";
  const raw = String(req.url || "").split("?")[0];
  const route = (q || raw).toLowerCase();

  try {
    // ---- TikTok OAuth: one-click connect flow ----
    if (req.method === "GET" && route.includes("tiktok/connect")) {
      if (!tiktok.isConfigured()) {
        return htmlPage(res, 400, "<h2>TikTok not configured</h2><p>Set <code>TIKTOK_CLIENT_KEY</code> and <code>TIKTOK_CLIENT_SECRET</code> on this Vercel project, then redeploy.</p>");
      }
      const redirectUri = baseUrl(req) + "/api/tiktok/callback";
      res.statusCode = 302;
      res.setHeader("Location", tiktok.authorizeUrl("exc_" + Date.now(), redirectUri));
      return res.end();
    }
    if (route.includes("tiktok") && route.includes("status")) {
      const pid = (req.query && (req.query.publish_id || req.query.publishId)) || "";
      return json(res, 200, await engine.tiktokStatus(pid));
    }
    if (req.method === "GET" && route.includes("tiktok/callback")) {
      const query = req.query || {};
      if (query.error) {
        return htmlPage(res, 400, "<h2>❌ Authorization refused</h2><p>" + esc(query.error_description || query.error) + "</p>");
      }
      if (!query.code) return htmlPage(res, 400, "<h2>Missing authorization code</h2>");
      try {
        const t = await tiktok.exchangeCode(query.code, baseUrl(req) + "/api/tiktok/callback");
        return htmlPage(res, 200,
          "<h2>✅ TikTok connected!</h2>" +
          "<p>Copy this value into the Vercel env var <b>TIKTOK_REFRESH_TOKEN</b> (video project), then redeploy:</p>" +
          "<textarea readonly style=\"width:100%;height:90px;background:#0f1115;color:#34d399;border:1px solid #262b36;border-radius:10px;padding:12px;font-family:monospace;font-size:13px\">" + esc(t.refresh_token || "") + "</textarea>" +
          "<p style=\"color:#9aa2b1;font-size:13px\">Scopes: " + esc(t.scope || "") + " · This refresh token lasts ~365 days; the app mints fresh access tokens automatically.</p>" +
          "<details style=\"margin-top:8px;color:#9aa2b1;font-size:12px\"><summary>Access token (expires in ~24h — usually not needed)</summary><textarea readonly style=\"width:100%;height:70px;background:#0f1115;color:#9aa2b1;border:1px solid #262b36;border-radius:10px;padding:10px;font-family:monospace;font-size:12px;margin-top:8px\">" + esc(t.access_token || "") + "</textarea></details>"
        );
      } catch (e) {
        return htmlPage(res, 400, "<h2>❌ Token exchange failed</h2><p>" + esc(e.message) + "</p>");
      }
    }

    if (req.method === "POST" && route.includes("script")) return json(res, 200, await engine.generateScript(await readBody(req)));
    if (req.method === "POST" && route.includes("generate")) {
      const body = await readBody(req);
      body.__userId = identity.resolveUserId(req.headers, body);
      return json(res, 200, await engine.generateVideo(body));
    }
    // Publish an already-rendered video (public MP4 URL) — used to test real
    // publishing to TikTok drafts. GET with ?video_url=...&caption=...&platform=tiktok
    if (route.includes("publish")) {
      const src = req.method === "POST" ? await readBody(req) : (req.query || {});
      return json(res, 200, await engine.publishExisting({
        videoUrl: src.video_url || src.videoUrl,
        caption: src.caption,
        platform: src.platform || "tiktok",
      }));
    }
    if (req.method === "GET" && route.includes("videos")) {
      const userId = identity.resolveUserId(req.headers, req.query || {});
      return json(res, 200, await engine.listVideos(userId));
    }
    if (req.method === "GET" && route.includes("assets")) return json(res, 200, await engine.heygenAssets(req.query || {}));
    if (req.method === "GET" && route.includes("status")) return json(res, 200, await engine.videoStatus(req.query || {}));
    if (req.method === "GET" && route.includes("health")) return json(res, 200, engine.health());
    return json(res, 404, { error: "not_found", route });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};

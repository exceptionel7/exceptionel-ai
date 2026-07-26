/*
 * api/index.js — Fonction serverless Vercel (unique) du module vidéo.
 *
 * vercel.json route /api/* vers cette fonction (sous-chemin dans ?__path=...).
 * Routes : script / generate / videos / health. Logique dans lib/engine.js.
 */

const engine = require("../lib/engine");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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
    if (req.method === "POST" && route.includes("script")) return json(res, 200, await engine.generateScript(await readBody(req)));
    if (req.method === "POST" && route.includes("generate")) return json(res, 200, await engine.generateVideo(await readBody(req)));
    if (req.method === "GET" && route.includes("videos")) return json(res, 200, engine.listVideos());
    if (req.method === "GET" && route.includes("assets")) return json(res, 200, await engine.heygenAssets());
    if (req.method === "GET" && route.includes("status")) return json(res, 200, await engine.videoStatus(req.query || {}));
    if (req.method === "GET" && route.includes("health")) return json(res, 200, engine.health());
    return json(res, 404, { error: "not_found", route });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};

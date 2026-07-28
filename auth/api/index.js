/*
 * api/index.js — Vercel serverless function (single) for the Auth module.
 * vercel.json routes /api/* here (sub-path in ?__path=...).
 * Routes: signup / login / me / health. Logic in lib/engine.js.
 */

const engine = require("../lib/engine");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}
function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise(function (resolve) {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    if (typeof req.body === "string") { try { return resolve(JSON.parse(req.body || "{}")); } catch { return resolve({}); } }
    let data = "";
    req.on("data", function (c) { data += c; });
    req.on("end", function () { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
  });
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  const q = (req.query && req.query.__path) || "";
  const route = (q || String(req.url || "").split("?")[0]).toLowerCase();
  try {
    if (req.method === "POST" && route.indexOf("signup") !== -1) { const r = await engine.signup(await readBody(req)); return json(res, r.status, r.body); }
    if (req.method === "POST" && route.indexOf("login") !== -1) { const r = await engine.login(await readBody(req)); return json(res, r.status, r.body); }
    if (req.method === "GET" && route.indexOf("me") !== -1) { const r = await engine.me(req.headers["authorization"]); return json(res, r.status, r.body); }
    if (req.method === "GET" && route.indexOf("health") !== -1) return json(res, 200, engine.health());
    return json(res, 404, { error: "not_found", route: route });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};

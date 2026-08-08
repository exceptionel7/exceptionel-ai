/*
 * api/index.js — Vercel serverless function (single) for the Auth module.
 * vercel.json routes /api/* here (sub-path in ?__path=...).
 * Routes: signup / login / me / health + billing (checkout / portal / webhook).
 *
 * The Vercel body parser is DISABLED so the Stripe billing webhook can read the
 * RAW body required for signature verification. JSON routes parse it themselves.
 */

const engine = require("../lib/engine");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Stripe-Signature");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}
function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}
function readRaw(req) {
  return new Promise(function (resolve) {
    if (typeof req.body === "string") return resolve(req.body);
    if (req.body && typeof req.body === "object" && Object.keys(req.body).length) {
      return resolve(JSON.stringify(req.body));
    }
    let data = "";
    req.on("data", function (c) { data += c; });
    req.on("end", function () { resolve(data); });
  });
}
function parseJson(raw) {
  try { return JSON.parse(raw || "{}"); } catch (e) { return {}; }
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  const q = (req.query && req.query.__path) || "";
  const route = (q || String(req.url || "").split("?")[0]).toLowerCase();
  const authHeader = req.headers["authorization"];

  try {
    // ---- Billing (checked before generic routes) ----
    if (req.method === "POST" && route.indexOf("webhook") !== -1) {
      const raw = await readRaw(req);
      const r = await engine.billingWebhook(raw, req.headers["stripe-signature"]);
      return json(res, r.status, r.body);
    }
    if (req.method === "POST" && route.indexOf("checkout") !== -1) {
      const r = await engine.billingCheckout(authHeader, parseJson(await readRaw(req)));
      return json(res, r.status, r.body);
    }
    if (req.method === "POST" && route.indexOf("portal") !== -1) {
      const r = await engine.billingPortal(authHeader, parseJson(await readRaw(req)));
      return json(res, r.status, r.body);
    }

    // ---- Auth ----
    if (req.method === "POST" && route.indexOf("signup") !== -1) {
      const r = await engine.signup(parseJson(await readRaw(req)));
      return json(res, r.status, r.body);
    }
    if (req.method === "POST" && route.indexOf("login") !== -1) {
      const r = await engine.login(parseJson(await readRaw(req)));
      return json(res, r.status, r.body);
    }
    if (req.method === "GET" && route.indexOf("me") !== -1) {
      const r = await engine.me(authHeader);
      return json(res, r.status, r.body);
    }
    if (req.method === "GET" && route.indexOf("health") !== -1) return json(res, 200, engine.health());
    return json(res, 404, { error: "not_found", route: route });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};

// Disable Vercel's body parser (raw body required for Stripe webhook signatures).
module.exports.config = { api: { bodyParser: false } };

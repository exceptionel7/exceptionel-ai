/*
 * api/index.js — Fonction serverless Vercel (unique) du module Paiements.
 *
 * IMPORTANT : le body parser de Vercel est DÉSACTIVÉ (config plus bas) afin de
 * préserver le CORPS BRUT nécessaire à la vérification de signature des webhooks
 * Stripe. On lit donc le flux nous-mêmes.
 *
 * vercel.json route /api/* vers cette fonction (sous-chemin dans ?__path=...).
 */

const engine = require("../lib/engine");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Stripe-Signature");
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
      // Corps déjà parsé (au cas où) : on le re-sérialise (webhook peut alors échouer, d'où bodyParser:false).
      return resolve(JSON.stringify(req.body));
    }
    var data = "";
    req.on("data", function (c) { data += c; });
    req.on("end", function () { resolve(data); });
  });
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  var q = (req.query && req.query.__path) || "";
  var route = (q || String(req.url || "").split("?")[0]).toLowerCase();

  try {
    if (req.method === "POST" && route.indexOf("checkout") !== -1) {
      var raw = await readRaw(req);
      var body = {};
      try { body = JSON.parse(raw || "{}"); } catch (e) {}
      return json(res, 200, await engine.createCheckout(body));
    }
    if (req.method === "POST" && route.indexOf("webhook") !== -1) {
      var rawBody = await readRaw(req);
      var result = engine.handleWebhook(rawBody, req.headers["stripe-signature"]);
      return json(res, result.status, result.body);
    }
    if (req.method === "GET" && route.indexOf("orders") !== -1) return json(res, 200, engine.listOrders());
    if (req.method === "GET" && route.indexOf("health") !== -1) return json(res, 200, engine.health());
    return json(res, 404, { error: "not_found", route: route });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};

// Désactive le body parser de Vercel (corps brut requis pour les webhooks Stripe).
module.exports.config = { api: { bodyParser: false } };

/*
 * api/index.js — Fonction serverless Vercel (unique) du chatbot de vente.
 *
 * vercel.json route toutes les requêtes /api/* vers cette fonction, en passant
 * le sous-chemin dans le paramètre ?__path=... (ex : /api/chat → __path=chat).
 * On gère ici chat / config / leads / health, avec état partagé au sein d'une
 * même instance. La logique métier vit dans lib/engine.js.
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
    if (typeof req.body === "string") {
      try {
        return resolve(JSON.parse(req.body || "{}"));
      } catch {
        return resolve({});
      }
    }
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  // Sous-chemin : d'abord via ?__path= (fourni par le rewrite vercel.json),
  // sinon en repli depuis l'URL brute.
  const q = (req.query && req.query.__path) || "";
  const raw = String(req.url || "").split("?")[0];
  const route = (q || raw).toLowerCase();

  try {
    if (req.method === "POST" && route.includes("chat")) {
      return json(res, 200, await engine.handleChat(await readBody(req)));
    }
    if (req.method === "POST" && route.includes("config")) {
      return json(res, 200, engine.setConfig(await readBody(req)));
    }
    if (req.method === "GET" && route.includes("leads")) {
      return json(res, 200, engine.getLeads());
    }
    if (req.method === "GET" && route.includes("health")) {
      return json(res, 200, engine.health());
    }
    if (req.method === "GET" && route.includes("diag")) {
      return json(res, 200, await engine.diagnose());
    }
    return json(res, 404, { error: "not_found", route });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};

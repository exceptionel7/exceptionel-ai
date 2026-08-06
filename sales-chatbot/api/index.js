/*
 * api/index.js — Fonction serverless Vercel (unique) du chatbot de vente.
 *
 * vercel.json route toutes les requêtes /api/* vers cette fonction, en passant
 * le sous-chemin dans le paramètre ?__path=... (ex : /api/chat → __path=chat).
 * On gère ici chat / config / leads / health, avec état partagé au sein d'une
 * même instance. La logique métier vit dans lib/engine.js.
 */

const engine = require("../lib/engine");
const identity = require("../lib/identity");

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
      const body = await readBody(req);
      body.__userId = identity.resolveUserId(req.headers, body);
      return json(res, 200, await engine.handleChat(body));
    }
    if (req.method === "POST" && route.includes("config")) {
      return json(res, 200, engine.setConfig(await readBody(req)));
    }
    if (req.method === "GET" && route.includes("leads")) {
      const userId = identity.resolveUserId(req.headers, req.query || {});
      return json(res, 200, await engine.getLeads(userId));
    }
    if (req.method === "GET" && route.includes("dbcheck")) {
      return json(res, 200, await engine.dbcheck());
    }
    if (req.method === "GET" && route.includes("catalog")) {
      return json(res, 200, engine.getCatalog());
    }
    if (req.method === "POST" && route.includes("catalog")) {
      return json(res, 200, await engine.refreshCatalog());
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

// Config au niveau de la fonction : laisse jusqu'à 60 s à la boucle de vente
// (plusieurs appels Claude à la suite) avant que Vercel ne coupe.
module.exports.config = { maxDuration: 60 };

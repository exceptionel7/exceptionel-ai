/*
 * api/[...path].js — Fonction serverless Vercel (attrape-tout) du chatbot.
 *
 * Vercel déploie tout fichier de /api comme une fonction serverless. Ce fichier
 * capture /api/chat, /api/config, /api/leads, /api/health dans UNE seule
 * fonction, afin de partager l'état en mémoire au sein d'une même instance.
 *
 * La logique métier vit dans lib/engine.js (partagée avec server.js).
 * La clé est lue depuis process.env.ANTHROPIC_API_KEY (variable d'environnement
 * définie dans le tableau de bord Vercel — jamais dans le code).
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

// Récupère le corps JSON, que Vercel l'ait déjà parsé (req.body) ou non.
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

  const urlPath = String(req.url || "").split("?")[0];

  try {
    if (req.method === "POST" && urlPath.endsWith("/chat")) {
      return json(res, 200, await engine.handleChat(await readBody(req)));
    }
    if (req.method === "POST" && urlPath.endsWith("/config")) {
      return json(res, 200, engine.setConfig(await readBody(req)));
    }
    if (req.method === "GET" && urlPath.endsWith("/leads")) {
      return json(res, 200, engine.getLeads());
    }
    if (req.method === "GET" && urlPath.endsWith("/health")) {
      return json(res, 200, engine.health());
    }
    return json(res, 404, { error: "not_found", path: urlPath });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};

/*
 * server.js — Serveur optionnel d'Exceptionel AI
 *
 * ZÉRO DÉPENDANCE : utilise uniquement les modules natifs de Node.js.
 * Lancer avec :  node server.js   (puis ouvrir http://localhost:3000)
 *
 * Deux rôles :
 *   1. Sert les fichiers statiques (index.html, css, js…).
 *   2. Expose /api/generate et /api/chat.
 *      - Si la variable d'environnement OPENAI_API_KEY est définie, il appelle
 *        la vraie API OpenAI (contenu généré par IA).
 *      - Sinon, il renvoie une erreur douce et le front bascule tout seul
 *        sur le moteur "démo" hors-ligne.
 *
 * Pour activer la vraie IA :
 *   export OPENAI_API_KEY="sk-..."
 *   node server.js
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// ---------- Appel OpenAI (natif https, pas de SDK) ----------
function callOpenAI(messages) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.8,
    });

    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + OPENAI_API_KEY,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.error) return reject(new Error(json.error.message));
            const text = json.choices?.[0]?.message?.content?.trim();
            resolve(text || "");
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ---------- Appel OpenAI Images (génération de visuels) ----------
function callOpenAIImage(prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
    });
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/images/generations",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + OPENAI_API_KEY,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.error) return reject(new Error(json.error.message));
            resolve(json.data?.[0]?.url || "");
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ---------- Prompts ----------
const TYPE_INSTRUCTIONS = {
  "product-description":
    "Rédige une description de produit e-commerce persuasive et concise (5-8 lignes), avec une accroche, des points forts, et un appel à l'action vers exceptionel.com.",
  "blog-article":
    "Rédige un court article de blog (avec titres en markdown) engageant et optimisé SEO, se terminant par un appel à l'action vers exceptionel.com.",
  "social-post":
    "Rédige un post court et accrocheur pour les réseaux sociaux, avec des emojis pertinents et 3-4 hashtags, orienté conversion.",
  "marketing-email":
    "Rédige un email marketing avec une ligne d'objet, une accroche, les bénéfices et un appel à l'action clair. Utilise {{prénom}} pour la personnalisation.",
};

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function sendJSON(res, code, obj) {
  const data = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(data);
}

// ---------- Serveur ----------
const server = http.createServer(async (req, res) => {
  // --- API ---
  if (req.method === "POST" && req.url === "/api/generate") {
    if (!OPENAI_API_KEY) return sendJSON(res, 501, { error: "no-api-key" });
    const { type, subject, tone, lang } = await readBody(req);
    const instruction =
      TYPE_INSTRUCTIONS[type] || TYPE_INSTRUCTIONS["product-description"];
    const language = lang === "en" ? "en anglais" : "en français";
    try {
      const text = await callOpenAI([
        {
          role: "system",
          content:
            "Tu es le rédacteur marketing de la boutique e-commerce exceptionel.com. Tu écris " +
            language +
            ", avec un ton " +
            (tone || "professionnel") +
            ".",
        },
        {
          role: "user",
          content: `${instruction}\n\nSujet / produit : ${subject || "un produit de la boutique"}.`,
        },
      ]);
      return sendJSON(res, 200, { text, source: "ia" });
    } catch (e) {
      return sendJSON(res, 502, { error: e.message });
    }
  }

  // Génération d'image (optionnel) — utilise l'API images d'OpenAI.
  if (req.method === "POST" && req.url === "/api/image") {
    if (!OPENAI_API_KEY) return sendJSON(res, 501, { error: "no-api-key" });
    const { prompt } = await readBody(req);
    try {
      const url = await callOpenAIImage(
        prompt || "Un visuel marketing élégant pour un produit e-commerce premium"
      );
      return sendJSON(res, 200, { url, source: "ia" });
    } catch (e) {
      return sendJSON(res, 502, { error: e.message });
    }
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    if (!OPENAI_API_KEY) return sendJSON(res, 501, { error: "no-api-key" });
    const { message, history } = await readBody(req);
    try {
      const msgs = [
        {
          role: "system",
          content:
            "Tu es l'assistant commercial de exceptionel.com. Sois chaleureux, concis, et pousse gentiment à l'achat. Réponds en français.",
        },
        ...(history || []).slice(-8),
        { role: "user", content: message },
      ];
      const text = await callOpenAI(msgs);
      return sendJSON(res, 200, { text, products: [], source: "ia" });
    } catch (e) {
      return sendJSON(res, 502, { error: e.message });
    }
  }

  // --- Fichiers statiques ---
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(ROOT, path.normalize(urlPath));

  // Sécurité : empêche de sortir du dossier racine
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 — Introuvable");
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log("\n  Exceptionel AI");
  console.log("  → http://localhost:" + PORT);
  console.log(
    "  → IA : " +
      (OPENAI_API_KEY
        ? "ACTIVÉE (OpenAI, modèle " + OPENAI_MODEL + ")"
        : "mode démo (aucune OPENAI_API_KEY détectée)")
  );
  console.log("");
});

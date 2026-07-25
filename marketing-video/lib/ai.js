/*
 * ai.js — Petit client Claude (texte) pour le module vidéo.
 *
 * Appel natif https à l'API Messages d'Anthropic (zéro dépendance). Sert à
 * générer le script vidéo en JSON structuré. Activé si ANTHROPIC_API_KEY est
 * défini ; sinon le générateur bascule sur son moteur hors-ligne.
 */

const https = require("https");

const API_HOST = "api.anthropic.com";
const API_PATH = "/v1/messages";
const API_VERSION = "2023-06-01";

function callMessages(apiKey, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: API_HOST,
        path: API_PATH,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 30000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.type === "error" || json.error) {
              return reject(new Error(json.error ? json.error.message : "anthropic error"));
            }
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Demande à Claude une réponse JSON et la parse.
 * @returns {Promise<object>}
 */
async function completeJSON({ apiKey, model, system, user, maxTokens }) {
  const resp = await callMessages(apiKey, {
    model: model || "claude-sonnet-5",
    max_tokens: maxTokens || 1024,
    system: system,
    messages: [{ role: "user", content: user }],
  });
  const text = (resp.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  // Extrait le premier bloc JSON de la réponse.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("réponse Claude sans JSON");
  return JSON.parse(match[0]);
}

module.exports = { completeJSON, callMessages };

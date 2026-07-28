/*
 * video-providers.js — Adaptateurs de génération vidéo.
 *
 * Interface commune : generateVideo({ provider, script, productImage, config })
 *   → { provider, status, jobId?, url?, mock?, raw? }
 *
 * Fournisseurs :
 *   - "heygen" : vidéos avatar/voix-off (nécessite HEYGEN_API_KEY)
 *   - "runway" : génération image→vidéo (nécessite RUNWAY_API_KEY)
 *   - "mock"   : repli sans clé — simule un rendu (pour la démo)
 *
 * Le rendu réel est ASYNCHRONE : ces adaptateurs lancent le job et renvoient un
 * jobId + statut. pollVideo() récupère le statut/URL final. En production, on
 * privilégie un webhook (voir ARCHITECTURE.md §6).
 */

const https = require("https");

// Requête HTTPS JSON générique.
function httpsJSON(options, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = Object.assign({ Accept: "application/json" }, options.headers || {});
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = https.request(
      { hostname: options.hostname, path: options.path, method: options.method || "GET", headers, timeout: options.timeout || 30000 },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = {};
          try { json = JSON.parse(data || "{}"); } catch (e) { json = { raw: data }; }
          if (res.statusCode >= 400) {
            var base = json.error || json.message || ("HTTP " + res.statusCode);
            var extra = json.errors || json.detail || json.details || json.issues;
            var detailStr = extra ? JSON.stringify(extra) : JSON.stringify(json);
            var msg = (typeof base === "string" ? base : JSON.stringify(base));
            if (detailStr && detailStr !== "{}" && detailStr.indexOf(String(base)) === -1) {
              msg += " — " + detailStr.slice(0, 400);
            }
            return reject(new Error(msg));
          }
          resolve(json);
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------- HeyGen ----------------
async function heygenGenerate(script, config) {
  // Doc: https://docs.heygen.com — POST /v2/video/generate (header X-Api-Key)
  const body = {
    video_inputs: [
      {
        character: { type: "avatar", avatar_id: config.heygenAvatarId || "default", avatar_style: "normal" },
        voice: { type: "text", input_text: script.voiceover, voice_id: config.heygenVoiceId || "fr-FR" },
      },
    ],
    dimension: { width: 720, height: 1280 }, // 9:16
  };
  const res = await httpsJSON(
    { hostname: "api.heygen.com", path: "/v2/video/generate", method: "POST", headers: { "X-Api-Key": config.heygenKey } },
    body
  );
  const jobId = (res.data && res.data.video_id) || res.video_id;
  return { provider: "heygen", status: "rendering", jobId, raw: res };
}

async function heygenStatus(jobId, config) {
  const res = await httpsJSON({
    hostname: "api.heygen.com",
    path: "/v1/video_status.get?video_id=" + encodeURIComponent(jobId),
    method: "GET",
    headers: { "X-Api-Key": config.heygenKey },
  });
  const d = res.data || {};
  const status = d.status === "completed" ? "ready" : d.status === "failed" ? "failed" : "rendering";
  return { provider: "heygen", status, jobId, url: d.video_url || null, raw: res };
}

// ---------------- Runway ----------------
// Construit un prompt visuel concis (Runway répond mieux aux descriptions de
// scène / mouvement / caméra qu'à un simple slogan).
function runwayPrompt(script) {
  var scene = (script.scenes && script.scenes[0] && script.scenes[0].visual) || "";
  var base = scene || ((script.hook || "") + " " + (script.body || []).join(" "));
  return String(base).replace(/\s+/g, " ").trim().slice(0, 480);
}

// Vérifie que l'URL pointe bien vers un FICHIER image (pas une page produit).
function isImageUrl(u) {
  return /^data:image\//i.test(u) || /^https?:\/\/\S+\.(jpg|jpeg|png|webp|gif)(\?\S*)?$/i.test(u);
}

async function runwayGenerate(script, productImage, config) {
  // Doc: https://docs.dev.runwayml.com — modèle gen4.5 (texte OU image → vidéo)
  const model = config.runwayModel || "gen4.5";
  const version = config.runwayVersion || "2024-11-06";
  const ratio = config.runwayRatio || "720:1280"; // vertical 9:16
  const duration = config.runwayDuration || 5;
  const headers = { Authorization: "Bearer " + config.runwayKey, "X-Runway-Version": version };

  const textBody = { model, promptText: runwayPrompt(script), ratio, duration };

  // Avec image valide : on tente image→vidéo, avec repli texte→vidéo si Runway
  // refuse l'image (CDN inaccessible, format non validé, etc.).
  if (productImage && isImageUrl(productImage)) {
    try {
      const res = await httpsJSON(
        { hostname: "api.dev.runwayml.com", path: "/v1/image_to_video", method: "POST", headers, timeout: 30000 },
        Object.assign({ promptImage: productImage }, textBody)
      );
      return { provider: "runway", status: "rendering", jobId: res.id, raw: res };
    } catch (e) {
      const res = await httpsJSON(
        { hostname: "api.dev.runwayml.com", path: "/v1/text_to_video", method: "POST", headers, timeout: 30000 },
        textBody
      );
      return {
        provider: "runway",
        status: "rendering",
        jobId: res.id,
        raw: res,
        warning: "Image refusée par Runway (repli texte→vidéo) : " + (e && e.message),
      };
    }
  }

  // Sans image : génération texte→vidéo (gen4.5).
  const res = await httpsJSON(
    { hostname: "api.dev.runwayml.com", path: "/v1/text_to_video", method: "POST", headers, timeout: 30000 },
    textBody
  );
  return { provider: "runway", status: "rendering", jobId: res.id, raw: res };
}

async function runwayStatus(jobId, config) {
  const version = config.runwayVersion || "2024-11-06";
  const res = await httpsJSON({
    hostname: "api.dev.runwayml.com",
    path: "/v1/tasks/" + encodeURIComponent(jobId),
    method: "GET",
    headers: { Authorization: "Bearer " + config.runwayKey, "X-Runway-Version": version },
  });
  const status = res.status === "SUCCEEDED" ? "ready" : res.status === "FAILED" ? "failed" : "rendering";
  const url = res.output && res.output[0];
  return { provider: "runway", status, jobId, url: url || null, raw: res };
}

// ---------------- Mock (repli démo) ----------------
function mockGenerate(script) {
  const slug = String(script.hook || "video").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30).replace(/^-+|-+$/g, "");
  return {
    provider: "mock",
    status: "ready",
    jobId: "mock_" + Date.now(),
    url: "https://cdn.exceptionel.ai/mock/" + (slug || "video") + ".mp4",
    mock: true,
    note: "Simulated video (demo mode). Add HEYGEN_API_KEY or RUNWAY_API_KEY for a real render.",
  };
}

// ---------------- Sélection & orchestration ----------------
function chooseProvider(config, requested) {
  if (requested && requested !== "auto") return requested;
  if (config.heygenKey) return "heygen";
  if (config.runwayKey) return "runway";
  return "mock";
}

async function generateVideo({ provider, script, productImage, config }) {
  config = config || {};
  const chosen = chooseProvider(config, provider);
  try {
    if (chosen === "heygen" && config.heygenKey) return await heygenGenerate(script, config);
    if (chosen === "runway" && config.runwayKey) return await runwayGenerate(script, productImage, config);
  } catch (e) {
    // Repli mock si l'appel réel échoue (clé/quota/réseau).
    const m = mockGenerate(script);
    m.warning = chosen + " unavailable: " + (e && e.message);
    return m;
  }
  return mockGenerate(script);
}

async function pollVideo({ provider, jobId, config }) {
  config = config || {};
  if (provider === "heygen" && config.heygenKey) return heygenStatus(jobId, config);
  if (provider === "runway" && config.runwayKey) return runwayStatus(jobId, config);
  return { provider: provider || "mock", status: "ready", jobId, url: "https://cdn.exceptionel.ai/mock/video.mp4", mock: true };
}

// ---------------- HeyGen : listes d'avatars / voix ----------------
// La liste publique /v2/avatars est ÉNORME (plusieurs Mo) et provoque un timeout.
// On lit donc seulement le début du flux, on en extrait quelques avatars par
// regex, puis on coupe la connexion — rapide et suffisant pour choisir un ID.
function listAvatars(config) {
  return new Promise((resolve, reject) => {
    var done = false;
    const req = https.request(
      {
        hostname: "api.heygen.com",
        path: "/v2/avatars",
        method: "GET",
        headers: { "X-Api-Key": config.heygenKey, Accept: "application/json" },
        timeout: 30000,
      },
      (res) => {
        if (res.statusCode >= 400) {
          res.destroy();
          if (!done) { done = true; reject(new Error("HTTP " + res.statusCode)); }
          return;
        }
        var buf = "";
        var finish = function () {
          if (done) return;
          done = true;
          try { req.destroy(); } catch (e) {}
          var ids = [];
          var names = [];
          var re = /"avatar_id"\s*:\s*"([^"]+)"/g;
          var nameRe = /"avatar_name"\s*:\s*"([^"]*)"/g;
          var m;
          while ((m = re.exec(buf)) && ids.length < 40) ids.push(m[1]);
          var n;
          while ((n = nameRe.exec(buf)) && names.length < 40) names.push(n[1]);
          var out = [];
          for (var i = 0; i < ids.length; i++) out.push({ avatar_id: ids[i], name: names[i] || "" });
          resolve(out.slice(0, 25));
        };
        res.on("data", function (c) {
          buf += c;
          if (buf.length > 400000) finish(); // ~400 Ko : largement assez d'avatars
        });
        res.on("end", finish);
        res.on("error", finish);
      }
    );
    req.on("timeout", function () { req.destroy(new Error("timeout")); });
    req.on("error", function (e) { if (!done) { done = true; reject(e); } });
    req.end();
  });
}

async function listVoices(config) {
  const res = await httpsJSON({
    hostname: "api.heygen.com", path: "/v2/voices", method: "GET",
    headers: { "X-Api-Key": config.heygenKey }, timeout: 20000,
  });
  const list = (res.data && (res.data.voices || res.data)) || res.voices || [];
  return list
    .filter((v) => !v.language || /fr|french|fran/i.test(String(v.language)))
    .slice(0, 25)
    .map((v) => ({ voice_id: v.voice_id || v.id, name: v.name || "", language: v.language || "" }));
}

module.exports = { generateVideo, pollVideo, chooseProvider, listAvatars, listVoices };

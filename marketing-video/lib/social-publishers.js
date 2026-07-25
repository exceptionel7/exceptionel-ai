/*
 * social-publishers.js — Publication automatique sur les réseaux sociaux.
 *
 * Interface commune : publish({ platform, video, caption, config })
 *   → { platform, status, external_post_id?, post_url?, mock?, error? }
 *
 * Plateformes : "instagram" (Reels), "facebook" (Page), "tiktok".
 * Chaque plateforme requiert un token OAuth du compte connecté (fourni via
 * config). Sans token → mode "mock" qui simule la publication (démo).
 *
 * ⚠️ En production, la publication nécessite l'approbation des plateformes
 * (Meta App Review, scopes TikTok) — voir ARCHITECTURE.md §6.4.
 */

const https = require("https");

function httpsJSON(options, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = Object.assign({ Accept: "application/json" }, options.headers || {});
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = https.request(
      { hostname: options.hostname, path: options.path, method: options.method || "GET", headers, timeout: 30000 },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = {};
          try { json = JSON.parse(data || "{}"); } catch (e) { json = { raw: data }; }
          if (res.statusCode >= 400) {
            const msg = (json.error && (json.error.message || json.error)) || ("HTTP " + res.statusCode);
            return reject(new Error(typeof msg === "string" ? msg : JSON.stringify(msg)));
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

const GRAPH = "graph.facebook.com";
const GRAPH_VER = "v21.0";

// ---------------- Instagram Reels (Meta Graph API) ----------------
async function publishInstagram(video, caption, config) {
  const igId = config.igUserId;
  const token = config.metaAccessToken;
  // 1) Créer le conteneur média (Reel)
  const container = await httpsJSON({
    hostname: GRAPH,
    path: `/${GRAPH_VER}/${igId}/media?media_type=REELS` +
      `&video_url=${encodeURIComponent(video.url)}` +
      `&caption=${encodeURIComponent(caption)}` +
      `&access_token=${encodeURIComponent(token)}`,
    method: "POST",
  });
  // 2) Publier le conteneur
  const published = await httpsJSON({
    hostname: GRAPH,
    path: `/${GRAPH_VER}/${igId}/media_publish` +
      `?creation_id=${encodeURIComponent(container.id)}` +
      `&access_token=${encodeURIComponent(token)}`,
    method: "POST",
  });
  return {
    platform: "instagram",
    status: "published",
    external_post_id: published.id,
    post_url: "https://www.instagram.com/reel/" + published.id,
  };
}

// ---------------- Facebook Page video ----------------
async function publishFacebook(video, caption, config) {
  const pageId = config.fbPageId;
  const token = config.metaAccessToken;
  const res = await httpsJSON({
    hostname: GRAPH,
    path: `/${GRAPH_VER}/${pageId}/videos` +
      `?file_url=${encodeURIComponent(video.url)}` +
      `&description=${encodeURIComponent(caption)}` +
      `&access_token=${encodeURIComponent(token)}`,
    method: "POST",
  });
  return {
    platform: "facebook",
    status: "published",
    external_post_id: res.id,
    post_url: "https://www.facebook.com/" + res.id,
  };
}

// ---------------- TikTok (Content Posting API) ----------------
async function publishTikTok(video, caption, config) {
  // Doc: https://developers.tiktok.com/doc/content-posting-api-reference
  const res = await httpsJSON(
    {
      hostname: "open.tiktokapis.com",
      path: "/v2/post/publish/video/init/",
      method: "POST",
      headers: { Authorization: "Bearer " + config.tiktokAccessToken },
    },
    {
      post_info: { title: caption, privacy_level: "SELF_ONLY" },
      source_info: { source: "PULL_FROM_URL", video_url: video.url },
    }
  );
  const id = res.data && res.data.publish_id;
  return {
    platform: "tiktok",
    status: "published",
    external_post_id: id,
    post_url: id ? "https://www.tiktok.com/@me/video/" + id : null,
  };
}

// ---------------- Mock (repli démo) ----------------
function mockPublish(platform, video) {
  const id = "mock_" + Math.random().toString(36).slice(2, 10);
  const urls = {
    instagram: "https://www.instagram.com/reel/" + id,
    facebook: "https://www.facebook.com/" + id,
    tiktok: "https://www.tiktok.com/@exceptionel/video/" + id,
  };
  return {
    platform,
    status: "published",
    external_post_id: id,
    post_url: urls[platform] || "https://exemple.com/" + id,
    mock: true,
    note: "Publication simulée (mode démo). Connectez le compte (OAuth) pour publier réellement.",
  };
}

// Un compte est-il réellement configuré pour cette plateforme ?
function hasCreds(platform, config) {
  if (platform === "instagram") return !!(config.metaAccessToken && config.igUserId);
  if (platform === "facebook") return !!(config.metaAccessToken && config.fbPageId);
  if (platform === "tiktok") return !!config.tiktokAccessToken;
  return false;
}

async function publish({ platform, video, caption, config }) {
  config = config || {};
  if (!video || !video.url) return { platform, status: "failed", error: "vidéo manquante" };
  try {
    if (hasCreds(platform, config)) {
      if (platform === "instagram") return await publishInstagram(video, caption, config);
      if (platform === "facebook") return await publishFacebook(video, caption, config);
      if (platform === "tiktok") return await publishTikTok(video, caption, config);
    }
  } catch (e) {
    return { platform, status: "failed", error: String((e && e.message) || e) };
  }
  return mockPublish(platform, video);
}

module.exports = { publish, hasCreds };

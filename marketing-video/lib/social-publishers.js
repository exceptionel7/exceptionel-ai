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
const tiktokOauth = require("./tiktok-oauth");

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

function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

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
  const creationId = container.id;

  // 2) Instagram encode la vidéo de façon asynchrone : on attend que le
  //    conteneur soit FINISHED avant de publier (sinon media_publish échoue).
  let ready = false;
  for (let i = 0; i < 6 && !ready; i++) {
    await delay(2500);
    const st = await httpsJSON({
      hostname: GRAPH,
      path: `/${GRAPH_VER}/${creationId}?fields=status_code` +
        `&access_token=${encodeURIComponent(token)}`,
      method: "GET",
    });
    if (st.status_code === "FINISHED") ready = true;
    else if (st.status_code === "ERROR" || st.status_code === "EXPIRED") {
      throw new Error("Instagram container " + st.status_code);
    }
  }
  if (!ready) {
    // Encodage encore en cours : on rend la main proprement (peut être republié).
    return {
      platform: "instagram",
      status: "processing",
      external_post_id: creationId,
      note: "Video still encoding on Instagram — publish can be retried with this creation id.",
    };
  }

  // 3) Publier le conteneur
  const published = await httpsJSON({
    hostname: GRAPH,
    path: `/${GRAPH_VER}/${igId}/media_publish` +
      `?creation_id=${encodeURIComponent(creationId)}` +
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

// Résout un access token TikTok valide : de préférence en le régénérant depuis
// le refresh token (les access tokens expirent en ~24h), sinon en utilisant le
// token statique fourni.
async function resolveTikTokToken(config) {
  if (config.tiktokRefreshToken && tiktokOauth.isConfigured()) {
    const t = await tiktokOauth.refresh(config.tiktokRefreshToken);
    if (t && t.access_token) return t.access_token;
  }
  return config.tiktokAccessToken;
}

// ---------------- TikTok (Content Posting API) ----------------
// Deux modes :
//  - "draft" (scope video.upload) : envoie la vidéo dans les brouillons TikTok
//    du créateur, qui finalise la publication dans l'app. Aucun audit strict.
//  - "direct" (scope video.publish) : publie directement (SELF_ONLY tant que
//    l'app n'est pas auditée, sinon PUBLIC_TO_EVERYONE).
async function publishTikTok(video, caption, config) {
  const token = await resolveTikTokToken(config);
  const mode = String(config.tiktokPostMode || "draft").toLowerCase();
  const direct = mode === "direct";
  const path = direct
    ? "/v2/post/publish/video/init/"
    : "/v2/post/publish/inbox/video/init/";
  const body = { source_info: { source: "PULL_FROM_URL", video_url: video.url } };
  if (direct) {
    body.post_info = { title: caption, privacy_level: config.tiktokPrivacy || "SELF_ONLY" };
  }
  const res = await httpsJSON(
    { hostname: "open.tiktokapis.com", path: path, method: "POST", headers: { Authorization: "Bearer " + token } },
    body
  );
  const id = res.data && res.data.publish_id;
  return {
    platform: "tiktok",
    status: direct ? "published" : "uploaded_to_drafts",
    external_post_id: id,
    post_url: direct && id ? "https://www.tiktok.com/@me/video/" + id : null,
    note: direct ? undefined : "Sent to your TikTok drafts — open the TikTok app to finish posting.",
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
    note: "Simulated publication (demo mode). Connect the account (OAuth) to publish for real.",
  };
}

// Un compte est-il réellement configuré pour cette plateforme ?
function hasCreds(platform, config) {
  if (platform === "instagram") return !!(config.metaAccessToken && config.igUserId);
  if (platform === "facebook") return !!(config.metaAccessToken && config.fbPageId);
  if (platform === "tiktok") return !!(config.tiktokAccessToken || (config.tiktokRefreshToken && tiktokOauth.isConfigured()));
  return false;
}

async function publish({ platform, video, caption, config }) {
  config = config || {};
  if (!video || !video.url) return { platform, status: "failed", error: "missing video" };
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

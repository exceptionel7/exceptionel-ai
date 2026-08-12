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

// Télécharge un fichier (suivi des redirections) dans un Buffer en mémoire.
function downloadBuffer(url, redirects) {
  redirects = redirects || 0;
  return new Promise(function (resolve, reject) {
    if (redirects > 5) return reject(new Error("too many redirects"));
    const u = new URL(url);
    https.get(
      { hostname: u.hostname, path: u.pathname + u.search, headers: { "User-Agent": "ExceptionelAI/1.0" }, timeout: 45000 },
      function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          return resolve(downloadBuffer(next, redirects + 1));
        }
        if (res.statusCode >= 400) { res.resume(); return reject(new Error("download HTTP " + res.statusCode)); }
        const chunks = [];
        res.on("data", function (c) { chunks.push(c); });
        res.on("end", function () { resolve(Buffer.concat(chunks)); });
      }
    ).on("error", reject);
  });
}

// Envoie les octets de la vidéo vers l'upload_url TikTok (push_by_file).
function putVideoChunk(uploadUrl, buffer) {
  return new Promise(function (resolve, reject) {
    const u = new URL(uploadUrl);
    const size = buffer.length;
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": size,
          "Content-Range": "bytes 0-" + (size - 1) + "/" + size,
        },
        timeout: 60000,
      },
      function (res) {
        let d = "";
        res.on("data", function (c) { d += c; });
        res.on("end", function () {
          if (res.statusCode >= 400) return reject(new Error("upload HTTP " + res.statusCode + " " + d.slice(0, 200)));
          resolve({ status: res.statusCode });
        });
      }
    );
    req.on("timeout", function () { req.destroy(new Error("upload timeout")); });
    req.on("error", reject);
    req.write(buffer);
    req.end();
  });
}

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
  const direct = String(config.tiktokPostMode || "draft").toLowerCase() === "direct";
  const initPath = direct
    ? "/v2/post/publish/video/init/"
    : "/v2/post/publish/inbox/video/init/";

  // On envoie le FICHIER (push_by_file) au lieu de PULL_FROM_URL : ça évite la
  // "verified domain" exigée par TikTok pour tirer une vidéo depuis une URL
  // (nos vidéos sont sur le CDN de Runway, domaine qu'on ne possède pas).
  const buffer = await downloadBuffer(video.url);
  const size = buffer.length;
  if (!size) throw new Error("downloaded video is empty");

  const body = {
    source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: size, total_chunk_count: 1 },
  };
  if (direct) {
    body.post_info = { title: caption, privacy_level: config.tiktokPrivacy || "SELF_ONLY" };
  }

  const init = await httpsJSON(
    { hostname: "open.tiktokapis.com", path: initPath, method: "POST", headers: { Authorization: "Bearer " + token } },
    body
  );
  const publishId = init.data && init.data.publish_id;
  const uploadUrl = init.data && init.data.upload_url;
  if (!uploadUrl) throw new Error("TikTok returned no upload_url: " + JSON.stringify(init).slice(0, 200));

  await putVideoChunk(uploadUrl, buffer);

  return {
    platform: "tiktok",
    status: direct ? "published" : "uploaded_to_drafts",
    external_post_id: publishId,
    post_url: direct && publishId ? "https://www.tiktok.com/@me/video/" + publishId : null,
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

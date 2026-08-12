/*
 * tiktok-oauth.js — TikTok OAuth v2 helper (zero dependency, native https).
 *
 * Provides the "Connect TikTok" flow so a merchant can authorize once and get
 * a long-lived refresh token (≈365 days). Access tokens expire after ~24h, so
 * the publisher mints a fresh one from the refresh token before each post.
 *
 * Config (env, on the video Vercel project):
 *   TIKTOK_CLIENT_KEY     from the TikTok app "Credentials"
 *   TIKTOK_CLIENT_SECRET  from the TikTok app "Credentials"
 *   TIKTOK_SCOPES         optional, default "video.publish"
 */

const https = require("https");

const AUTH_HOST = "www.tiktok.com";
const API_HOST = "open.tiktokapis.com";

function cfg() {
  return {
    clientKey: (process.env.TIKTOK_CLIENT_KEY || "").trim(),
    clientSecret: (process.env.TIKTOK_CLIENT_SECRET || "").trim(),
    // Doit correspondre aux scopes activés dans l'app TikTok. Par défaut le mode
    // "brouillon" (video.upload). Passe TIKTOK_SCOPES="user.info.basic,video.publish"
    // une fois l'app auditée pour la publication directe.
    scopes: (process.env.TIKTOK_SCOPES || "user.info.basic,video.upload").trim(),
  };
}

function isConfigured() {
  const c = cfg();
  return !!(c.clientKey && c.clientSecret);
}

// URL to send the user to, to authorize the app on their TikTok account.
function authorizeUrl(state, redirectUri) {
  const c = cfg();
  const params = new URLSearchParams({
    client_key: c.clientKey,
    scope: c.scopes,
    response_type: "code",
    redirect_uri: redirectUri,
    state: state || "exc",
  });
  return "https://" + AUTH_HOST + "/v2/auth/authorize/?" + params.toString();
}

function postForm(path, form) {
  return new Promise(function (resolve, reject) {
    const payload = new URLSearchParams(form).toString();
    const req = https.request(
      {
        hostname: API_HOST,
        path: path,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 15000,
      },
      function (res) {
        let data = "";
        res.on("data", function (c) { data += c; });
        res.on("end", function () {
          let j = {};
          try { j = JSON.parse(data || "{}"); } catch (e) { j = { raw: data }; }
          if (!j.access_token) {
            return reject(new Error(j.error_description || j.error || ("token request failed: " + (data || "").slice(0, 200))));
          }
          resolve(j);
        });
      }
    );
    req.on("timeout", function () { req.destroy(new Error("timeout")); });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// Exchange the authorization code for tokens (access_token + refresh_token).
function exchangeCode(code, redirectUri) {
  const c = cfg();
  return postForm("/v2/oauth/token/", {
    client_key: c.clientKey,
    client_secret: c.clientSecret,
    code: code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
}

// Mint a fresh access token from a long-lived refresh token.
function refresh(refreshToken) {
  const c = cfg();
  return postForm("/v2/oauth/token/", {
    client_key: c.clientKey,
    client_secret: c.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

module.exports = { authorizeUrl, exchangeCode, refresh, isConfigured, cfg };

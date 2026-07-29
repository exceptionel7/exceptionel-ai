/*
 * identity.js — Resolve the merchant user_id for a request (shared).
 *
 * Priority:
 *   1. A valid JWT in the Authorization header (issued by the auth module,
 *      signed with the same AUTH_JWT_SECRET) → payload.sub
 *   2. An explicit merchantId (public identifier, used by the embeddable widget)
 *   3. "demo" fallback (in-memory demo mode)
 */

const crypto = require("crypto");

function fromB64url(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64").toString("utf8");
}

function verifyJWT(token, secret) {
  try {
    const p = String(token).split(".");
    if (p.length !== 3) return null;
    const unsigned = p[0] + "." + p[1];
    const expected = crypto.createHmac("sha256", secret).update(unsigned).digest("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const a = Buffer.from(expected), b = Buffer.from(p[2]);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(fromB64url(p[1]));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function jwtSecret() {
  return process.env.AUTH_JWT_SECRET || "dev-insecure-secret-change-me";
}

// headers = req.headers ; extra = body or query object (may carry merchantId)
function resolveUserId(headers, extra) {
  const authHeader = (headers && (headers.authorization || headers.Authorization)) || "";
  const token = String(authHeader).replace(/^Bearer\s+/i, "").trim();
  const payload = token && verifyJWT(token, jwtSecret());
  if (payload && payload.sub) return String(payload.sub);
  const m = extra && (extra.merchantId || extra.merchant_id);
  return m ? String(m) : "demo";
}

module.exports = { verifyJWT, resolveUserId };

/*
 * crypto-auth.js — Authentification cryptographique (module crypto natif).
 *
 * - Hachage de mot de passe : scrypt + sel aléatoire (aucune dépendance).
 * - JWT : signés en HS256 (HMAC-SHA256), encodés en base64url.
 *
 * Format du hash stocké : "scrypt$<saltHex>$<hashHex>".
 */

const crypto = require("crypto");

// ---------------- Mots de passe ----------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return "scrypt$" + salt + "$" + hash;
}

function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const salt = parts[1];
    const expected = Buffer.from(parts[2], "hex");
    const actual = crypto.scryptSync(String(password), salt, 64);
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch (e) {
    return false;
  }
}

// ---------------- JWT (HS256) ----------------
function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function b64urlJSON(obj) {
  return b64url(JSON.stringify(obj));
}
function fromB64url(str) {
  str = String(str).replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64").toString("utf8");
}

function signJWT(payload, secret, expiresInSec) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = Object.assign({ iat: now, exp: now + (expiresInSec || 7 * 24 * 3600) }, payload);
  const unsigned = b64urlJSON(header) + "." + b64urlJSON(body);
  const sig = crypto.createHmac("sha256", secret).update(unsigned).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return unsigned + "." + sig;
}

function verifyJWT(token, secret) {
  try {
    const parts = String(token).split(".");
    if (parts.length !== 3) return null;
    const unsigned = parts[0] + "." + parts[1];
    const expected = crypto.createHmac("sha256", secret).update(unsigned).digest("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const a = Buffer.from(expected);
    const b = Buffer.from(parts[2]);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(fromB64url(parts[1]));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null; // expiré
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, signJWT, verifyJWT };

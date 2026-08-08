/*
 * webhook.js — Stripe webhook signature verification (native crypto).
 *
 * Stripe signs each webhook with the header:
 *   Stripe-Signature: t=<timestamp>,v1=<signature>[,v1=<other>]
 * The signature = HMAC-SHA256( "<t>.<rawBody>" , webhook_secret ).
 *
 * The RAW (unparsed) body MUST be used for verification to succeed.
 */

const crypto = require("crypto");

function parseSignatureHeader(header) {
  var out = { t: null, v1: [] };
  String(header || "").split(",").forEach(function (part) {
    var idx = part.indexOf("=");
    if (idx === -1) return;
    var key = part.slice(0, idx).trim();
    var val = part.slice(idx + 1).trim();
    if (key === "t") out.t = val;
    else if (key === "v1") out.v1.push(val);
  });
  return out;
}

function timingSafeEqualHex(a, b) {
  try {
    var ba = Buffer.from(a, "hex");
    var bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch (e) {
    return false;
  }
}

/**
 * Verifies the signature. @returns {boolean}
 * toleranceSec: rejects events that are too old (replay protection).
 */
function verifySignature(rawBody, sigHeader, secret, toleranceSec) {
  if (!secret || !sigHeader) return false;
  var parsed = parseSignatureHeader(sigHeader);
  if (!parsed.t || !parsed.v1.length) return false;

  var signedPayload = parsed.t + "." + (Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody);
  var expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  var match = parsed.v1.some(function (sig) { return timingSafeEqualHex(expected, sig); });
  if (!match) return false;

  if (toleranceSec) {
    var now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(parsed.t, 10)) > toleranceSec) return false;
  }
  return true;
}

module.exports = { verifySignature, parseSignatureHeader };

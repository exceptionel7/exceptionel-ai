/*
 * cj-catalog.js — Loads real products from CJ Dropshipping API.
 *
 * Uses the same API as the store (lib/cj.js in Andel-projects):
 *   CJ_EMAIL   + CJ_API_KEY → getAccessToken → searchProducts
 *
 * When configured (CJ_EMAIL + CJ_API_KEY), the chatbot's DEFAULT_CATALOG is
 * replaced with REAL products from CJ. Without these keys → demo catalog.
 *
 * The products are cached for 2 hours (they don't change often).
 */

const https = require("https");

const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

let accessToken = null;
let tokenExpiry = 0;

function cjConfigured() {
  return !!(process.env.CJ_EMAIL && process.env.CJ_API_KEY);
}

function httpsJSON(url, opts, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (payload) headers["Content-Length"] = Buffer.byteLength(payload);
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: opts.method || "GET", headers, timeout: 20000 },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  const data = await httpsJSON(CJ_BASE + "/authentication/getAccessToken", { method: "POST" }, {
    email: process.env.CJ_EMAIL,
    apiKey: process.env.CJ_API_KEY,
  });
  if (!data.result) throw new Error("CJ auth failed: " + (data.message || "unknown"));
  accessToken = data.data.accessToken;
  tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
  return accessToken;
}

async function searchCJ(params) {
  const token = await getToken();
  const qs = new URLSearchParams({ pageNum: 1, pageSize: 40, ...params }).toString();
  const data = await httpsJSON(CJ_BASE + "/product/list?" + qs, {
    method: "GET",
    headers: { "CJ-Access-Token": token },
  });
  if (!data.result) throw new Error("CJ search failed: " + (data.message || ""));
  return data.data;
}

// Normalize a CJ product to the chatbot format.
function normalize(p) {
  const price = parseFloat(p.sellPrice || p.productCost || 0);
  return {
    id: p.pid,
    name: p.productNameEn || p.productName || "Product",
    category: p.categoryName || "",
    price_cents: Math.round(price * 100),
    currency: "USD",
    tags: (p.productNameEn || "").toLowerCase().split(/\s+/).slice(0, 6),
    description: (p.description || p.productNameEn || "").slice(0, 200),
    image_url: p.productImage || "",
    url: "https://www.exceptionel.com/products/" + (p.pid || ""),
    stock: 99,
  };
}

// Cache
let cachedCatalog = null;
let cacheExpiry = 0;

/**
 * Loads up to ~40 popular products from CJ and normalizes them.
 * Cached for 2 hours.
 */
async function loadCatalog() {
  if (!cjConfigured()) return null;
  if (cachedCatalog && Date.now() < cacheExpiry) return cachedCatalog;
  try {
    const data = await searchCJ({ pageSize: 40 });
    const list = (data && data.list) || [];
    cachedCatalog = list.map(normalize).filter((p) => p.name && p.price_cents > 0);
    cacheExpiry = Date.now() + 2 * 60 * 60 * 1000; // 2h
    return cachedCatalog;
  } catch (e) {
    console.error("[Exceptionel][CJ] loadCatalog failed:", e.message);
    return null; // fallback to demo catalog
  }
}

module.exports = { loadCatalog, cjConfigured, searchCJ, normalize };

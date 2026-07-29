/*
 * db.js — Data access layer (shared).
 *
 * Production: serverless PostgreSQL via the PostgREST REST API (Supabase-
 * compatible), called over native https (zero dependency). Configured by:
 *   SUPABASE_URL          e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY  service_role key (server only)
 *
 * Demo (no config): IN-MEMORY storage, so everything works without a database.
 */

const https = require("https");

function cfg() {
  var url = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  url = url.replace(/\/rest\/v1$/i, "").replace(/\/rest$/i, "").replace(/\/+$/, "");
  return { url: url, key: (process.env.SUPABASE_SERVICE_KEY || "").trim() };
}
function isConfigured() {
  const c = cfg();
  return !!(c.url && c.key);
}

function request(method, path, body) {
  return new Promise(function (resolve, reject) {
    const c = cfg();
    const payload = body ? JSON.stringify(body) : null;
    const u = new URL(c.url + path);
    const headers = { apikey: c.key, Authorization: "Bearer " + c.key, Accept: "application/json" };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
      headers["Prefer"] = "return=representation";
    }
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: method, headers: headers, timeout: 15000 },
      function (res) {
        let data = "";
        res.on("data", function (c2) { data += c2; });
        res.on("end", function () {
          let json = null;
          try { json = data ? JSON.parse(data) : null; } catch (e) { json = { raw: data }; }
          if (res.statusCode >= 400) {
            const base = (json && (json.message || json.error || json.hint)) || ("HTTP " + res.statusCode);
            return reject(new Error((typeof base === "string" ? base : JSON.stringify(base)) + " [" + method + " " + u.hostname + u.pathname + "]"));
          }
          resolve(json);
        });
      }
    );
    req.on("timeout", function () { req.destroy(new Error("timeout")); });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function encodeFilters(filters) {
  const parts = [];
  Object.keys(filters || {}).forEach(function (k) {
    parts.push(encodeURIComponent(k) + "=eq." + encodeURIComponent(filters[k]));
  });
  return parts.length ? "?" + parts.join("&") : "";
}

// In-memory fallback (demo)
const mem = {};
function memTable(t) { mem[t] = mem[t] || []; return mem[t]; }
function uuid() { return "id_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9); }

async function insert(table, row) {
  if (isConfigured()) {
    const rows = await request("POST", "/rest/v1/" + table, [row]);
    return (rows && rows[0]) || row;
  }
  const r = Object.assign({ id: uuid(), created_at: new Date().toISOString() }, row);
  memTable(table).push(r);
  return r;
}

async function selectOne(table, filters) {
  if (isConfigured()) {
    const rows = await request("GET", "/rest/v1/" + table + encodeFilters(filters) + "&limit=1", null);
    return (rows && rows[0]) || null;
  }
  return memTable(table).find(function (r) {
    return Object.keys(filters).every(function (k) { return r[k] === filters[k]; });
  }) || null;
}

async function select(table, filters) {
  if (isConfigured()) {
    return await request("GET", "/rest/v1/" + table + encodeFilters(filters) + "&order=created_at.desc", null);
  }
  return memTable(table)
    .filter(function (r) { return Object.keys(filters || {}).every(function (k) { return r[k] === filters[k]; }); })
    .slice()
    .reverse();
}

module.exports = { insert, selectOne, select, isConfigured };

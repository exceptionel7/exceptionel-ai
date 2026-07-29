/*
 * app.js — Exceptionel AI Dashboard (vanilla SPA, zero dependency).
 *
 * Aggregates live data from the deployed modules (chatbot / video / payments).
 * When the merchant logs in (via the auth module), the dashboard sends the JWT
 * as `Authorization: Bearer <token>` to each module, which returns ONLY that
 * merchant's data (scoped by user_id). Without login, demo data is shown.
 *
 * Requirement: all modules must share the same AUTH_JWT_SECRET so they can
 * verify the token.
 */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var Store = {
    get: function (k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } },
    set: function (k, v) { localStorage.setItem(k, JSON.stringify(v)); },
    raw: function (k) { return localStorage.getItem(k); },
    setRaw: function (k, v) { localStorage.setItem(k, v); },
    del: function (k) { localStorage.removeItem(k); },
  };
  var settings = Store.get("exc_dash_settings", { chatbotApi: "", videoApi: "", paymentsApi: "", authApi: "" });
  var brand = Store.get("exc_dash_brand", {});
  var catalog = Store.get("exc_dash_catalog", []);

  function trimUrl(u) { return String(u || "").trim().replace(/\/+$/, ""); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function money(cents) {
    if (typeof cents !== "number") return "";
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
    catch (e) { return "$" + (cents / 100).toFixed(2); }
  }
  function token() { return Store.raw("exc_dash_token") || ""; }
  function authHeaders() { return token() ? { Authorization: "Bearer " + token() } : {}; }

  function fetchJSON(url, opts) {
    opts = opts || {};
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 12000);
    opts.headers = Object.assign({}, opts.headers || {}, authHeaders());
    return fetch(url, Object.assign({ signal: ctrl.signal }, opts))
      .then(function (r) { clearTimeout(t); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }

  // ---------- Navigation ----------
  function showView(name) {
    $$(".view").forEach(function (v) { v.classList.remove("active"); });
    var el = $("#view-" + name);
    if (el) el.classList.add("active");
    $$("#nav button").forEach(function (b) { b.classList.toggle("active", b.dataset.view === name); });
    if (name === "overview") loadOverview();
    if (name === "leads") loadLeads();
    if (name === "videos") loadVideos();
  }
  $$("#nav button").forEach(function (b) { b.addEventListener("click", function () { showView(b.dataset.view); }); });

  function setStatus(id, ok, text) {
    var el = $("#st-" + id);
    if (!el) return;
    el.className = "status " + (ok ? "on" : "off");
    el.textContent = text;
  }

  // ---------- Overview ----------
  function loadOverview() {
    var cb = trimUrl(settings.chatbotApi);
    var vd = trimUrl(settings.videoApi);
    var pay = trimUrl(settings.paymentsApi);

    if (cb) {
      fetchJSON(cb + "/api/health").then(function (h) {
        setStatus("chatbot", true, "● online");
        $("#info-chatbot").innerHTML =
          "<li>AI mode: <b>" + esc(h.mode) + "</b></li>" +
          "<li>Storage: " + esc(h.storage || "?") + "</li>" +
          "<li>Products: " + esc(h.catalog) + "</li>";
      }).catch(function () { setStatus("chatbot", false, "● unreachable"); $("#info-chatbot").innerHTML = "<li>Could not reach <code>" + esc(cb) + "</code></li>"; });
      fetchJSON(cb + "/api/leads").then(function (d) {
        var leads = d.leads || [];
        $("#kpi-leads").textContent = leads.length;
        $("#kpi-qual").textContent = leads.filter(function (l) { return l.status === "qualified"; }).length;
      }).catch(function () { $("#kpi-leads").textContent = "0"; $("#kpi-qual").textContent = "0"; });
    } else { setStatus("chatbot", false, "not configured"); $("#info-chatbot").innerHTML = "<li>URL not configured (see Settings)</li>"; }

    if (vd) {
      fetchJSON(vd + "/api/health").then(function (h) {
        setStatus("video", true, "● online");
        $("#info-video").innerHTML =
          "<li>Script AI: <b>" + esc(h.script_ai) + "</b></li>" +
          "<li>Video rendering: <b>" + esc(h.video_provider) + "</b></li>" +
          "<li>Storage: " + esc(h.storage || "?") + "</li>";
      }).catch(function () { setStatus("video", false, "● unreachable"); $("#info-video").innerHTML = "<li>Could not reach <code>" + esc(vd) + "</code></li>"; });
      fetchJSON(vd + "/api/videos").then(function (d) { $("#kpi-videos").textContent = (d.videos || []).length; })
        .catch(function () { $("#kpi-videos").textContent = "0"; });
    } else { setStatus("video", false, "not configured"); $("#info-video").innerHTML = "<li>URL not configured (see Settings)</li>"; }

    if (pay) {
      fetchJSON(pay + "/api/orders").then(function (d) { $("#kpi-orders").textContent = (d.orders || []).length; })
        .catch(function () { $("#kpi-orders").textContent = "0"; });
    } else { $("#kpi-orders").textContent = "–"; }
  }
  $("#refresh").addEventListener("click", loadOverview);

  // ---------- Leads ----------
  function loadLeads() {
    var cb = trimUrl(settings.chatbotApi);
    var box = $("#leads-body");
    if (!cb) { box.innerHTML = '<p class="empty">Set the chatbot URL in Settings.</p>'; return; }
    box.innerHTML = '<p class="empty">Loading…</p>';
    fetchJSON(cb + "/api/leads").then(function (d) {
      var leads = d.leads || [];
      if (!leads.length) { box.innerHTML = '<p class="empty">No leads yet.</p>'; return; }
      var rows = leads.map(function (l) {
        return "<tr><td>" + esc(l.email || "—") + "</td><td>" + esc((l.need || "").slice(0, 60) || "—") + "</td><td>" +
          (l.budget_cents ? money(l.budget_cents) : "—") + "</td><td>" + esc(l.score != null ? l.score : "—") +
          '</td><td><span class="pill ' + (l.status === "qualified" ? "qualified" : "new") + '">' + esc(l.status || "new") +
          "</span></td><td>" + esc((l.createdAt || l.created_at || "").slice(0, 10)) + "</td></tr>";
      }).join("");
      box.innerHTML = "<table><thead><tr><th>Email</th><th>Need</th><th>Budget</th><th>Score</th><th>Status</th><th>Date</th></tr></thead><tbody>" + rows + "</tbody></table>";
    }).catch(function (e) { box.innerHTML = '<p class="empty">Chatbot module unreachable (' + esc(e.message) + ").</p>"; });
  }
  $("#reload-leads").addEventListener("click", loadLeads);

  // ---------- Videos ----------
  function loadVideos() {
    var vd = trimUrl(settings.videoApi);
    var box = $("#videos-body");
    if (!vd) { box.innerHTML = '<p class="empty">Set the video module URL in Settings.</p>'; return; }
    box.innerHTML = '<p class="empty">Loading…</p>';
    fetchJSON(vd + "/api/videos").then(function (d) {
      var vids = d.videos || [];
      if (!vids.length) { box.innerHTML = '<p class="empty">No videos generated yet.</p>'; return; }
      box.innerHTML = '<div class="vgrid">' + vids.map(function (v) {
        var s = v.script || {};
        var pubs = (v.publications || []).map(function (p) { return '<span class="tag">' + esc(p.platform) + " · " + esc(p.status) + "</span>"; }).join("");
        return '<div class="vcard"><div class="k">' + esc((v.product && v.product.name) || "Product") + "</div>" +
          "<h4>" + esc(s.hook || "(script)") + "</h4><p>" + esc(s.cta || "") + "</p>" +
          "<p>🎬 " + esc((v.video && v.video.provider) || "?") + " · " + esc((v.video && v.video.status) || "?") + "</p>" +
          '<div class="tags">' + pubs + "</div></div>";
      }).join("") + "</div>";
    }).catch(function (e) { box.innerHTML = '<p class="empty">Video module unreachable (' + esc(e.message) + ").</p>"; });
  }
  $("#reload-videos").addEventListener("click", loadVideos);

  // ---------- Brand ----------
  function fillBrand() {
    $("#b-name").value = brand.brand_name || "";
    if (brand.tone) $("#b-tone").value = brand.tone;
    $("#b-audience").value = brand.target_audience || "";
    $("#b-values").value = (brand.value_props || []).join("\n");
  }
  $("#save-brand").addEventListener("click", function () {
    brand = {
      brand_name: $("#b-name").value.trim(), tone: $("#b-tone").value,
      target_audience: $("#b-audience").value.trim(),
      value_props: $("#b-values").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean),
    };
    Store.set("exc_dash_brand", brand);
    var m = $("#brand-msg"); m.className = "msg ok"; m.textContent = "Brand saved ✓";
  });

  // ---------- Catalog ----------
  var SAMPLE = [
    { id: "serenity-headphones", name: "Serenity Headphones", category: "Audio", price_cents: 19900, currency: "USD", tags: ["headphones", "audio", "wireless"], description: "Wireless headphones with active noise cancellation, 40h battery life.", url: "https://exceptionel.com/products/serenity-headphones" },
  ];
  function fillCatalog() { $("#cat-json").value = JSON.stringify(catalog && catalog.length ? catalog : SAMPLE, null, 2); }
  $("#load-sample").addEventListener("click", function () { $("#cat-json").value = JSON.stringify(SAMPLE, null, 2); });
  $("#save-cat").addEventListener("click", function () {
    var m = $("#cat-msg");
    try {
      var parsed = JSON.parse($("#cat-json").value);
      if (!Array.isArray(parsed)) throw new Error("The catalog must be a JSON array.");
      catalog = parsed; Store.set("exc_dash_catalog", catalog);
      m.className = "msg ok"; m.textContent = catalog.length + " product(s) saved ✓";
    } catch (e) { m.className = "msg err"; m.textContent = "Invalid JSON: " + e.message; }
  });
  $("#push-cat").addEventListener("click", function () {
    var cb = trimUrl(settings.chatbotApi); var m = $("#cat-msg");
    if (!cb) { m.className = "msg err"; m.textContent = "Set the chatbot URL first (Settings)."; return; }
    var parsed; try { parsed = JSON.parse($("#cat-json").value); } catch (e) { m.className = "msg err"; m.textContent = "Invalid JSON."; return; }
    m.className = "msg"; m.textContent = "Sending…";
    fetchJSON(cb + "/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "dashboard-demo", catalog: parsed, brand: brand }) })
      .then(function (r) { m.className = "msg ok"; m.textContent = "Catalog loaded into the chatbot (" + (r.products || 0) + " products) ✓"; })
      .catch(function (e) { m.className = "msg err"; m.textContent = "Failed: " + e.message; });
  });

  // ---------- Account (login via auth module) ----------
  function setAccountState() {
    var email = Store.raw("exc_dash_email");
    var el = $("#acct-state");
    if (el) el.textContent = token() && email ? ("Signed in as " + email) : "Not signed in";
  }
  $("#login-btn").addEventListener("click", function () {
    var authApi = trimUrl($("#s-auth").value);
    var m = $("#login-msg");
    if (!authApi) { m.className = "msg err"; m.textContent = "Enter the Auth module URL first."; return; }
    settings.authApi = authApi; Store.set("exc_dash_settings", settings);
    m.className = "msg"; m.textContent = "Signing in…";
    fetch(authApi + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: $("#s-email").value.trim(), password: $("#s-password").value }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) { m.className = "msg err"; m.textContent = res.d.error || "Login failed"; return; }
        Store.setRaw("exc_dash_token", res.d.token);
        Store.setRaw("exc_dash_email", (res.d.user && res.d.user.email) || "");
        m.className = "msg ok"; m.textContent = "Signed in ✓ — your account's data will now be shown.";
        setAccountState(); loadOverview();
      }).catch(function (e) { m.className = "msg err"; m.textContent = e.message; });
  });
  $("#logout-btn").addEventListener("click", function () {
    Store.del("exc_dash_token"); Store.del("exc_dash_email");
    setAccountState();
    var m = $("#login-msg"); m.className = "msg"; m.textContent = "Logged out.";
    loadOverview();
  });

  // ---------- Settings ----------
  function fillSettings() {
    $("#s-chatbot").value = settings.chatbotApi || "";
    $("#s-video").value = settings.videoApi || "";
    $("#s-payments").value = settings.paymentsApi || "";
    $("#s-auth").value = settings.authApi || "";
  }
  $("#save-settings").addEventListener("click", function () {
    settings.chatbotApi = trimUrl($("#s-chatbot").value);
    settings.videoApi = trimUrl($("#s-video").value);
    settings.paymentsApi = trimUrl($("#s-payments").value);
    settings.authApi = trimUrl($("#s-auth").value);
    Store.set("exc_dash_settings", settings);
    var m = $("#settings-msg"); m.className = "msg"; m.textContent = "Saved. Testing modules…";
    var results = []; var checks = [];
    if (settings.chatbotApi) checks.push(fetch(settings.chatbotApi + "/api/health").then(function (r) { results.push(r.ok ? "Chatbot ✓" : "Chatbot ✗"); }).catch(function () { results.push("Chatbot ✗"); }));
    if (settings.videoApi) checks.push(fetch(settings.videoApi + "/api/health").then(function (r) { results.push(r.ok ? "Video ✓" : "Video ✗"); }).catch(function () { results.push("Video ✗"); }));
    if (settings.paymentsApi) checks.push(fetch(settings.paymentsApi + "/api/health").then(function (r) { results.push(r.ok ? "Payments ✓" : "Payments ✗"); }).catch(function () { results.push("Payments ✗"); }));
    Promise.all(checks).then(function () {
      m.className = "msg ok"; m.textContent = "Saved. " + (results.join(" · ") || "No URL provided.");
      loadOverview();
    });
  });

  // ---------- Init ----------
  fillSettings(); fillBrand(); fillCatalog(); setAccountState();
  loadOverview();
})();

/*
 * app.js — Dashboard Exceptionel AI (SPA vanilla, zéro dépendance).
 *
 * Agrège en direct les données des modules déployés (chatbot + vidéo) via leurs
 * APIs (CORS ouvert). Toute la config locale (URLs, marque, catalogue) est
 * stockée dans le navigateur (localStorage). En production, ces données seront
 * servies par le backend + PostgreSQL (voir ../ARCHITECTURE.md).
 */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  // ---------- Stockage local ----------
  var Store = {
    get: function (k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } },
    set: function (k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  };
  var settings = Store.get("exc_dash_settings", { chatbotApi: "", videoApi: "" });
  var brand = Store.get("exc_dash_brand", {});
  var catalog = Store.get("exc_dash_catalog", []);

  function trimUrl(u) { return String(u || "").trim().replace(/\/+$/, ""); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function euro(cents) {
    if (typeof cents !== "number") return "";
    try { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100); }
    catch (e) { return (cents / 100).toFixed(2) + " €"; }
  }

  function fetchJSON(url, opts) {
    opts = opts || {};
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 12000);
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
  $$("#nav button").forEach(function (b) {
    b.addEventListener("click", function () { showView(b.dataset.view); });
  });

  // ---------- Vue d'ensemble ----------
  function setStatus(id, ok, text) {
    var el = $("#st-" + id);
    el.className = "status " + (ok ? "on" : "off");
    el.textContent = text;
  }

  function loadOverview() {
    var cb = trimUrl(settings.chatbotApi);
    var vd = trimUrl(settings.videoApi);

    // Chatbot
    if (cb) {
      fetchJSON(cb + "/api/health").then(function (h) {
        setStatus("chatbot", true, "● en ligne");
        $("#info-chatbot").innerHTML =
          "<li>Mode IA : <b>" + esc(h.mode) + "</b></li>" +
          "<li>Produits : " + esc(h.catalog) + "</li>" +
          "<li>Sessions : " + esc(h.sessions) + " · Leads : " + esc(h.leads) + "</li>";
      }).catch(function () {
        setStatus("chatbot", false, "● injoignable");
        $("#info-chatbot").innerHTML = "<li>Impossible de contacter <code>" + esc(cb) + "</code></li>";
      });
    } else {
      setStatus("chatbot", false, "non configuré");
      $("#info-chatbot").innerHTML = "<li>URL non configurée (voir Réglages)</li>";
    }

    // Vidéo
    if (vd) {
      fetchJSON(vd + "/api/health").then(function (h) {
        setStatus("video", true, "● en ligne");
        $("#info-video").innerHTML =
          "<li>Script IA : <b>" + esc(h.script_ai) + "</b></li>" +
          "<li>Rendu vidéo : <b>" + esc(h.video_provider) + "</b></li>" +
          "<li>Réseaux : IG " + (h.social.instagram ? "✅" : "—") + " · FB " + (h.social.facebook ? "✅" : "—") + " · TikTok " + (h.social.tiktok ? "✅" : "—") + "</li>";
      }).catch(function () {
        setStatus("video", false, "● injoignable");
        $("#info-video").innerHTML = "<li>Impossible de contacter <code>" + esc(vd) + "</code></li>";
      });
    } else {
      setStatus("video", false, "non configuré");
      $("#info-video").innerHTML = "<li>URL non configurée (voir Réglages)</li>";
    }

    // KPIs
    if (cb) {
      fetchJSON(cb + "/api/leads").then(function (d) {
        var leads = d.leads || [];
        $("#kpi-leads").textContent = leads.length;
        $("#kpi-qual").textContent = leads.filter(function (l) { return l.status === "qualified"; }).length;
      }).catch(function () { $("#kpi-leads").textContent = "0"; $("#kpi-qual").textContent = "0"; });
    }
    if (vd) {
      fetchJSON(vd + "/api/videos").then(function (d) {
        var vids = d.videos || [];
        $("#kpi-videos").textContent = vids.length;
        var pubs = 0;
        vids.forEach(function (v) { pubs += (v.publications || []).filter(function (p) { return p.status === "published"; }).length; });
        $("#kpi-pubs").textContent = pubs;
      }).catch(function () { $("#kpi-videos").textContent = "0"; $("#kpi-pubs").textContent = "0"; });
    }
  }
  $("#refresh").addEventListener("click", loadOverview);

  // ---------- Prospects ----------
  function loadLeads() {
    var cb = trimUrl(settings.chatbotApi);
    var box = $("#leads-body");
    if (!cb) { box.innerHTML = '<p class="empty">Configure l\'URL du chatbot dans Réglages.</p>'; return; }
    box.innerHTML = '<p class="empty">Chargement…</p>';
    fetchJSON(cb + "/api/leads").then(function (d) {
      var leads = d.leads || [];
      if (!leads.length) { box.innerHTML = '<p class="empty">Aucun prospect pour l\'instant. Discute avec le chatbot pour en générer.</p>'; return; }
      var rows = leads.map(function (l) {
        return "<tr>" +
          "<td>" + esc(l.email || "—") + "</td>" +
          "<td>" + esc((l.need || "").slice(0, 60) || "—") + "</td>" +
          "<td>" + (l.budget_cents ? euro(l.budget_cents) : "—") + "</td>" +
          "<td>" + esc(l.score != null ? l.score : "—") + "</td>" +
          '<td><span class="pill ' + (l.status === "qualified" ? "qualified" : "new") + '">' + esc(l.status || "new") + "</span></td>" +
          "<td>" + esc((l.createdAt || "").slice(0, 10)) + "</td>" +
          "</tr>";
      }).join("");
      box.innerHTML =
        "<table><thead><tr><th>Email</th><th>Besoin</th><th>Budget</th><th>Score</th><th>Statut</th><th>Date</th></tr></thead><tbody>" +
        rows + "</tbody></table>";
    }).catch(function (e) {
      box.innerHTML = '<p class="empty">Module chatbot injoignable (' + esc(e.message) + ").</p>";
    });
  }
  $("#reload-leads").addEventListener("click", loadLeads);

  // ---------- Vidéos ----------
  function loadVideos() {
    var vd = trimUrl(settings.videoApi);
    var box = $("#videos-body");
    if (!vd) { box.innerHTML = '<p class="empty">Configure l\'URL du module vidéo dans Réglages.</p>'; return; }
    box.innerHTML = '<p class="empty">Chargement…</p>';
    fetchJSON(vd + "/api/videos").then(function (d) {
      var vids = d.videos || [];
      if (!vids.length) { box.innerHTML = '<p class="empty">Aucune vidéo générée. Utilise le module vidéo pour en créer.</p>'; return; }
      box.innerHTML = '<div class="vgrid">' + vids.map(function (v) {
        var s = v.script || {};
        var pubs = (v.publications || []).map(function (p) {
          return '<span class="tag">' + esc(p.platform) + " · " + esc(p.status) + (p.mock ? " (mock)" : "") + "</span>";
        }).join("");
        return '<div class="vcard">' +
          '<div class="k">' + esc((v.product && v.product.name) || "Produit") + "</div>" +
          "<h4>" + esc(s.hook || "(script)") + "</h4>" +
          "<p>" + esc((s.cta || "")) + "</p>" +
          "<p>🎬 " + esc((v.video && v.video.provider) || "?") + " · " + esc((v.video && v.video.status) || "?") + "</p>" +
          '<div class="tags">' + pubs + "</div>" +
          "</div>";
      }).join("") + "</div>";
    }).catch(function (e) {
      box.innerHTML = '<p class="empty">Module vidéo injoignable (' + esc(e.message) + ").</p>";
    });
  }
  $("#reload-videos").addEventListener("click", loadVideos);

  // ---------- Marque ----------
  function fillBrand() {
    $("#b-name").value = brand.brand_name || "";
    if (brand.tone) $("#b-tone").value = brand.tone;
    $("#b-audience").value = brand.target_audience || "";
    $("#b-values").value = (brand.value_props || []).join("\n");
  }
  $("#save-brand").addEventListener("click", function () {
    brand = {
      brand_name: $("#b-name").value.trim(),
      tone: $("#b-tone").value,
      target_audience: $("#b-audience").value.trim(),
      value_props: $("#b-values").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean),
    };
    Store.set("exc_dash_brand", brand);
    var m = $("#brand-msg"); m.className = "msg ok"; m.textContent = "Marque enregistrée ✓";
  });

  // ---------- Catalogue ----------
  var SAMPLE = [
    { id: "casque-serenity", name: "Casque Serenity", category: "Audio", price_cents: 19900, currency: "EUR", tags: ["casque", "audio", "sans fil"], description: "Casque sans fil à réduction de bruit active, 40h d'autonomie.", url: "https://exceptionel.com/produits/casque-serenity" },
  ];
  function fillCatalog() { $("#cat-json").value = JSON.stringify(catalog && catalog.length ? catalog : SAMPLE, null, 2); }
  $("#load-sample").addEventListener("click", function () { $("#cat-json").value = JSON.stringify(SAMPLE, null, 2); });
  $("#save-cat").addEventListener("click", function () {
    var m = $("#cat-msg");
    try {
      var parsed = JSON.parse($("#cat-json").value);
      if (!Array.isArray(parsed)) throw new Error("Le catalogue doit être un tableau JSON.");
      catalog = parsed; Store.set("exc_dash_catalog", catalog);
      m.className = "msg ok"; m.textContent = catalog.length + " produit(s) enregistré(s) ✓";
    } catch (e) { m.className = "msg err"; m.textContent = "JSON invalide : " + e.message; }
  });
  $("#push-cat").addEventListener("click", function () {
    var cb = trimUrl(settings.chatbotApi);
    var m = $("#cat-msg");
    if (!cb) { m.className = "msg err"; m.textContent = "Configure d'abord l'URL du chatbot (Réglages)."; return; }
    var parsed;
    try { parsed = JSON.parse($("#cat-json").value); } catch (e) { m.className = "msg err"; m.textContent = "JSON invalide."; return; }
    m.className = "msg"; m.textContent = "Envoi…";
    fetchJSON(cb + "/api/config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "dashboard-demo", catalog: parsed, brand: brand }),
    }).then(function (r) {
      m.className = "msg ok"; m.textContent = "Catalogue chargé dans le chatbot (" + (r.products || 0) + " produits, session démo) ✓";
    }).catch(function (e) { m.className = "msg err"; m.textContent = "Échec : " + e.message; });
  });

  // ---------- Réglages ----------
  function fillSettings() {
    $("#s-chatbot").value = settings.chatbotApi || "";
    $("#s-video").value = settings.videoApi || "";
  }
  $("#save-settings").addEventListener("click", function () {
    settings = { chatbotApi: trimUrl($("#s-chatbot").value), videoApi: trimUrl($("#s-video").value) };
    Store.set("exc_dash_settings", settings);
    var m = $("#settings-msg"); m.className = "msg"; m.textContent = "Enregistré. Test des modules…";
    var results = [];
    var checks = [];
    if (settings.chatbotApi) checks.push(fetchJSON(settings.chatbotApi + "/api/health").then(function () { results.push("Chatbot ✓"); }).catch(function () { results.push("Chatbot ✗"); }));
    if (settings.videoApi) checks.push(fetchJSON(settings.videoApi + "/api/health").then(function () { results.push("Vidéo ✓"); }).catch(function () { results.push("Vidéo ✗"); }));
    Promise.all(checks).then(function () {
      var ok = results.every(function (r) { return r.indexOf("✓") > -1; });
      m.className = "msg " + (ok ? "ok" : "err");
      m.textContent = "Enregistré. " + (results.join(" · ") || "Aucune URL renseignée.");
      loadOverview();
    });
  });

  // ---------- Init ----------
  fillSettings(); fillBrand(); fillCatalog();
  loadOverview();
})();

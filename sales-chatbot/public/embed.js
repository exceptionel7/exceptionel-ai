/*
 * embed.js — Widget de chat de vente Exceptionel AI (embarquable).
 *
 * À COLLER sur n'importe quel site, en une ligne :
 *   <script src="https://cdn.exceptionel.ai/embed.js"
 *           data-key="VOTRE_CLE_PUBLIQUE"
 *           data-api="https://api.exceptionel.ai"></script>
 *
 * - Zéro dépendance, vanilla JS.
 * - Styles isolés dans un Shadow DOM (aucun conflit avec le CSS du site hôte).
 * - Dialogue avec POST {api}/api/chat, affiche recommandations produits + CTA
 *   de paiement, et laisse le backend qualifier le lead.
 */
(function () {
  "use strict";

  // ---------------- Configuration (lue sur la balise <script>) ----------------
  var script =
    document.currentScript ||
    document.querySelector('script[src*="embed.js"]');
  var cfg = {
    api: (script && script.getAttribute("data-api")) || window.location.origin,
    key: (script && script.getAttribute("data-key")) || "demo",
    title: (script && script.getAttribute("data-title")) || "Sales Assistant",
    accent: (script && script.getAttribute("data-accent")) || "#7c5cff",
  };

  // Identifiant de session persistant par visiteur
  var sessionId = localStorage.getItem("exc_chat_session");
  if (!sessionId) {
    sessionId = "s_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    localStorage.setItem("exc_chat_session", sessionId);
  }

  // ---------------- Styles (dans le Shadow DOM) ----------------
  var CSS =
    "" +
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}" +
    ".launcher{position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;background:" +
    cfg.accent +
    ";color:#fff;font-size:26px;box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:2147483000;transition:transform .15s}" +
    ".launcher:hover{transform:scale(1.06)}" +
    ".panel{position:fixed;right:20px;bottom:92px;width:360px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 120px);background:#fff;color:#1a1d24;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden;z-index:2147483000}" +
    ".hidden{display:none}" +
    ".hd{padding:16px;background:" +
    cfg.accent +
    ";color:#fff}" +
    ".hd strong{font-size:15px}.hd small{display:block;opacity:.85;font-size:12px;margin-top:2px}" +
    ".hd .x{float:right;background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1}" +
    ".msgs{flex:1;overflow-y:auto;padding:14px;background:#f6f7f9;display:flex;flex-direction:column;gap:10px}" +
    ".m{max-width:85%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-break:break-word}" +
    ".m.bot{align-self:flex-start;background:#fff;border:1px solid #e6e8ec;border-bottom-left-radius:4px}" +
    ".m.me{align-self:flex-end;background:" +
    cfg.accent +
    ";color:#fff;border-bottom-right-radius:4px}" +
    ".m.typing{color:#8a92a1;font-style:italic}" +
    ".cards{display:flex;flex-direction:column;gap:8px;align-self:flex-start;max-width:92%}" +
    ".card{background:#fff;border:1px solid #e6e8ec;border-radius:12px;padding:10px 12px;font-size:13px}" +
    ".card b{display:block;font-size:14px}.card .p{color:" +
    cfg.accent +
    ";font-weight:700;margin:4px 0}" +
    ".card a{display:inline-block;margin-top:4px;color:" +
    cfg.accent +
    ";text-decoration:none;font-weight:600}" +
    ".cta{display:block;text-align:center;margin:4px 0;padding:11px;border-radius:10px;background:" +
    cfg.accent +
    ";color:#fff;text-decoration:none;font-weight:700;font-size:14px}" +
    ".ft{display:flex;gap:8px;padding:12px;border-top:1px solid #e6e8ec;background:#fff}" +
    ".ft input{flex:1;border:1px solid #d7dbe2;border-radius:10px;padding:10px 12px;font-size:14px}" +
    ".ft input:focus{outline:none;border-color:" +
    cfg.accent +
    "}" +
    ".ft button{border:none;background:" +
    cfg.accent +
    ";color:#fff;border-radius:10px;padding:0 16px;cursor:pointer;font-weight:600}" +
    ".pw{text-align:center;font-size:10px;color:#aeb4bf;padding:6px}";

  // ---------------- Construction du DOM (Shadow) ----------------
  var host = document.createElement("div");
  host.id = "exceptionel-ai-widget";
  document.body.appendChild(host);
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  var style = document.createElement("style");
  style.textContent = CSS;
  root.appendChild(style);

  var launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.textContent = "💬";
  root.appendChild(launcher);

  var panel = document.createElement("div");
  panel.className = "panel hidden";
  panel.innerHTML =
    '<div class="hd"><button class="x">×</button><strong>' +
    esc(cfg.title) +
    "</strong><small>Online • replies in seconds</small></div>" +
    '<div class="msgs"></div>' +
    '<form class="ft"><input type="text" placeholder="Type your message…" autocomplete="off"/><button type="submit">➤</button></form>' +
    '<div class="pw">Powered by Exceptionel AI</div>';
  root.appendChild(panel);

  var msgsEl = panel.querySelector(".msgs");
  var form = panel.querySelector(".ft");
  var input = panel.querySelector("input");
  var greeted = false;

  // ---------------- Utilitaires ----------------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function scroll() {
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  function addMsg(text, who) {
    var d = document.createElement("div");
    d.className = "m " + (who === "me" ? "me" : "bot");
    d.textContent = text;
    msgsEl.appendChild(d);
    scroll();
    return d;
  }
  function addProducts(products, actions) {
    if ((!products || !products.length) && (!actions || !actions.length)) return;
    var wrap = document.createElement("div");
    wrap.className = "cards";
    (products || []).forEach(function (p) {
      var c = document.createElement("div");
      c.className = "card";
      c.innerHTML =
        "<b>" + esc(p.name) + "</b>" +
        '<div class="p">' + esc(p.price) + "</div>" +
        "<div>" + esc((p.description || "").slice(0, 120)) + "</div>" +
        (p.url && p.url !== "#" ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">View product →</a>' : "");
      wrap.appendChild(c);
    });
    (actions || []).forEach(function (a) {
      if (a.type === "checkout") {
        var link = document.createElement("a");
        link.className = "cta";
        link.href = a.url;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = a.label || "Complete purchase →";
        wrap.appendChild(link);
      }
    });
    msgsEl.appendChild(wrap);
    scroll();
  }

  // ---------------- Communication backend ----------------
  function send(message) {
    addMsg(message, "me");
    var typing = addMsg("…", "bot");
    typing.classList.add("typing");
    fetch(cfg.api.replace(/\/$/, "") + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Public-Key": cfg.key },
      body: JSON.stringify({ sessionId: sessionId, message: message }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        typing.remove();
        addMsg(data.reply || "…", "bot");
        addProducts(data.products, data.actions);
      })
      .catch(function () {
        typing.remove();
        addMsg("Sorry, something went wrong. Please try again.", "bot");
      });
  }

  // ---------------- Interactions ----------------
  function open() {
    panel.classList.remove("hidden");
    if (!greeted) {
      greeted = true;
      addMsg(
        "Hi! 👋 I'm your advisor. Tell me what you're looking for and I'll find the perfect product for you.",
        "bot"
      );
    }
    input.focus();
  }
  function close() {
    panel.classList.add("hidden");
  }
  launcher.addEventListener("click", function () {
    panel.classList.contains("hidden") ? open() : close();
  });
  panel.querySelector(".x").addEventListener("click", close);
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = input.value.trim();
    if (!v) return;
    input.value = "";
    send(v);
  });
})();

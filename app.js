/*
 * app.js — Logique d'interface d'Exceptionel AI.
 * Navigation, i18n, générateur de contenu, visuels, calendrier, catalogue live
 * et chatbot. S'appuie sur ExceptionelAPI, ExceptionelAI, VisualGenerator,
 * PublishCalendar, CatalogConnector, I18N et ProductStore.
 */

(function () {
  const API = window.ExceptionelAPI;
  const AI = window.ExceptionelAI;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2200);
  }

  // ---------- Navigation ----------
  function showView(name) {
    $$(".view").forEach((v) => v.classList.remove("active"));
    const view = $("#view-" + name);
    if (view) view.classList.add("active");
    $$(".nav-link").forEach((l) =>
      l.classList.toggle("active", l.dataset.view === name)
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $$("[data-view]").forEach((el) =>
    el.addEventListener("click", () => showView(el.dataset.view))
  );

  // ---------- Langue ----------
  function syncLangButtons() {
    const lang = window.I18N.getLang();
    $$(".lang-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.lang === lang)
    );
  }
  $$(".lang-btn").forEach((b) =>
    b.addEventListener("click", () => window.I18N.setLang(b.dataset.lang))
  );

  // ---------- Rendu dépendant du catalogue ----------
  function renderProductInputs() {
    const list = AI.products;
    // stat
    $("#stat-products").textContent = list.length;
    // datalist du générateur
    const datalist = $("#product-list");
    datalist.innerHTML = "";
    list.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.name;
      datalist.appendChild(opt);
    });
    // select des visuels
    const vsel = $("#visual-product");
    vsel.innerHTML = "";
    list.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      vsel.appendChild(opt);
    });
  }

  function renderProductGrid() {
    const grid = $("#product-grid");
    grid.innerHTML = "";
    AI.products.forEach((p) => {
      const el = document.createElement("article");
      el.className = "product";
      const buyLabel = window.I18N.t("products.buy");
      el.innerHTML = `
        <span class="cat">${escapeHtml(p.category || "")}</span>
        <h3>${escapeHtml(p.name)}</h3>
        <p class="pitch">${escapeHtml(p.shortPitch || "")}</p>
        <div class="price">${AI.formatPrice(p)}</div>
        <a href="${p.url}" target="_blank" rel="noopener">${buyLabel}</a>
      `;
      grid.appendChild(el);
    });
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"]/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    }[c]));
  }

  // ---------- Générateur de contenu ----------
  let currentType = "product-description";
  $$("#type-chips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$("#type-chips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      currentType = chip.dataset.type;
    });
  });

  const resultBox = $("#result");
  const copyBtn = $("#copy-btn");
  const scheduleBtn = $("#schedule-btn");
  const genBtn = $("#gen-btn");

  $("#gen-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const subject = $("#subject").value.trim();
    const toneVal = $("#tone").value;
    genBtn.disabled = true;
    resultBox.classList.add("placeholder");
    resultBox.textContent = "✨ …";
    try {
      const { text, source } = await API.generate({
        type: currentType,
        subject,
        tone: toneVal,
        lang: window.I18N.getLang(),
      });
      resultBox.classList.remove("placeholder");
      resultBox.textContent = text;
      copyBtn.disabled = false;
      scheduleBtn.disabled = false;
      updateModeBadge(source);
    } catch (err) {
      resultBox.textContent = "⚠️";
    } finally {
      genBtn.disabled = false;
    }
  });

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(resultBox.textContent);
      toast(window.I18N.t("toast.copied"));
    } catch (e) {
      /* noop */
    }
  });

  // Planifier le contenu généré : l'ajoute au calendrier (date du jour).
  scheduleBtn.addEventListener("click", () => {
    window.PublishCalendar.add({
      date: new Date().toISOString().slice(0, 10),
      platform: "Instagram",
      content: resultBox.textContent,
    });
    renderCalendar();
    toast(window.I18N.t("toast.scheduled"));
    showView("calendar");
  });

  function updateModeBadge(source) {
    const badge = $("#mode-badge");
    if (source === "ia") {
      badge.textContent = window.I18N.t("badge.live");
      badge.className = "badge badge-live";
    } else {
      badge.textContent = window.I18N.t("badge.demo");
      badge.className = "badge badge-demo";
    }
  }

  // ---------- Générateur de visuels ----------
  let currentTheme = "violet";
  $$("#theme-chips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$("#theme-chips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      currentTheme = chip.dataset.theme;
    });
  });

  const visualCanvas = $("#visual-canvas");
  const visualDownload = $("#visual-download");

  $("#visual-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const pid = $("#visual-product").value;
    const product = AI.products.find((p) => p.id === pid) || AI.products[0];
    if (!product) return;
    const headline = $("#visual-headline").value.trim();
    window.VisualGenerator.draw(visualCanvas, {
      productName: product.name,
      headline: headline,
      price: AI.formatPrice(product),
      themeName: currentTheme,
    });
    visualDownload.disabled = false;
  });

  visualDownload.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = "exceptionel-post.png";
    link.href = visualCanvas.toDataURL("image/png");
    link.click();
  });

  // ---------- Calendrier ----------
  const calList = $("#calendar-list");

  function renderCalendar() {
    const items = window.PublishCalendar.all();
    calList.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "calendar-empty";
      empty.textContent = window.I18N.t("calendar.empty");
      calList.appendChild(empty);
      return;
    }
    const delLabel = window.I18N.t("calendar.delete");
    items.forEach((it) => {
      const el = document.createElement("div");
      el.className = "cal-item";
      el.innerHTML = `
        <div class="cal-item-head">
          <span class="cal-date">${it.date}</span>
          <span class="cal-platform">${escapeHtml(it.platform)}</span>
        </div>
        <div class="cal-content">${escapeHtml(it.content).slice(0, 400)}</div>
        <div style="text-align:right;margin-top:6px">
          <button class="cal-delete" data-id="${it.id}">${delLabel}</button>
        </div>
      `;
      calList.appendChild(el);
    });
    calList.querySelectorAll(".cal-delete").forEach((btn) =>
      btn.addEventListener("click", () => {
        window.PublishCalendar.remove(btn.dataset.id);
        renderCalendar();
      })
    );
  }

  // Date par défaut = aujourd'hui
  $("#cal-date").value = new Date().toISOString().slice(0, 10);

  $("#calendar-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const content = $("#cal-content").value.trim();
    if (!content) return;
    window.PublishCalendar.add({
      date: $("#cal-date").value,
      platform: $("#cal-platform").value,
      content,
    });
    $("#cal-content").value = "";
    renderCalendar();
    toast(window.I18N.t("toast.scheduled"));
  });

  // ---------- Réglages : catalogue live ----------
  const catStatus = $("#catalog-status");
  $("#catalog-url").value = window.CatalogConnector.getSavedUrl();

  $("#catalog-load").addEventListener("click", async () => {
    const url = $("#catalog-url").value.trim();
    if (!url) return;
    catStatus.className = "catalog-status";
    catStatus.textContent = "…";
    try {
      const products = await window.CatalogConnector.loadFromUrl(url);
      catStatus.className = "catalog-status ok";
      catStatus.textContent = window.I18N.t("toast.catalogLoaded", { n: products.length });
      toast(window.I18N.t("toast.catalogLoaded", { n: products.length }));
    } catch (e) {
      catStatus.className = "catalog-status err";
      catStatus.textContent = window.I18N.t("toast.catalogError");
    }
  });

  $("#catalog-reset").addEventListener("click", () => {
    window.CatalogConnector.clear();
    $("#catalog-url").value = "";
    catStatus.className = "catalog-status ok";
    catStatus.textContent = window.I18N.t("toast.catalogReset");
    toast(window.I18N.t("toast.catalogReset"));
  });

  // ---------- Chatbot ----------
  const chatWindow = $("#chat-window");
  const chatMessages = $("#chat-messages");
  const chatHistory = [];
  let chatGreeted = false;

  function openChat() {
    chatWindow.hidden = false;
    if (!chatGreeted) {
      chatGreeted = true;
      addBotMessage(window.I18N.t("chat.greeting"), []);
    }
    $("#chat-text").focus();
  }
  function closeChat() {
    chatWindow.hidden = true;
  }
  $("#chat-toggle").addEventListener("click", () =>
    chatWindow.hidden ? openChat() : closeChat()
  );
  $("#chat-close").addEventListener("click", closeChat);
  $("#open-chat-hero").addEventListener("click", openChat);
  $("#open-chat-card").addEventListener("click", openChat);

  function scrollChat() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  function addUserMessage(text) {
    const el = document.createElement("div");
    el.className = "msg user";
    el.textContent = text;
    chatMessages.appendChild(el);
    scrollChat();
  }
  function addBotMessage(text, recos) {
    const el = document.createElement("div");
    el.className = "msg bot";
    el.textContent = text;
    chatMessages.appendChild(el);
    if (recos && recos.length) {
      const wrap = document.createElement("div");
      wrap.className = "chat-recos";
      recos.forEach((p) => {
        const r = document.createElement("div");
        r.className = "reco";
        r.innerHTML = `
          <strong>${escapeHtml(p.name)}</strong>
          <span>${AI.formatPrice(p)} — ${escapeHtml(p.shortPitch || "")}</span><br/>
          <a href="${p.url}" target="_blank" rel="noopener">${escapeHtml(window.I18N.t("products.buy"))}</a>
        `;
        wrap.appendChild(r);
      });
      chatMessages.appendChild(wrap);
    }
    scrollChat();
  }
  function addTyping() {
    const el = document.createElement("div");
    el.className = "msg bot typing";
    el.textContent = "…";
    chatMessages.appendChild(el);
    scrollChat();
    return el;
  }

  $("#chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#chat-text");
    const text = input.value.trim();
    if (!text) return;
    addUserMessage(text);
    input.value = "";
    chatHistory.push({ role: "user", content: text });
    const typing = addTyping();
    try {
      const res = await API.chat(text, chatHistory);
      typing.remove();
      addBotMessage(res.text, res.products);
      chatHistory.push({ role: "assistant", content: res.text });
      updateModeBadge(res.source);
    } catch (err) {
      typing.remove();
      addBotMessage("⚠️", []);
    }
  });

  // ---------- Réactions aux changements ----------
  window.ProductStore.onChange(() => {
    renderProductInputs();
    renderProductGrid();
  });
  window.I18N.onChange(() => {
    syncLangButtons();
    renderProductGrid();
    renderCalendar();
    // Réinitialise la salutation du chat pour la prochaine ouverture
    if (chatWindow.hidden) chatGreeted = false;
  });

  // ---------- Initialisation ----------
  window.I18N.apply();
  syncLangButtons();
  renderProductInputs();
  renderProductGrid();
  renderCalendar();

  // Recharge le catalogue live enregistré (le cas échéant)
  if (window.CatalogConnector) window.CatalogConnector.initAutoLoad();
})();

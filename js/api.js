/*
 * api.js
 * Couche d'accès à l'IA avec bascule automatique.
 *
 * Stratégie :
 *  1. On tente d'appeler un backend ("/api/generate" et "/api/chat").
 *     -> Ce backend (server.js) utilise une VRAIE IA si OPENAI_API_KEY est défini.
 *  2. Si le backend est absent ou en erreur, on retombe sur le moteur
 *     hors-ligne (ai-engine.js). L'app fonctionne donc TOUJOURS.
 */

(function () {
  const OFFLINE = window.ExceptionelAI;

  // Détecte si on tourne en simple fichier (file://) : dans ce cas, pas de backend.
  const hasBackend = location.protocol.startsWith("http");

  async function tryFetch(url, body) {
    if (!hasBackend) throw new Error("offline");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("backend " + res.status);
    return res.json();
  }

  async function generate(params) {
    try {
      const data = await tryFetch("/api/generate", params);
      return { text: data.text, source: data.source || "ia" };
    } catch (e) {
      // Fallback hors-ligne
      await new Promise((r) => setTimeout(r, 400)); // petit délai pour l'UX
      return { text: OFFLINE.generate(params), source: "demo" };
    }
  }

  async function chat(message, history) {
    try {
      const data = await tryFetch("/api/chat", { message, history });
      return {
        text: data.text,
        products: data.products || [],
        source: data.source || "ia",
      };
    } catch (e) {
      await new Promise((r) => setTimeout(r, 300));
      const r = OFFLINE.chat(message, history);
      return { text: r.text, products: r.products, source: "demo" };
    }
  }

  window.ExceptionelAPI = { generate, chat };
})();

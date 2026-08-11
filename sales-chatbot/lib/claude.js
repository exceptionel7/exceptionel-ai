/*
 * claude.js — Intégration Claude (Anthropic) avec function calling.
 *
 * Utilise l'API Messages d'Anthropic via le module natif https (zéro dépendance).
 * Définit les outils de vente et exécute une boucle "tool_use" : Claude décide
 * d'appeler search_products / capture_lead / create_checkout, le backend exécute
 * réellement l'action (sur le catalogue / la session), puis renvoie le résultat
 * à Claude jusqu'à la réponse finale.
 *
 * Activé uniquement si ANTHROPIC_API_KEY est défini ET que le réseau est
 * disponible. Sinon, le serveur utilise recommender.js (repli hors-ligne).
 */

const https = require("https");
const rec = require("./recommender");

const API_HOST = "api.anthropic.com";
const API_PATH = "/v1/messages";
const API_VERSION = "2023-06-01";

// ---------------- Définition des outils exposés à Claude ----------------
const TOOLS = [
  {
    name: "search_products",
    description:
      "Recherche dans le catalogue du marchand les produits les plus pertinents pour le besoin exprimé. À utiliser avant toute recommandation ; ne jamais inventer de produit ni de prix.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Besoin ou mots-clés du client" },
        max_price_cents: { type: "integer", description: "Budget max en centimes (optionnel)" },
        limit: { type: "integer", description: "Nombre de produits (défaut 3)" },
      },
      required: ["query"],
    },
  },
  {
    name: "capture_lead",
    description:
      "Enregistre le prospect dès qu'on dispose d'un email, d'un besoin clair ou d'un budget.",
    input_schema: {
      type: "object",
      properties: {
        email: { type: "string" },
        name: { type: "string" },
        need: { type: "string" },
        budget_cents: { type: "integer" },
      },
    },
  },
  {
    name: "create_checkout",
    description:
      "Prépare un lien de paiement pour conclure la vente d'un produit précis du catalogue.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "string" },
        quantity: { type: "integer" },
      },
      required: ["product_id"],
    },
  },
];

function buildSystemPrompt(brand) {
  const b = brand || {};
  return (
    `You are an expert, friendly, honest sales advisor for ${b.brand_name || "the store"}. ` +
    `Tone: ${b.tone || "warm and professional"}. Audience: ${b.target_audience || "online shoppers"}. ` +
    `Your goal is to CLOSE THE SALE inside the conversation.\n\n` +

    `CONVERSATION STYLE:\n` +
    `- Keep every reply SHORT: 1 to 3 sentences. Never send long paragraphs or numbered lists of questions.\n` +
    `- Ask only ONE question at a time, then wait for the answer before asking the next.\n` +
    `- Be natural and human; use at most one emoji per message.\n\n` +

    `SELLING FLOW:\n` +
    `1. Understand the need with one short question (use, occasion, or budget).\n` +
    `2. ALWAYS call search_products before recommending — never invent a product, price, or feature.\n` +
    `3. Recommend the single best-fit product first (add 1 alternative only if useful). Give a one-line reason.\n` +
    `4. Handle objections briefly (price, shipping, trust) and keep steering toward the purchase.\n` +
    `5. As soon as there's genuine interest, naturally ask for their email to send the details and a small welcome offer, then call capture_lead (email, need, budget) — even partial info is worth saving.\n` +
    `6. When the customer shows buy intent OR picks a product, call create_checkout and give them the payment link right away.\n\n` +

    `RULES: Prices are in USD. Never mention a product or price that isn't returned by search_products. ` +
    `Don't be pushy or repeat the same question.\n\n` +

    `LANGUAGE RULE (very important): always reply in the SAME language as the customer's MOST RECENT message. ` +
    `If their last message is in French, reply entirely in French; if it is in English, reply entirely in English; ` +
    `mirror whatever language they switch to, message by message.`
  );
}

// ---------------- Appel HTTP bas niveau ----------------
function callMessages(apiKey, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: API_HOST,
        path: API_PATH,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 20000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.type === "error" || json.error) {
              return reject(new Error(json.error ? json.error.message : "anthropic error"));
            }
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ---------------- Exécution locale des outils ----------------
function runTool(name, input, ctx) {
  const { catalog, session } = ctx;
  if (name === "search_products") {
    const products = rec.searchProducts(catalog, input || {});
    ctx.collectedProducts = products;
    session.lastProducts = products;
    return products.map((p) => ({
      id: p.id, name: p.name, price_cents: rec.priceCents(p),
      currency: p.currency || "USD", description: p.description || p.shortPitch || "",
      url: p.url,
    }));
  }
  if (name === "capture_lead") {
    return rec.captureLead(session, input || {});
  }
  if (name === "create_checkout") {
    const product = (catalog.find((p) => p.id === (input || {}).product_id)) || session.lastProducts[0];
    if (!product) return { error: "product_not_found" };
    const checkout = rec.createCheckout(product, (input || {}).quantity || 1);
    ctx.collectedActions.push({ type: "checkout", label: `Order ${product.name}`, url: checkout.url, product_id: product.id });
    return checkout;
  }
  return { error: "unknown_tool" };
}

// ---------------- Boucle de conversation ----------------
async function converse({ apiKey, model, brand, messages, catalog, session, deadlineMs }) {
  const ctx = { catalog, session, collectedProducts: [], collectedActions: [] };
  const convo = messages.slice(); // [{role, content}]
  const system = buildSystemPrompt(brand);
  let guard = 0;

  // Budget de temps global : on doit rendre la main AVANT que Vercel ne tue la
  // fonction (sinon 504 HTML → le widget casse). Par défaut ~45 s.
  const deadline = Date.now() + (deadlineMs || 45000);

  while (guard++ < 5) {
    if (Date.now() > deadline) {
      // Plus le temps de faire un aller-retour Claude : on abandonne
      // proprement pour laisser le repli hors-ligne prendre le relais.
      throw new Error("time budget exceeded");
    }
    const resp = await callMessages(apiKey, {
      model: model || "claude-sonnet-5",
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages: convo,
    });

    // Ajoute la réponse de l'assistant à l'historique
    convo.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason === "tool_use") {
      const toolResults = [];
      for (const block of resp.content) {
        if (block.type === "tool_use") {
          const result = runTool(block.name, block.input, ctx);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }
      convo.push({ role: "user", content: toolResults });
      continue; // rappelle Claude avec les résultats d'outils
    }

    // Réponse finale : concatène les blocs texte
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return {
      reply: text,
      products: ctx.collectedProducts,
      actions: ctx.collectedActions,
      lead: session.lead || {},
      tools: [],
      messages: convo,
    };
  }
  throw new Error("tool loop exceeded");
}

// Test minimal de connexion à Claude (auth + modèle), sans outils.
function ping(apiKey, model) {
  return callMessages(apiKey, {
    model: model || "claude-sonnet-5",
    max_tokens: 16,
    messages: [{ role: "user", content: "Réponds simplement: ok" }],
  }).then((r) => (r.content && r.content[0] && r.content[0].text) || "ok");
}

// Liste les modèles disponibles pour la clé (GET /v1/models).
function listModels(apiKey) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: API_HOST,
        path: "/v1/models?limit=50",
        method: "GET",
        headers: { "x-api-key": apiKey, "anthropic-version": API_VERSION },
        timeout: 15000,
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(d);
            if (j.error) return reject(new Error(j.error.message));
            resolve((j.data || []).map((m) => m.id));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

module.exports = { converse, ping, listModels, TOOLS, buildSystemPrompt };

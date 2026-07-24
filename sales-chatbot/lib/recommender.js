/*
 * recommender.js — Moteur de vente hors-ligne (repli sans Claude).
 *
 * Reproduit la logique des "outils" (function calling) que Claude utiliserait
 * en production :
 *   - search_products : recherche/score les produits pertinents du catalogue
 *   - capture_lead    : extrait et enregistre email / besoin / budget
 *   - create_checkout : prépare un lien de paiement pour conclure la vente
 *
 * Il gère aussi les objections (prix, confiance, livraison) et pousse
 * naturellement vers la conclusion de la vente.
 *
 * Aucune dépendance externe. Utilisable côté serveur (CommonJS).
 */

// ---------------- Utilitaires ----------------
const STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "et", "ou", "je", "tu",
  "vous", "pour", "avec", "sur", "dans", "au", "aux", "ce", "cette", "mon",
  "ma", "mes", "the", "a", "an", "of", "and", "or", "for", "with", "to", "i",
  "you", "my", "is", "are", "do", "does", "want", "veux", "cherche", "besoin",
  "est", "email", "mail", "adresse", "voici", "ok", "oui", "merci", "mon",
  "c", "cest", "svp",
]);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function priceCents(p) {
  if (typeof p.price_cents === "number") return p.price_cents;
  const val = parseFloat(p.price);
  return isNaN(val) ? 0 : Math.round(val * 100);
}

function formatPrice(p) {
  const cents = priceCents(p);
  const cur = p.currency || "EUR";
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur }).format(cents / 100);
  } catch (e) {
    return (cents / 100).toFixed(2) + " " + cur;
  }
}

// ---------------- OUTIL : search_products ----------------
function searchProducts(catalog, { query, max_price_cents, limit } = {}) {
  const terms = tokenize(query);
  const scored = catalog.map((p) => {
    const haystack = [
      p.name,
      p.description || p.shortPitch,
      (p.tags || []).join(" "),
      p.category,
    ]
      .join(" ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    let score = 0;
    terms.forEach((t) => {
      if (p.name && p.name.toLowerCase().includes(t)) score += 5;
      if ((p.tags || []).some((tag) => String(tag).toLowerCase().includes(t))) score += 3;
      if (p.category && p.category.toLowerCase().includes(t)) score += 2;
      if (haystack.includes(t)) score += 1;
    });
    return { product: p, score };
  });

  let results = scored.filter((s) => s.score > 0);
  if (max_price_cents) {
    results = results.filter((s) => priceCents(s.product) <= max_price_cents);
  }
  results.sort((a, b) => b.score - a.score);

  // Repli : si rien ne matche, propose les produits les moins chers.
  if (!results.length) {
    results = catalog
      .filter((p) => !max_price_cents || priceCents(p) <= max_price_cents)
      .map((p) => ({ product: p, score: 0 }))
      .sort((a, b) => priceCents(a.product) - priceCents(b.product));
  }
  return results.slice(0, limit || 3).map((s) => s.product);
}

// ---------------- OUTIL : capture_lead ----------------
function extractEmail(text) {
  const m = String(text).match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0] : null;
}

function extractBudgetCents(text) {
  // ex : "budget de 150", "moins de 200€", "environ 99 euros"
  const m = String(text)
    .toLowerCase()
    .replace(",", ".")
    .match(/(\d+(?:\.\d+)?)\s*(?:€|eur|euros|dollars|\$|usd)?/);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (isNaN(val) || val < 3) return null; // évite de capter "2 produits"
  return Math.round(val * 100);
}

function captureLead(session, { email, need, budget_cents } = {}) {
  session.lead = session.lead || {};
  if (email) session.lead.email = email;
  if (need) session.lead.need = need;
  if (budget_cents) session.lead.budget_cents = budget_cents;
  // Score simple de qualification
  let score = 0;
  if (session.lead.email) score += 50;
  if (session.lead.need) score += 30;
  if (session.lead.budget_cents) score += 20;
  session.lead.score = score;
  session.lead.status = score >= 50 ? "qualified" : "new";
  return session.lead;
}

// ---------------- OUTIL : create_checkout ----------------
function createCheckout(product, quantity) {
  const qty = quantity || 1;
  // En production : Stripe Checkout Session. Ici : lien simulé + fallback URL produit.
  const base = product.url || "https://exceptionel.com/checkout";
  const url = `${base}${base.includes("?") ? "&" : "?"}qty=${qty}&via=exceptionel-ai`;
  return {
    product_id: product.id,
    quantity: qty,
    amount_cents: priceCents(product) * qty,
    url,
  };
}

// ---------------- Détection d'intention ----------------
const PATTERNS = {
  greeting: /\b(bonjour|salut|hello|hi|hey|coucou|bonsoir)\b/i,
  price: /\b(prix|combien|co[uû]te|tarif|cher|expensive|how much|cost)\b/i,
  shipping: /\b(livraison|exp[eé]di|d[eé]lai|shipping|delivery|deliver)\b/i,
  trust: /\b(avis|garantie|confiance|s[eé]rieux|arnaque|review|warranty|guarantee|s[uû]r)\b/i,
  buy: /\b(acheter|commander|je le prends|je prends|checkout|payer|buy|order|purchase|panier)\b/i,
  objectionPrice: /\b(trop cher|cher|budget serr|pas les moyens|too expensive|can'?t afford)\b/i,
};

function detect(message) {
  const intents = {};
  for (const [key, re] of Object.entries(PATTERNS)) intents[key] = re.test(message);
  return intents;
}

// ---------------- Réponses (objections, closing) ----------------
const COPY = {
  shipping:
    "Bonne question ! La livraison est offerte dès 50 € et vos articles arrivent en 2 à 4 jours ouvrés. 🚚 Vous voulez que je vous montre ce qui correspond à votre besoin ?",
  trust:
    "Je comprends. Nos clients notent leurs achats en moyenne 4,7/5, et tout est couvert par une garantie « satisfait ou remboursé » sous 30 jours. 👍 Dites-moi ce que vous recherchez et je vous oriente.",
  objectionPrice:
    "Je comprends la question du budget. Dites-moi votre fourchette et je vous trouve la meilleure option — on a souvent une alternative au bon rapport qualité/prix.",
  askNeed:
    "Pour bien vous conseiller, pouvez-vous me dire ce que vous cherchez exactement (usage, style, occasion) ?",
  askEmailSoft:
    "Souhaitez-vous que je vous envoie les détails et une petite réduction de bienvenue par email ? Laissez-moi votre adresse et je vous prépare tout ça. 😊",
  leadThanks:
    "Parfait, c'est noté ✅ Un conseiller peut aussi vous recontacter si besoin.",
};

/**
 * Orchestre une réponse complète à partir du message et de l'état de session.
 * @returns {{reply, products, actions, lead, tools}}
 */
function respond(session, message, catalog) {
  session.lead = session.lead || {};
  session.lastProducts = session.lastProducts || [];
  const intents = detect(message);
  const toolsUsed = [];
  let products = [];
  const actions = [];
  let reply = "";

  // 1) Capture de lead opportuniste (email / budget présents dans le message)
  const email = extractEmail(message);
  const budget = extractBudgetCents(message);
  if (email || budget) {
    captureLead(session, { email, budget_cents: budget, need: session.lead.need });
    toolsUsed.push("capture_lead");
  }

  // 2) Intention d'achat -> checkout
  if (intents.buy && session.lastProducts.length) {
    const product = session.lastProducts[0];
    const checkout = createCheckout(product, 1);
    toolsUsed.push("create_checkout");
    actions.push({ type: "checkout", label: `Commander ${product.name} — ${formatPrice(product)}`, url: checkout.url, product_id: product.id });
    reply =
      `Excellent choix ! 🎉 J'ai préparé votre commande pour **${product.name}** (${formatPrice(product)}). ` +
      `Cliquez sur le bouton pour finaliser le paiement en toute sécurité.`;
    if (!session.lead.email) {
      reply += " " + COPY.askEmailSoft;
    }
    return { reply, products: [product], actions, lead: session.lead, tools: toolsUsed };
  }

  // 3) Objections
  if (intents.objectionPrice) {
    reply = COPY.objectionPrice;
    if (budget) {
      // On garde le contexte du besoin ET de la catégorie déjà explorée,
      // pour proposer une alternative pertinente (même univers, moins chère).
      let q = session.lead.need || "";
      const last = session.lastProducts[0];
      if (last) q += " " + (last.category || "") + " " + (last.tags || []).slice(0, 5).join(" ");
      products = searchProducts(catalog, { query: q, max_price_cents: budget, limit: 2 });
      toolsUsed.push("search_products");
      session.lastProducts = products;
      if (products.length) reply = `Avec un budget de ${(budget / 100).toFixed(0)} €, voici ma meilleure recommandation :`;
    }
    return { reply, products, actions, lead: session.lead, tools: toolsUsed };
  }
  if (intents.shipping) return { reply: COPY.shipping, products, actions, lead: session.lead, tools: toolsUsed };
  if (intents.trust) return { reply: COPY.trust, products, actions, lead: session.lead, tools: toolsUsed };

  // 4) Message qui ne fait qu'apporter un email / budget (peu de contenu utile) :
  //    on remercie et on pousse à conclure sur le produit déjà sélectionné.
  const meaningfulNoContact = tokenize(String(message).replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, " "));
  if ((email || budget) && !intents.buy && meaningfulNoContact.length <= 1) {
    const last = session.lastProducts[0];
    if (last) {
      reply = COPY.leadThanks + ` Souhaitez-vous finaliser votre commande de ${last.name} (${formatPrice(last)}) ? Dites simplement « je le prends ». 😊`;
      return { reply, products: [last], actions, lead: session.lead, tools: toolsUsed };
    }
    reply = COPY.leadThanks + " " + COPY.askNeed;
    return { reply, products, actions, lead: session.lead, tools: toolsUsed };
  }

  // 5) Salutation pure (message court sans contenu utile)
  const meaningful = tokenize(message);
  if (intents.greeting && meaningful.length <= 1) {
    return {
      reply:
        "Bonjour et bienvenue ! 👋 Je suis votre conseiller. Dites-moi ce que vous cherchez et je vous trouve le produit idéal.",
      products, actions, lead: session.lead, tools: toolsUsed,
    };
  }

  // 5) Recherche produit (cas général)
  products = searchProducts(catalog, { query: message, max_price_cents: session.lead.budget_cents, limit: 3 });
  toolsUsed.push("search_products");
  session.lastProducts = products;
  // Mémorise le besoin exprimé
  if (meaningful.length && !session.lead.need) session.lead.need = message.slice(0, 120);

  if (products.length) {
    const top = products[0];
    reply =
      `D'après ce que vous décrivez, je vous recommande **${top.name}** (${formatPrice(top)}) : ` +
      `${top.description || top.shortPitch || ""}`.trim();
    if (products.length > 1) reply += ` J'ai aussi 1 ou 2 autres options à vous proposer.`;
    // Progression vers la qualification / closing
    if (!session.lead.email) {
      reply += " Voulez-vous que je vous réserve le vôtre ? " + COPY.askEmailSoft;
    } else {
      reply += ` Souhaitez-vous le commander maintenant ?`;
    }
  } else {
    reply = COPY.askNeed;
  }

  // Remerciement si un lead vient d'être capturé
  if (email) reply = COPY.leadThanks + " " + reply;

  return { reply, products, actions, lead: session.lead, tools: toolsUsed };
}

module.exports = {
  respond,
  searchProducts,
  captureLead,
  createCheckout,
  extractEmail,
  extractBudgetCents,
  formatPrice,
  priceCents,
  detect,
};

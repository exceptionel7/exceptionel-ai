/*
 * script-generator.js — Génère un script de vidéo marketing court (9:16).
 *
 * Deux modes :
 *   - Claude (si ANTHROPIC_API_KEY) : demande un script structuré en JSON.
 *   - Hors-ligne (repli) : moteur de gabarits, sans clé ni réseau.
 *
 * Sortie normalisée :
 *   { hook, body[], cta, voiceover, caption, hashtags[], durationSec, scenes[] }
 */

const ai = require("./ai");

function priceLabel(product) {
  const cents = typeof product.price_cents === "number"
    ? product.price_cents
    : Math.round((parseFloat(product.price) || 0) * 100);
  if (!cents) return "";
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: product.currency || "EUR",
    }).format(cents / 100);
  } catch (e) {
    return (cents / 100).toFixed(2) + " €";
  }
}

function slugify(s) {
  return String(s || "video")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------- Moteur hors-ligne (gabarits) ----------------
function offlineScript(product, brand) {
  const name = product.name || "notre nouveauté";
  const price = priceLabel(product);
  const desc = product.description || product.shortPitch || "";
  const brandName = (brand && brand.brand_name) || "Exceptionel";
  const features = (product.features && product.features.length
    ? product.features
    : (desc ? [desc] : ["Qualité premium", "Livraison rapide"]));

  const hook = `Vous cherchez ${product.category ? product.category.toLowerCase() : "le produit parfait"} ? Regardez ça 👀`;
  const body = [
    `Voici ${name}${price ? " — " + price : ""}.`,
    ...features.slice(0, 3).map((f) => `✅ ${f}`),
  ];
  const cta = `Disponible maintenant sur ${brandName.toLowerCase()}.com 🛒`;
  const voiceover = [hook, ...body, cta].join(" ");
  const tags = (product.tags || []).slice(0, 4).map((t) => "#" + String(t).replace(/\s+/g, ""));
  const hashtags = ["#" + slugify(brandName), ...tags, "#nouveaute", "#shopping"].slice(0, 8);
  const caption = `${name} : ${desc || "à découvrir absolument"} ${price ? "(" + price + ") " : ""}✨\n${cta}`;

  const scenes = [
    { t: "0-3s", visual: `Gros plan sur ${name}, ambiance dynamique`, text: hook },
    { t: "3-15s", visual: "Plans produit + bénéfices en surimpression", text: body.join(" ") },
    { t: "15-20s", visual: "Logo + appel à l'action", text: cta },
  ];

  return {
    hook,
    body,
    cta,
    voiceover,
    caption,
    hashtags,
    durationSec: 20,
    scenes,
    source: "offline",
  };
}

// ---------------- Génération via Claude ----------------
async function claudeScript(product, brand, apiKey, model) {
  const system =
    "Tu es un directeur créatif spécialisé en vidéos courtes (Reels/TikTok, format 9:16, 15-30s) " +
    "pour l'e-commerce. Tu écris en français, ton " + ((brand && brand.tone) || "dynamique et vendeur") + ". " +
    "Réponds UNIQUEMENT par un objet JSON valide, sans texte autour.";
  const user =
    "Génère un script de vidéo marketing pour ce produit.\n\n" +
    "Produit: " + JSON.stringify({
      name: product.name,
      description: product.description || product.shortPitch,
      price: priceLabel(product),
      category: product.category,
      tags: product.tags,
    }) + "\n" +
    "Marque: " + JSON.stringify({ name: (brand && brand.brand_name) || "Exceptionel", tone: brand && brand.tone }) + "\n\n" +
    "Schéma JSON attendu:\n" +
    "{\n" +
    '  "hook": "accroche 0-3s percutante",\n' +
    '  "body": ["2 à 4 courtes phrases de bénéfices"],\n' +
    '  "cta": "appel à l\'action final",\n' +
    '  "voiceover": "texte complet de la voix off",\n' +
    '  "caption": "légende pour le post avec emojis",\n' +
    '  "hashtags": ["#..."],\n' +
    '  "durationSec": 20,\n' +
    '  "scenes": [{"t":"0-3s","visual":"description du plan","text":"texte à l\'écran"}]\n' +
    "}";

  const json = await ai.completeJSON({ apiKey, model, system, user, maxTokens: 1200 });
  // Normalisation défensive
  return {
    hook: json.hook || "",
    body: Array.isArray(json.body) ? json.body : (json.body ? [json.body] : []),
    cta: json.cta || "",
    voiceover: json.voiceover || [json.hook, ...(json.body || []), json.cta].filter(Boolean).join(" "),
    caption: json.caption || "",
    hashtags: Array.isArray(json.hashtags) ? json.hashtags : [],
    durationSec: json.durationSec || 20,
    scenes: Array.isArray(json.scenes) ? json.scenes : [],
    source: "claude",
  };
}

/**
 * Génère un script. Utilise Claude si une clé est fournie, sinon le repli.
 */
async function generateScript(product, brand, opts) {
  opts = opts || {};
  const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY || "";
  const model = opts.model || process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  if (apiKey) {
    try {
      return await claudeScript(product || {}, brand || {}, apiKey, model);
    } catch (e) {
      const s = offlineScript(product || {}, brand || {});
      s.source = "offline-fallback";
      s.warning = "Claude indisponible: " + (e && e.message);
      return s;
    }
  }
  return offlineScript(product || {}, brand || {});
}

module.exports = { generateScript, offlineScript, priceLabel, slugify };

/*
 * engine.js — Logique métier partagée du module vidéo (serveur + serverless).
 *
 * Rassemble la configuration (variables d'environnement) et expose les actions :
 *   - generateScript(body) : script seul
 *   - generateVideo(body)  : pipeline complet (script → vidéo → publication)
 *   - health()             : état des intégrations
 *
 * ⚠️ Prototype : les vidéos générées sont stockées en mémoire. En production →
 * PostgreSQL (tables videos / video_publications, voir ../../ARCHITECTURE.md).
 */

const scriptGen = require("./script-generator");
const video = require("./video-providers");
const { runPipeline } = require("./pipeline");

// Produit de démonstration (si aucun produit n'est fourni).
const DEMO_PRODUCT = {
  id: "casque-serenity",
  name: "Casque Serenity",
  category: "Audio",
  price_cents: 19900,
  currency: "EUR",
  tags: ["casque", "audio", "sans fil", "voyage"],
  description:
    "Casque sans fil à réduction de bruit active, 40h d'autonomie et son haute résolution.",
  image_url: "",
  url: "https://exceptionel.com/produits/casque-serenity",
};

const videos = []; // stockage en mémoire (prototype)

function buildConfig() {
  return {
    anthropicKey: process.env.ANTHROPIC_API_KEY || "",
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    heygenKey: process.env.HEYGEN_API_KEY || "",
    heygenAvatarId: process.env.HEYGEN_AVATAR_ID || "",
    heygenVoiceId: process.env.HEYGEN_VOICE_ID || "",
    runwayKey: process.env.RUNWAY_API_KEY || "",
    metaAccessToken: process.env.META_ACCESS_TOKEN || "",
    igUserId: process.env.META_IG_USER_ID || "",
    fbPageId: process.env.META_FB_PAGE_ID || "",
    tiktokAccessToken: process.env.TIKTOK_ACCESS_TOKEN || "",
  };
}

async function generateScript(body) {
  body = body || {};
  const product = body.product || DEMO_PRODUCT;
  const brand = body.brand || null;
  const cfg = buildConfig();
  const script = await scriptGen.generateScript(product, brand, {
    apiKey: cfg.anthropicKey,
    model: cfg.anthropicModel,
  });
  return { product: { id: product.id, name: product.name }, script };
}

async function generateVideo(body) {
  body = body || {};
  const product = body.product || DEMO_PRODUCT;
  const result = await runPipeline({
    product,
    brand: body.brand || null,
    platforms: body.platforms,
    provider: body.provider,
    config: buildConfig(),
  });
  const record = { id: "vid_" + Date.now(), createdAt: new Date().toISOString(), ...result };
  videos.push(record);
  return record;
}

function listVideos() {
  return { videos, count: videos.length };
}

// Liste les avatars et voix HeyGen disponibles (pour trouver les bons IDs).
async function heygenAssets() {
  const cfg = buildConfig();
  if (!cfg.heygenKey) return { error: "HEYGEN_API_KEY manquante sur ce projet." };
  try {
    const [avatars, voices] = await Promise.all([video.listAvatars(cfg), video.listVoices(cfg)]);
    return {
      avatars,
      voices,
      hint: "Copiez un avatar_id dans HEYGEN_AVATAR_ID et un voice_id dans HEYGEN_VOICE_ID (variables Vercel), puis redéployez.",
    };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

// Statut d'un rendu vidéo en cours (polling).
async function videoStatus(q) {
  q = q || {};
  return video.pollVideo({ provider: q.provider, jobId: q.jobId, config: buildConfig() });
}

function health() {
  const c = buildConfig();
  return {
    ok: true,
    script_ai: c.anthropicKey ? "claude" : "offline",
    video_provider: c.heygenKey ? "heygen" : c.runwayKey ? "runway" : "mock",
    social: {
      instagram: !!(c.metaAccessToken && c.igUserId),
      facebook: !!(c.metaAccessToken && c.fbPageId),
      tiktok: !!c.tiktokAccessToken,
    },
    videos: videos.length,
  };
}

module.exports = { generateScript, generateVideo, listVideos, heygenAssets, videoStatus, health, DEMO_PRODUCT };

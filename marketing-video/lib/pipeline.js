/*
 * pipeline.js — Orchestration du module vidéo.
 *
 * product + brand  →  [script]  →  [rendu vidéo]  →  [publication multi-réseaux]
 *
 * Chaque étape est indépendante et résiliente : si une intégration réelle
 * manque (clé/OAuth), on bascule sur un mode simulé pour rester démontrable.
 */

const scriptGen = require("./script-generator");
const video = require("./video-providers");
const social = require("./social-publishers");

async function runPipeline({ product, brand, platforms, provider, config }) {
  config = config || {};
  product = product || {};
  platforms = platforms && platforms.length ? platforms : ["instagram", "tiktok", "facebook"];

  // 1) Script (Claude ou hors-ligne)
  const script = await scriptGen.generateScript(product, brand, {
    apiKey: config.anthropicKey,
    model: config.anthropicModel,
  });

  // 2) Rendu vidéo (HeyGen / Runway / mock)
  const rendered = await video.generateVideo({
    provider,
    script,
    productImage: product.image_url || product.image,
    config,
  });

  // 3) Publication sur chaque réseau (réel si OAuth, sinon simulé)
  let publications = [];
  if (rendered.url) {
    publications = await Promise.all(
      platforms.map((p) =>
        social.publish({ platform: p, video: rendered, caption: script.caption, config })
      )
    );
  } else {
    // La vidéo n'est pas encore prête (rendu asynchrone) : publication différée.
    publications = platforms.map((p) => ({ platform: p, status: "queued", note: "waiting for video render" }));
  }

  return {
    product: { id: product.id, name: product.name },
    script,
    video: rendered,
    publications,
    mode: {
      script: script.source,
      video: rendered.provider,
      publish: publications.some((x) => x && x.mock) ? "mock" : "live",
    },
  };
}

module.exports = { runPipeline };

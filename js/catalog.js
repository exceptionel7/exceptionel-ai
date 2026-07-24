/*
 * catalog.js
 * Connexion au catalogue exceptionel.com en temps réel.
 *
 * Charge les produits depuis une URL JSON fournie par l'utilisateur, les
 * convertit au format interne, et alimente ProductStore. Compatible avec :
 *   - Le format Shopify  ( /products.json  -> { products: [...] } )
 *   - Un simple tableau JSON de produits
 *   - Un objet { products: [...] } générique
 *
 * L'URL est mémorisée dans localStorage : au prochain chargement, le catalogue
 * live est rechargé automatiquement. En cas d'échec, on garde la démo.
 *
 * NOTE : la boutique cible doit autoriser le CORS (ou passer par un proxy).
 * Shopify expose /products.json publiquement avec CORS ouvert.
 */

(function () {
  const KEY = "exc_catalog_url";

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function baseFromUrl(url) {
    try {
      const u = new URL(url);
      return u.origin;
    } catch (e) {
      return "https://exceptionel.com";
    }
  }

  // Convertit un produit Shopify vers le format interne.
  function mapShopify(sp, base) {
    const variant = (sp.variants && sp.variants[0]) || {};
    const price = parseFloat(variant.price || sp.price || 0) || 0;
    const img = (sp.images && sp.images[0] && sp.images[0].src) || sp.image || "";
    const plainBody = String(sp.body_html || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      id: sp.handle || slugify(sp.title),
      name: sp.title || "Produit",
      category: sp.product_type || (sp.tags && String(sp.tags).split(",")[0]) || "Boutique",
      price: price,
      currency: "EUR",
      tags: typeof sp.tags === "string" ? sp.tags.split(",").map((t) => t.trim()).filter(Boolean) : sp.tags || [],
      shortPitch: plainBody ? plainBody.slice(0, 140) : (sp.title || ""),
      features: [],
      audience: "",
      image: img,
      url: base + "/products/" + (sp.handle || slugify(sp.title)),
    };
  }

  // Convertit un produit "générique" (déjà proche du format interne).
  function mapGeneric(p, base) {
    return {
      id: p.id || slugify(p.name || p.title),
      name: p.name || p.title || "Produit",
      category: p.category || p.product_type || "Boutique",
      price: parseFloat(p.price) || 0,
      currency: p.currency || "EUR",
      tags: Array.isArray(p.tags) ? p.tags : typeof p.tags === "string" ? p.tags.split(",").map((t) => t.trim()) : [],
      shortPitch: p.shortPitch || p.description || p.pitch || "",
      features: Array.isArray(p.features) ? p.features : [],
      audience: p.audience || "",
      image: p.image || p.imageUrl || "",
      url: p.url || base + "/products/" + (p.id || slugify(p.name || p.title)),
    };
  }

  function normalize(data, url) {
    const base = baseFromUrl(url);
    let rawList = [];
    let shopify = false;
    if (Array.isArray(data)) {
      rawList = data;
    } else if (data && Array.isArray(data.products)) {
      rawList = data.products;
      // Détection Shopify : présence de variants / body_html
      shopify = rawList.some((p) => p && (p.variants || p.body_html || p.handle));
    } else if (data && Array.isArray(data.items)) {
      rawList = data.items;
    }
    return rawList
      .map((p) => (shopify ? mapShopify(p, base) : mapGeneric(p, base)))
      .filter((p) => p.name && p.name !== "Produit");
  }

  async function loadFromUrl(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const products = normalize(data, url);
    if (!products.length) throw new Error("no-products");
    window.ProductStore.setProducts(products);
    localStorage.setItem(KEY, url);
    return products;
  }

  function getSavedUrl() {
    return localStorage.getItem(KEY) || "";
  }

  function clear() {
    localStorage.removeItem(KEY);
    window.ProductStore.reset();
  }

  // Rechargement automatique au démarrage si une URL a été enregistrée.
  async function initAutoLoad() {
    const url = getSavedUrl();
    if (!url) return;
    try {
      await loadFromUrl(url);
    } catch (e) {
      // Échec silencieux -> on reste sur la démo.
      console.warn("Catalogue live indisponible, retour à la démo:", e.message);
    }
  }

  window.CatalogConnector = { loadFromUrl, getSavedUrl, clear, initAutoLoad };
})();

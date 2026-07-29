/*
 * stripe.js — Client Stripe minimal (zéro dépendance).
 *
 * Appelle l'API Stripe via le module natif https. L'API Stripe attend des
 * données en x-www-form-urlencoded (params imbriqués avec crochets).
 *
 * Utilisé pour créer des Checkout Sessions (paiement de produit ou abonnement)
 * et récupérer une session. La clé secrète (sk_...) reste côté serveur.
 */

const https = require("https");

// Encode une liste de paires [clé, valeur] au format form-urlencoded Stripe.
function encodeForm(pairs) {
  return pairs
    .filter(function (p) { return p[1] !== undefined && p[1] !== null && p[1] !== ""; })
    .map(function (p) { return encodeURIComponent(p[0]) + "=" + encodeURIComponent(String(p[1])); })
    .join("&");
}

function stripeRequest(secretKey, method, path, pairs) {
  return new Promise(function (resolve, reject) {
    var payload = pairs ? encodeForm(pairs) : "";
    var headers = {
      Authorization: "Bearer " + secretKey,
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (payload) headers["Content-Length"] = Buffer.byteLength(payload);

    var req = https.request(
      { hostname: "api.stripe.com", path: path, method: method, headers: headers, timeout: 30000 },
      function (res) {
        var data = "";
        res.on("data", function (c) { data += c; });
        res.on("end", function () {
          var json = {};
          try { json = JSON.parse(data || "{}"); } catch (e) { json = { raw: data }; }
          if (res.statusCode >= 400) {
            var msg = (json.error && (json.error.message || json.error.type)) || ("HTTP " + res.statusCode);
            return reject(new Error(msg));
          }
          resolve(json);
        });
      }
    );
    req.on("timeout", function () { req.destroy(new Error("timeout")); });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Crée une session Stripe Checkout.
 * @param {string} secretKey
 * @param {Object} opts { mode, product, quantity, priceId, currency, successUrl, cancelUrl, customerEmail }
 */
function createCheckoutSession(secretKey, opts) {
  opts = opts || {};
  var mode = opts.mode === "subscription" ? "subscription" : "payment";
  var quantity = opts.quantity || 1;
  var pairs = [
    ["mode", mode],
    ["success_url", opts.successUrl],
    ["cancel_url", opts.cancelUrl],
  ];
  if (opts.customerEmail) pairs.push(["customer_email", opts.customerEmail]);

  if (mode === "subscription") {
    // Abonnement SaaS : nécessite un Price ID Stripe existant (plan).
    pairs.push(["line_items[0][price]", opts.priceId]);
    pairs.push(["line_items[0][quantity]", quantity]);
  } else {
    // Paiement d'un produit : price_data à la volée (pas besoin de créer le produit).
    var p = opts.product || {};
    pairs.push(["line_items[0][price_data][currency]", (opts.currency || p.currency || "eur").toLowerCase()]);
    pairs.push(["line_items[0][price_data][product_data][name]", p.name || "Produit"]);
    if (p.description) pairs.push(["line_items[0][price_data][product_data][description]", String(p.description).slice(0, 250)]);
    pairs.push(["line_items[0][price_data][unit_amount]", p.price_cents || 0]);
    pairs.push(["line_items[0][quantity]", quantity]);
    if (p.id) pairs.push(["metadata[product_id]", p.id]);
  }

  // Marchand propriétaire (pour rattacher la commande via le webhook).
  if (opts.userId) pairs.push(["metadata[user_id]", opts.userId]);
  if (opts.userId) pairs.push(["client_reference_id", opts.userId]);

  return stripeRequest(secretKey, "POST", "/v1/checkout/sessions", pairs);
}

function retrieveSession(secretKey, id) {
  return stripeRequest(secretKey, "GET", "/v1/checkout/sessions/" + encodeURIComponent(id), null);
}

module.exports = { createCheckoutSession, retrieveSession, stripeRequest, encodeForm };

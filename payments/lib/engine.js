/*
 * engine.js — Logique métier partagée du module Paiements (serveur + serverless).
 *
 * - createCheckout : crée une session Stripe Checkout (paiement produit ou
 *   abonnement). Sans clé Stripe → paiement SIMULÉ (mode démo).
 * - handleWebhook  : vérifie la signature Stripe puis enregistre la commande.
 * - listOrders / health.
 *
 * ⚠️ Prototype : commandes stockées EN MÉMOIRE. En production → PostgreSQL
 * (table orders, voir ../../ARCHITECTURE.md) + notifications marchand.
 */

const stripe = require("./stripe");
const webhook = require("./webhook");

var orders = []; // stockage en mémoire (prototype)

function cfg() {
  return {
    secret: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    currency: process.env.STRIPE_CURRENCY || "usd",
  };
}

function baseFrom(body) {
  var o = (body && body.origin) || process.env.PUBLIC_BASE_URL || "";
  return String(o).replace(/\/+$/, "");
}

async function createCheckout(body) {
  body = body || {};
  var c = cfg();
  var product = body.product || {};
  var mode = body.mode === "subscription" ? "subscription" : "payment";
  var origin = baseFrom(body);
  var successUrl = origin + "/?paid=1&session={CHECKOUT_SESSION_ID}";
  var cancelUrl = origin + "/?canceled=1";

  // Mode démo (aucune clé Stripe) : on simule un paiement réussi.
  if (!c.secret) {
    var demoId = "cs_demo_" + Date.now();
    orders.push({
      id: demoId,
      product: product.name || "Produit",
      product_id: product.id || "",
      amount_cents: product.price_cents || 0,
      currency: c.currency,
      status: "paid",
      mock: true,
      createdAt: new Date().toISOString(),
    });
    return {
      url: (origin || "") + "/?paid=1&demo=1&session=" + demoId,
      id: demoId,
      mock: true,
      note: "Simulated payment (demo mode). Add STRIPE_SECRET_KEY for real payments.",
    };
  }

  // Mode réel : session Stripe Checkout.
  var session = await stripe.createCheckoutSession(c.secret, {
    mode: mode,
    product: product,
    quantity: body.quantity || 1,
    priceId: body.priceId, // pour les abonnements
    currency: c.currency,
    successUrl: successUrl,
    cancelUrl: cancelUrl,
    customerEmail: body.email,
  });
  return { url: session.url, id: session.id, mode: mode };
}

function recordOrderFromSession(s) {
  if (!s || orders.some(function (o) { return o.id === s.id; })) return;
  orders.push({
    id: s.id,
    amount_cents: s.amount_total,
    currency: s.currency,
    email: (s.customer_details && s.customer_details.email) || s.customer_email || "",
    product_id: (s.metadata && s.metadata.product_id) || "",
    status: s.payment_status || "paid",
    createdAt: new Date().toISOString(),
  });
}

/**
 * Traite un webhook Stripe. rawBody DOIT être le corps brut (string/Buffer).
 * @returns {{status:number, body:object}}
 */
function handleWebhook(rawBody, sigHeader) {
  var c = cfg();

  // Si un secret de webhook est configuré, on vérifie la signature.
  if (c.webhookSecret) {
    var ok = webhook.verifySignature(rawBody, sigHeader, c.webhookSecret, 300);
    if (!ok) return { status: 400, body: { error: "invalid signature" } };
  }

  var event;
  try {
    event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody || "{}");
  } catch (e) {
    return { status: 400, body: { error: "invalid payload" } };
  }

  if (event.type === "checkout.session.completed") {
    recordOrderFromSession(event.data && event.data.object);
    // En prod : notifier le marchand (email/websocket), décrémenter le stock…
  }
  return { status: 200, body: { received: true, type: event.type } };
}

function listOrders() {
  return { orders: orders, count: orders.length };
}

function health() {
  var c = cfg();
  var keyType = c.secret ? (c.secret.indexOf("sk_live") === 0 ? "live" : c.secret.indexOf("sk_test") === 0 ? "test" : "set") : "demo";
  return {
    ok: true,
    payments: c.secret ? "stripe" : "demo",
    key_type: keyType,
    webhook_configured: !!c.webhookSecret,
    orders: orders.length,
  };
}

module.exports = { createCheckout, handleWebhook, listOrders, health };

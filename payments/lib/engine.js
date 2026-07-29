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
const db = require("./db");

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
    try {
      await db.insert("orders", {
        user_id: body.__userId || "demo",
        stripe_id: demoId,
        product_id: product.id || "",
        amount_cents: product.price_cents || 0,
        currency: c.currency,
        email: body.email || "",
        status: "paid",
      });
    } catch (e) { console.error("[Exceptionel][orders] persist failed →", e && e.message); }
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
    userId: body.__userId, // rattache la commande au marchand (metadata)
  });
  return { url: session.url, id: session.id, mode: mode };
}

async function recordOrderFromSession(s) {
  if (!s) return;
  try {
    await db.insert("orders", {
      user_id: (s.metadata && s.metadata.user_id) || s.client_reference_id || "demo",
      stripe_id: s.id,
      amount_cents: s.amount_total,
      currency: s.currency,
      email: (s.customer_details && s.customer_details.email) || s.customer_email || "",
      product_id: (s.metadata && s.metadata.product_id) || "",
      status: s.payment_status || "paid",
    });
  } catch (e) {
    console.error("[Exceptionel][orders] persist failed →", e && e.message);
  }
}

/**
 * Traite un webhook Stripe. rawBody DOIT être le corps brut (string/Buffer).
 * @returns {{status:number, body:object}}
 */
async function handleWebhook(rawBody, sigHeader) {
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
    await recordOrderFromSession(event.data && event.data.object);
    // En prod : notifier le marchand (email/websocket), décrémenter le stock…
  }
  return { status: 200, body: { received: true, type: event.type } };
}

async function listOrders(userId) {
  var rows = await db.select("orders", { user_id: userId || "demo" });
  return { orders: rows, count: rows.length };
}

function health() {
  var c = cfg();
  var keyType = c.secret ? (c.secret.indexOf("sk_live") === 0 ? "live" : c.secret.indexOf("sk_test") === 0 ? "test" : "set") : "demo";
  return {
    ok: true,
    payments: c.secret ? "stripe" : "demo",
    key_type: keyType,
    webhook_configured: !!c.webhookSecret,
    storage: db.isConfigured() ? "postgres" : "in-memory (demo)",
  };
}

module.exports = { createCheckout, handleWebhook, listOrders, health };

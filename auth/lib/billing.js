/*
 * billing.js — SaaS subscription billing for Exceptionel AI merchants.
 *
 * Merchants subscribe to a plan (Starter / Pro) via Stripe Checkout in
 * subscription mode. Their plan + subscription status is stored on the users
 * row and kept in sync by Stripe webhooks.
 *
 * Config (env, on the auth Vercel project):
 *   STRIPE_SECRET_KEY              sk_live_... (same account as payments)
 *   STRIPE_PRICE_STARTER           price_...  (recurring $29/mo Price)
 *   STRIPE_PRICE_PRO               price_...  (recurring $99/mo Price)
 *   STRIPE_BILLING_WEBHOOK_SECRET  whsec_...  (billing webhook endpoint secret)
 *   PUBLIC_BASE_URL                dashboard URL (fallback for redirects)
 *
 * Without STRIPE_SECRET_KEY / price ids, endpoints return a clear "not
 * configured" message instead of failing.
 */

const stripe = require("./stripe");
const webhook = require("./webhook");
const db = require("./db");

function cfg() {
  return {
    secret: (process.env.STRIPE_SECRET_KEY || "").trim(),
    webhookSecret: (process.env.STRIPE_BILLING_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || "").trim(),
    prices: {
      starter: (process.env.STRIPE_PRICE_STARTER || "").trim(),
      pro: (process.env.STRIPE_PRICE_PRO || "").trim(),
    },
  };
}

function isConfigured() {
  var c = cfg();
  return !!(c.secret && (c.prices.starter || c.prices.pro));
}

// Reverse lookup: Stripe price id -> plan name (used by subscription webhooks).
function planForPrice(priceId) {
  if (!priceId) return null;
  var c = cfg();
  if (priceId === c.prices.starter) return "starter";
  if (priceId === c.prices.pro) return "pro";
  return null;
}

function baseUrl(origin) {
  var o = origin || process.env.PUBLIC_BASE_URL || "";
  return String(o).replace(/\/+$/, "");
}

// ---------------- Checkout (subscribe / upgrade) ----------------
async function checkout(user, plan, origin) {
  var c = cfg();
  if (!c.secret) {
    return { status: 400, body: { error: "Billing not configured: STRIPE_SECRET_KEY is missing on the auth project." } };
  }
  plan = plan === "pro" ? "pro" : "starter";
  var priceId = c.prices[plan];
  if (!priceId) {
    return { status: 400, body: { error: "No Stripe price configured for the " + plan + " plan (set STRIPE_PRICE_" + plan.toUpperCase() + ")." } };
  }
  var base = baseUrl(origin);
  var session = await stripe.createSubscriptionSession(c.secret, {
    priceId: priceId,
    quantity: 1,
    plan: plan,
    userId: user.id,
    customer: user.stripe_customer_id || undefined,
    customerEmail: user.stripe_customer_id ? undefined : user.email,
    successUrl: base + "/?billing=success&session={CHECKOUT_SESSION_ID}",
    cancelUrl: base + "/?billing=cancel",
  });
  return { status: 200, body: { url: session.url, id: session.id, plan: plan } };
}

// ---------------- Billing portal (manage / cancel) ----------------
async function portal(user, origin) {
  var c = cfg();
  if (!c.secret) {
    return { status: 400, body: { error: "Billing not configured: STRIPE_SECRET_KEY is missing." } };
  }
  if (!user.stripe_customer_id) {
    return { status: 400, body: { error: "No active subscription yet — subscribe to a plan first." } };
  }
  var base = baseUrl(origin);
  var session = await stripe.createPortalSession(c.secret, user.stripe_customer_id, base + "/?billing=portal");
  return { status: 200, body: { url: session.url } };
}

// ---------------- Webhook (keep plan in sync) ----------------
async function handleWebhook(rawBody, sigHeader) {
  var c = cfg();

  // Parse whatever we received (raw string OR a body already parsed by the
  // @vercel/node runtime — either way we can read the event id).
  var incoming = null;
  try {
    incoming = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody || "{}");
  } catch (e) {
    incoming = null;
  }
  if (!incoming) return { status: 400, body: { error: "invalid payload" } };

  // Authenticate the event. Primary method: re-fetch it from Stripe by id
  // (robust against body parsing). Fallback: HMAC signature on the raw body.
  var event = null;
  var verified = false;
  if (c.secret && incoming.id && String(incoming.id).indexOf("evt_") === 0) {
    try {
      event = await stripe.retrieveEvent(c.secret, incoming.id);
      verified = true;
    } catch (e) {
      /* fall through to signature check */
    }
  }
  if (!verified && c.webhookSecret && webhook.verifySignature(rawBody, sigHeader, c.webhookSecret, 300)) {
    event = incoming;
    verified = true;
  }
  if (!verified || !event) {
    return { status: 400, body: { error: "unverified webhook" } };
  }

  var obj = (event.data && event.data.object) || {};

  try {
    if (event.type === "checkout.session.completed" && obj.mode === "subscription") {
      var userId = (obj.metadata && obj.metadata.user_id) || obj.client_reference_id;
      if (userId) {
        var patch = {
          stripe_customer_id: obj.customer || null,
          stripe_subscription_id: obj.subscription || null,
          subscription_status: "active",
        };
        if (obj.metadata && obj.metadata.plan) patch.plan = obj.metadata.plan;
        // Enrich with the subscription details (renewal date + plan from price).
        if (obj.subscription && c.secret) {
          try {
            var sub = await stripe.retrieveSubscription(c.secret, obj.subscription);
            if (sub && sub.current_period_end) patch.current_period_end = new Date(sub.current_period_end * 1000).toISOString();
            var priceId = sub && sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.id;
            var planFromPrice = planForPrice(priceId);
            if (planFromPrice) patch.plan = planFromPrice;
          } catch (e) { /* period end will fill in on the next subscription event */ }
        }
        await db.update("users", { id: userId }, patch);
      }
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      var status = obj.status || "canceled";
      var patch2 = { subscription_status: status };
      var deleted = event.type === "customer.subscription.deleted" || status === "canceled";
      if (deleted) patch2.plan = "free";
      var priceId = obj.items && obj.items.data && obj.items.data[0] && obj.items.data[0].price && obj.items.data[0].price.id;
      var plan = planForPrice(priceId);
      if (!deleted && plan) patch2.plan = plan;
      if (obj.current_period_end) patch2.current_period_end = new Date(obj.current_period_end * 1000).toISOString();
      if (obj.customer) await db.update("users", { stripe_customer_id: obj.customer }, patch2);
    }
  } catch (e) {
    // Log but still ack, so Stripe doesn't hammer us with retries on a DB blip.
    console.error("[Exceptionel][billing] webhook update failed →", e && e.message);
  }
  return { status: 200, body: { received: true, type: event.type } };
}

function status() {
  var c = cfg();
  var keyType = c.secret ? (c.secret.indexOf("sk_live") === 0 ? "live" : c.secret.indexOf("sk_test") === 0 ? "test" : "set") : "none";
  return {
    configured: isConfigured(),
    key_type: keyType,
    plans: { starter: !!c.prices.starter, pro: !!c.prices.pro },
    webhook_configured: !!c.webhookSecret,
  };
}

module.exports = { checkout, portal, handleWebhook, isConfigured, planForPrice, status };

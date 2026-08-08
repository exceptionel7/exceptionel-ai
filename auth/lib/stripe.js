/*
 * stripe.js — Minimal Stripe client (zero dependency), for the auth/billing module.
 *
 * Calls the Stripe API over native https. Stripe expects x-www-form-urlencoded
 * data (nested params use brackets). Used here for SaaS subscription billing:
 *   - Checkout Sessions in "subscription" mode (merchant subscribes to a plan)
 *   - Billing Portal sessions (merchant manages/cancels their subscription)
 * The secret key (sk_...) stays server-side.
 */

const https = require("https");

// Encodes a list of [key, value] pairs into Stripe form-urlencoded format.
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
 * Creates a Stripe Checkout Session in subscription mode for a SaaS plan.
 * @param {string} secretKey
 * @param {Object} opts { priceId, quantity, successUrl, cancelUrl, customer, customerEmail, userId, plan }
 */
function createSubscriptionSession(secretKey, opts) {
  opts = opts || {};
  var pairs = [
    ["mode", "subscription"],
    ["success_url", opts.successUrl],
    ["cancel_url", opts.cancelUrl],
    ["line_items[0][price]", opts.priceId],
    ["line_items[0][quantity]", opts.quantity || 1],
    ["allow_promotion_codes", "true"],
  ];
  // Reuse the existing Stripe customer if the merchant already has one,
  // otherwise let Stripe create one from the email.
  if (opts.customer) pairs.push(["customer", opts.customer]);
  else if (opts.customerEmail) pairs.push(["customer_email", opts.customerEmail]);

  // Attach the merchant so the webhook can map the subscription back.
  if (opts.userId) {
    pairs.push(["client_reference_id", opts.userId]);
    pairs.push(["metadata[user_id]", opts.userId]);
    pairs.push(["subscription_data[metadata][user_id]", opts.userId]);
  }
  if (opts.plan) {
    pairs.push(["metadata[plan]", opts.plan]);
    pairs.push(["subscription_data[metadata][plan]", opts.plan]);
  }
  return stripeRequest(secretKey, "POST", "/v1/checkout/sessions", pairs);
}

/**
 * Creates a Stripe Billing Portal session so the merchant can manage/cancel
 * their subscription and update their payment method.
 */
function createPortalSession(secretKey, customerId, returnUrl) {
  return stripeRequest(secretKey, "POST", "/v1/billing_portal/sessions", [
    ["customer", customerId],
    ["return_url", returnUrl],
  ]);
}

function retrieveSubscription(secretKey, id) {
  return stripeRequest(secretKey, "GET", "/v1/subscriptions/" + encodeURIComponent(id), null);
}

module.exports = {
  createSubscriptionSession,
  createPortalSession,
  retrieveSubscription,
  stripeRequest,
  encodeForm,
};

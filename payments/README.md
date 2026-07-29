# Exceptionel AI — Module Paiements (Stripe)

Gère les **paiements et les commandes** : paiement d'un produit (Stripe Checkout),
abonnement SaaS, webhook de confirmation, suivi des commandes.

**Zéro dépendance** : appels à l'API Stripe via `https` natif, vérification des
webhooks via le module `crypto` natif. Fonctionne en **mode démo** (paiement
simulé) tant que la clé Stripe n'est pas fournie.

---

## 🚀 Lancer en local

```bash
cd payments
node server.js
```

Ouvre **http://localhost:6000** : clique « Acheter ». En démo, le paiement est
simulé et une commande apparaît. Avec une clé Stripe, tu es redirigé vers la
vraie page Stripe Checkout.

---

## 🔑 Variables d'environnement

| Variable | Rôle | Sans elle |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Paiements réels (`sk_test_...` puis `sk_live_...`) | Paiement **simulé** (démo) |
| `STRIPE_WEBHOOK_SECRET` | Vérifie la signature des webhooks (`whsec_...`) | Webhook accepté sans vérif (démo) |
| `STRIPE_CURRENCY` | Devise (défaut `eur`) | `eur` |
| `PUBLIC_BASE_URL` | URL de retour si l'origine n'est pas transmise | — |

> 💡 Utilise d'abord une clé **`sk_test_...`** et les [cartes de test Stripe](https://stripe.com/docs/testing) (ex. `4242 4242 4242 4242`).

---

## 🔌 API

| Méthode & route | Rôle |
| --- | --- |
| `POST /api/checkout` | `{ product, quantity?, mode?, priceId?, email?, origin }` → `{ url }` (redirection Checkout) |
| `POST /api/webhook` | Webhook Stripe (corps **brut** + signature) → enregistre la commande |
| `GET  /api/orders` | Liste des commandes |
| `GET  /api/health` | État (mode paiements, type de clé, webhook) |

- **Paiement produit** : `mode` omis → utilise `price_data` (pas besoin de créer le produit dans Stripe).
- **Abonnement SaaS** : `mode: "subscription"` + `priceId` (un Price récurrent créé dans Stripe).

---

## 🪝 Configurer le webhook Stripe

1. Déploie le module (Vercel) → note l'URL, ex. `https://exceptionel-pay.vercel.app`
2. Dans le **Dashboard Stripe → Developers → Webhooks → Add endpoint** :
   - URL : `https://exceptionel-pay.vercel.app/api/webhook`
   - Événement : **`checkout.session.completed`**
3. Copie le **Signing secret** (`whsec_...`) → variable `STRIPE_WEBHOOK_SECRET` sur Vercel → Redeploy.

Le corps brut est préservé (body parser désactivé) pour que la vérification de
signature fonctionne.

---

## ▲ Déploiement Vercel

1. **Add New… → Project → Import** `exceptionel7/exceptionel-ai`
2. **Root Directory** = `payments`
3. **Environment Variables** : `STRIPE_SECRET_KEY` (+ `STRIPE_WEBHOOK_SECRET` après config du webhook)
4. **Deploy**

---

## 🔗 Relier au chatbot de vente

L'outil `create_checkout` du chatbot peut appeler `POST /api/checkout` de ce
module pour produire de **vrais liens de paiement** dans la conversation (au lieu
du lien simulé). Il suffit de pointer le chatbot vers l'URL de ce module.

---

## 🗂️ Structure

```
payments/
├── index.html        Démo boutique + suivi des commandes
├── server.js         Serveur Node classique
├── vercel.json       Config Vercel
├── api/
│   └── index.js      Fonction serverless (body parser désactivé pour le webhook)
└── lib/
    ├── stripe.js     Client Stripe natif (Checkout Sessions)
    ├── webhook.js    Vérification de signature (HMAC-SHA256, crypto natif)
    └── engine.js     Config + checkout + webhook + commandes
```

> ⚠️ Prototype : commandes en mémoire. En production → PostgreSQL + notifications
> marchand (voir `../ARCHITECTURE.md`).


---

## 🗄️ Persistence & merchant accounts (optional)

By default, orders are stored **in memory** (demo). To persist them **durably**
and scope them **per merchant**, set the SAME variables as the `auth` module:

| Variable | Role |
| --- | --- |
| `AUTH_JWT_SECRET` | Verify the merchant JWT — **must be identical on every module** |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase `service_role` key (server only) |

Run `../auth/schema.sql` once in Supabase to create the tables.

When creating a checkout (`POST /api/checkout`), send the merchant JWT as
`Authorization: Bearer <token>` (or a `merchantId` in the body). The merchant id
is stored in the Stripe session `metadata.user_id` + `client_reference_id`, so the
`checkout.session.completed` webhook records the order under the right merchant.
`GET /api/orders` returns only that merchant's orders (by token, or `?merchantId=`).

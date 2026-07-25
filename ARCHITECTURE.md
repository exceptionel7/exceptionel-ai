# Exceptionel AI — Architecture technique

Plateforme SaaS qui aide les petites entreprises à **conclure la vente directement
sur leur site** grâce à l'IA : génération de contenu marketing, **génération de
vidéos marketing avec publication automatique sur les réseaux sociaux**, chatbot
de vente embarquable, dashboard, paiements Stripe.

---

## 1. Vue d'ensemble

```
                        ┌──────────────────────────────────────────────┐
                        │                  CLIENTS                       │
                        │                                                │
   Site du marchand     │   Dashboard (React SPA)      Widget de chat    │
   (n'importe quel      │   app.exceptionel.ai         embed.js (vanilla)│
    site + <script>)    │        │                          │           │
                        └────────┼──────────────────────────┼───────────┘
                                 │ HTTPS/JSON                │ HTTPS/JSON
                                 ▼                           ▼
                        ┌────────────────────────────────────────────────┐
                        │              API Gateway (Express)              │
                        │  Auth JWT · Rate limiting · CORS · Validation   │
                        └───────┬───────────────┬───────────────┬────────┘
                                │               │               │
                     ┌──────────▼───┐  ┌────────▼────────┐  ┌───▼──────────┐
                     │ Content svc  │  │  Sales chatbot  │  │ Billing svc  │
                     │ (Claude txt) │  │  svc (Claude +  │  │  (Stripe)    │
                     │              │  │  function call) │  │              │
                     └──────┬───────┘  └───────┬─────────┘  └──────┬───────┘
                            │                  │                   │
                            └──────────┬───────┴─────────┬─────────┘
                                       ▼                 ▼
                              ┌────────────────┐  ┌──────────────┐
                              │   PostgreSQL   │  │  Redis (cache│
                              │  (données)     │  │  + sessions) │
                              └────────────────┘  └──────────────┘
                                       │
                              ┌────────▼────────┐
                              │  Anthropic API  │  Stripe API
                              │  (Claude)       │
                              └─────────────────┘
```

---

## 2. Composants

### 2.1 Frontend — React

Deux applications distinctes (monorepo, ex. Turborepo / pnpm workspaces) :

- **Dashboard** (`apps/dashboard`) — React + Vite + TypeScript, React Router,
  TanStack Query (data fetching/cache), Tailwind. C'est l'app à laquelle le
  marchand se connecte : configuration marque/ton, catalogue, conversations,
  leads, stats, facturation.
- **Widget** (`apps/widget`) — build séparé, ultra-léger, sans dépendance lourde,
  compilé en un seul fichier `embed.js` (< 30 Ko gzip). Injecté sur le site du
  client via un `<script>`. Isolé dans un **Shadow DOM** pour ne pas entrer en
  conflit avec le CSS du site hôte.

> Le **prototype** de ce dépôt écrit le widget en vanilla JS (pas de build) :
> c'est la même approche que la version de prod, sans l'étape de bundling.

### 2.2 Backend — Node.js / Express (TypeScript)

Découpé en services logiques (déployables en monolithe modulaire au départ,
séparables plus tard) :

| Service          | Rôle                                                            |
| ---------------- | --------------------------------------------------------------- |
| **auth**         | Inscription, login, JWT (access + refresh), gestion org/users   |
| **content**      | Génération de contenu marketing via Claude (posts, emails…)     |
| **video**        | Script vidéo (Claude) → rendu via API tierce (Runway/HeyGen) → job async |
| **social**       | Publication auto (Instagram/TikTok/Facebook) + gestion des connexions OAuth |
| **chatbot**      | Cœur du produit : conversation de vente + Claude function calling |
| **catalog**      | CRUD produits, import (JSON, Shopify), embeddings pour recherche |
| **leads**        | Enregistrement et suivi des leads qualifiés                     |
| **billing**      | Abonnements Stripe + webhooks + quotas                          |
| **orders**       | Commandes, checkout Stripe, suivi, notifications                |
| **analytics**    | Agrégats : conversion, messages, vidéos publiées, ventes        |

### 2.3 Base de données — PostgreSQL

ORM : **Prisma** (migrations, typage). Redis pour cache/sessions/rate-limit.
Recherche produits : `pgvector` (embeddings) + recherche plein-texte comme repli.

---

## 3. Modèle de données (schéma simplifié)

```sql
organizations         -- le compte marchand (multi-tenant)
  id, name, plan, stripe_customer_id, created_at

users
  id, org_id → organizations, email, password_hash, role, created_at

brand_profiles        -- config IA de la marque
  id, org_id, brand_name, tone, target_audience, languages, value_props(jsonb)

products              -- catalogue
  id, org_id, external_id, name, description, price_cents, currency,
  category, tags(text[]), image_url, url, stock, embedding(vector), metadata(jsonb)

conversations
  id, org_id, visitor_id, channel, status, started_at, last_at, meta(jsonb)

messages
  id, conversation_id → conversations, role('user'|'assistant'|'tool'),
  content(text), tool_calls(jsonb), created_at

leads                 -- prospects qualifiés par le chatbot
  id, org_id, conversation_id, email, name, need, budget_cents,
  score, status('new'|'qualified'|'won'|'lost'), created_at

orders
  id, org_id, conversation_id, lead_id, stripe_payment_intent,
  amount_cents, currency, status, items(jsonb), created_at

api_keys              -- clés publiques du widget + clés serveur
  id, org_id, public_key, secret_hash, domain_allowlist(text[]), created_at

usage_events          -- quotas & analytics
  id, org_id, type, quantity, created_at

videos                -- vidéos marketing générées
  id, org_id, product_id → products, script(jsonb), provider,
  provider_job_id, status('draft'|'rendering'|'ready'|'failed'),
  video_url, caption, hashtags(text[]), created_at

social_accounts       -- comptes réseaux sociaux connectés (OAuth)
  id, org_id, platform('instagram'|'tiktok'|'facebook'),
  account_ref, access_token(chiffré), refresh_token(chiffré),
  token_expires_at, scopes(text[]), created_at

video_publications    -- publication d'une vidéo sur une plateforme
  id, org_id, video_id → videos, social_account_id → social_accounts,
  platform, status('queued'|'published'|'failed'), external_post_id,
  post_url, error, published_at
```

Index clés : `products(org_id)`, `products USING ivfflat (embedding)`,
`conversations(org_id, status)`, `leads(org_id, status)`.

---

## 4. API REST (extrait)

```
POST /v1/auth/register            → crée org + user, renvoie tokens
POST /v1/auth/login

# Marque & catalogue (dashboard, JWT)
GET/PUT /v1/brand
GET/POST/PUT/DELETE /v1/products
POST    /v1/products/import       → { source: 'shopify'|'json', url|data }

# Contenu marketing
POST /v1/content/generate         → { type, product, tone, audience } ⇒ variations

# Vidéo marketing
POST /v1/video/script             → { productId, brand } ⇒ script structuré (Claude)
POST /v1/video/generate           → { productId, provider, platforms[] } ⇒ job vidéo + publications
GET  /v1/video/:id                → statut + url de la vidéo
POST /v1/webhooks/video           → callback du fournisseur vidéo (rendu terminé)

# Connexions réseaux sociaux (OAuth) + publication
GET  /v1/social/accounts          → comptes connectés
GET  /v1/social/connect/:platform → démarre l'OAuth (Meta / TikTok)
GET  /v1/social/callback/:platform→ callback OAuth (stocke les tokens chiffrés)
POST /v1/social/publish           → { videoId, platforms[] } ⇒ publications

# Chatbot (appelé par le widget, auth par public_key + origine)
POST /v1/chat                     → { sessionId, message } ⇒ { reply, products, actions }
POST /v1/chat/lead                → capture lead
GET  /v1/conversations            → historique (dashboard)
GET  /v1/leads                    → leads (dashboard)

# Paiement
POST /v1/checkout                 → crée une session/Payment Intent Stripe
POST /v1/webhooks/stripe          → événements Stripe (signature vérifiée)
GET  /v1/orders

# Analytics
GET  /v1/analytics/overview       → conversion, msgs, ventes
```

Sécurité widget : chaque requête `/v1/chat` porte la **clé publique** de l'org ;
le backend vérifie l'`Origin`/`Referer` contre `domain_allowlist`. Les clés
secrètes (Anthropic, Stripe) ne quittent **jamais** le serveur.

---

## 5. Cœur : le chatbot de vente avec Claude (function calling)

Le chatbot ne se contente pas de répondre : il **agit** via des outils
(function calling) que le backend exécute.

### 5.1 Outils exposés à Claude

```jsonc
[
  {
    "name": "search_products",
    "description": "Recherche dans le catalogue du marchand les produits pertinents.",
    "input_schema": { "query": "string", "max_price_cents": "number?", "limit": "number?" }
  },
  {
    "name": "capture_lead",
    "description": "Enregistre le prospect quand on a au moins un email ou un besoin clair.",
    "input_schema": { "email": "string?", "name": "string?", "need": "string?", "budget_cents": "number?" }
  },
  {
    "name": "create_checkout",
    "description": "Crée un lien de paiement Stripe pour conclure la vente.",
    "input_schema": { "product_id": "string", "quantity": "number" }
  }
]
```

### 5.2 Boucle de conversation (tool loop)

```
1. Widget → POST /v1/chat { sessionId, message }
2. Backend charge l'historique + le system prompt (marque, ton, règles de vente)
3. Appel Claude(messages, tools)
4. Si stop_reason = "tool_use" :
     - le backend EXÉCUTE l'outil (search_products → PostgreSQL/pgvector,
       capture_lead → INSERT leads, create_checkout → Stripe)
     - renvoie le tool_result à Claude
     - retour à l'étape 3 (jusqu'à réponse finale)
5. Claude produit le message final (texte + éventuels produits/CTA)
6. Backend persiste messages, renvoie { reply, products, actions } au widget
```

### 5.3 System prompt (esprit)

- Rôle : vendeur expert et honnête de {brand_name}, ton {tone}.
- Objectif : comprendre le besoin, recommander 1–3 produits pertinents,
  lever les objections (prix, doute, livraison), **proposer de conclure**.
- Toujours s'appuyer sur `search_products` — ne jamais inventer de produit/prix.
- Qualifier : obtenir email + besoin + budget quand l'intérêt est réel, via
  `capture_lead`.
- Proposer `create_checkout` dès qu'un produit est choisi.

> Le **prototype hors-ligne** de ce dépôt reproduit exactement cette logique
> d'outils (recherche catalogue, capture lead, checkout simulé) sans appeler
> Claude, pour être démontrable sans clé ni réseau.

---

## 6. Génération vidéo marketing & publication sociale

Module qui transforme une fiche produit en une **vidéo courte prête à publier**,
puis la diffuse automatiquement sur les réseaux sociaux du marchand.

### 6.1 Pipeline

```
1. Script    : product + brand  → Claude → script structuré
               { hook, body, cta, voiceover, caption, hashtags, durationSec }
2. Rendu     : script → API vidéo tierce (Runway / HeyGen) → job asynchrone
               (le rendu prend du temps → polling ou webhook /v1/webhooks/video)
3. Stockage  : la vidéo prête est enregistrée (URL) dans `videos`
4. Publication: pour chaque plateforme choisie → API officielle → `video_publications`
```

### 6.2 Abstraction fournisseur vidéo

Interface commune `generateVideo({ provider, script, productImage, avatar, voice })`
avec des adaptateurs interchangeables :

- **HeyGen** — vidéos avatar/voix-off (`POST /v2/video/generate`, header `X-Api-Key`,
  puis polling du statut).
- **Runway** — génération image→vidéo (`POST /v1/image_to_video`, `Bearer`,
  puis polling de la tâche).
- **mock** — repli sans clé : renvoie une vidéo simulée (pour la démo).

### 6.3 Publication (APIs officielles)

- **Instagram Reels** (Meta Graph API) : créer un conteneur média
  (`POST /{ig-user-id}/media` avec `media_type=REELS`, `video_url`, `caption`),
  puis publier (`POST /{ig-user-id}/media_publish`).
- **Facebook Page** : `POST /{page-id}/videos` (`file_url`, `description`).
- **TikTok** (Content Posting API) : `POST /v2/post/publish/video/init/` puis upload.

Chaque plateforme requiert un **token OAuth par compte connecté** (table
`social_accounts`, tokens chiffrés au repos). Le service `social` gère le flux
OAuth, le rafraîchissement des tokens et le mapping vers les publications.

### 6.4 Contraintes réelles (à anticiper)

- **Revue d'application obligatoire** : la publication de contenu nécessite
  l'approbation des plateformes (permissions Meta `instagram_content_publish` /
  `pages_manage_posts` ; scope TikTok `video.publish`). Prévoir le processus de
  validation avant la mise en production.
- **Rendu asynchrone** : la génération vidéo est longue → file d'attente (BullMQ/
  Redis) + webhooks, jamais un appel bloquant dans la requête HTTP.
- **Coûts** : APIs vidéo facturées à la génération → quotas par plan + suivi.
- **Formats** : respecter ratios/durées par plateforme (Reels/TikTok 9:16, ≤ 90 s).

> Le **prototype** de ce dépôt (`marketing-video/`) implémente réellement la
> **génération de script** (Claude + repli hors-ligne) et fournit des
> **adaptateurs vidéo/sociaux prêts à brancher**, avec un **mode mock** qui simule
> le rendu et la publication de bout en bout — démontrable sans clé ni réseau.

---

## 7. Paiement & commandes (Stripe)

- **Abonnement SaaS** (le marchand paie Exceptionel AI) : Stripe Billing,
  plans (Starter/Pro/Business), quotas de messages via `usage_events`,
  webhooks pour synchroniser l'état d'abonnement.
- **Ventes du marchand** (le visiteur achète) : `create_checkout` crée un
  Stripe Checkout / Payment Intent ; `/v1/webhooks/stripe` confirme le paiement,
  crée l'`order`, notifie le marchand (email/websocket), met à jour les stats.
- Sécurité : vérification de la **signature** des webhooks, idempotency keys.

---

## 8. Sécurité & conformité

- Secrets côté serveur uniquement (Anthropic, Stripe), via variables d'env / vault.
- JWT courts + refresh tokens ; hachage mots de passe (argon2/bcrypt).
- CORS strict + allowlist de domaines par clé publique de widget.
- Rate limiting (Redis) par IP et par clé.
- Validation d'entrée (zod) ; requêtes SQL paramétrées (Prisma).
- RGPD : consentement, export/suppression des leads, rétention configurable.
- Tokens OAuth réseaux sociaux **chiffrés au repos** ; jamais exposés au frontend.

---

## 9. Déploiement

- **Frontend** : Vercel / Netlify (dashboard) + CDN pour `embed.js`.
- **Backend** : conteneurs (Docker) sur Render/Railway/Fly.io/ECS ; autoscaling.
- **DB** : PostgreSQL managé (Neon/Supabase/RDS) + Redis managé.
- **CI/CD** : GitHub Actions (lint, tests, migrations Prisma, build, déploiement).
- **Observabilité** : logs structurés, Sentry (erreurs), métriques (conversion,
  latence Claude, coût tokens).

---

## 10. Feuille de route (incrémentale)

> Principe : **développer et tester un module à la fois**, en commençant par le
> cœur différenciant (le chatbot de vente).

1. ✅ **Prototype chatbot de vente** (`sales-chatbot/`) : widget + backend +
   recommandation + qualification de lead, Claude function calling avec repli
   hors-ligne, déployé sur Vercel. ← *cœur différenciant*
2. ✅ **Prototype génération vidéo** (`marketing-video/`) : script via Claude +
   repli hors-ligne, adaptateurs Runway/HeyGen et Meta/TikTok, mode mock de bout
   en bout.
3. Auth + multi-tenant + persistance PostgreSQL (conversations, leads, vidéos).
4. Dashboard React (marque, catalogue, conversations, contenu, vidéos, stats).
5. Intégration Claude en production (function calling + pgvector).
6. Intégrations réelles : fournisseur vidéo + OAuth réseaux sociaux (après revue
   d'application des plateformes).
7. Stripe : abonnements + checkout des ventes + webhooks.
8. Analytics & notifications temps réel.

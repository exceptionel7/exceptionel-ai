# Exceptionel AI — Module Génération Vidéo Marketing

Transforme une **fiche produit** en une **vidéo courte prête à publier**, puis la
diffuse automatiquement sur **Instagram, TikTok et Facebook**.

Pipeline : `produit → script (Claude) → rendu vidéo (Runway/HeyGen) → publication (Meta/TikTok)`.

Comme le reste du projet, ce module est **exécutable sans dépendance** et
fonctionne en **mode démo** (script réel + rendu/publication simulés) tant que
les clés ne sont pas configurées.

---

## 🚀 Lancer en local

```bash
cd marketing-video
node server.js
```

Ouvre **http://localhost:5000** : saisis un produit, choisis les réseaux, clique
sur « Générer la vidéo ». Tu verras le **script**, la **vidéo** (simulée en démo)
et les **publications**.

---

## 🔑 Clés d'environnement (fichier `.env` en local, variables sinon)

| Variable | Rôle | Sans elle |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Script généré par Claude | Repli hors-ligne (gabarits) |
| `ANTHROPIC_MODEL` | Modèle Claude (défaut `claude-sonnet-5`) | — |
| `HEYGEN_API_KEY` | Rendu vidéo avatar/voix-off (HeyGen) | Vidéo simulée (mock) |
| `HEYGEN_AVATAR_ID` / `HEYGEN_VOICE_ID` | Avatar et voix HeyGen à utiliser | Requis pour un vrai rendu HeyGen |
| `RUNWAY_API_KEY` | Rendu vidéo Runway (modèle `gen4.5` : texte OU image → vidéo) | Vidéo simulée (mock) |
| `RUNWAY_MODEL` / `RUNWAY_RATIO` / `RUNWAY_DURATION` / `RUNWAY_VERSION` | Réglages Runway (optionnels) | `gen4.5` / `720:1280` / `5` / `2024-11-06` |
| `META_ACCESS_TOKEN` + `META_IG_USER_ID` | Publication Instagram Reels | Publication simulée |
| `META_ACCESS_TOKEN` + `META_FB_PAGE_ID` | Publication Facebook Page | Publication simulée |
| `TIKTOK_ACCESS_TOKEN` | Publication TikTok | Publication simulée |

> Le choix du fournisseur vidéo est automatique : HeyGen si sa clé est présente,
> sinon Runway, sinon mock. Forçable via le champ `provider` de la requête.

---

## 🔌 API

| Méthode & route | Rôle |
| --- | --- |
| `POST /api/script` | `{ product, brand }` → script structuré uniquement |
| `POST /api/generate` | `{ product, brand, platforms[], provider }` → pipeline complet |
| `GET  /api/videos` | Vidéos générées (prototype : en mémoire) |
| `GET  /api/health` | État des intégrations (script/vidéo/réseaux) |

Exemple :

```bash
curl -X POST http://localhost:5000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"product":{"name":"Casque Serenity","description":"Sans fil, réduction de bruit","price_cents":19900},"platforms":["instagram","tiktok"]}'
```

---

## ▲ Déploiement Vercel

Identique au module chatbot :
1. **Root Directory** = `marketing-video`
2. **Framework Preset** = `Other`
3. Ajouter les variables d'environnement voulues (au minimum `ANTHROPIC_API_KEY`)
4. Déployer, puis vérifier `/(api)/health`.

`vercel.json` déclare la fonction (`api/index.js`) et la page statique
(`index.html`) ; `/api/*` est routé vers la fonction.

---

## ⚠️ À anticiper pour la production (voir `../ARCHITECTURE.md` §6)

- **Rendu asynchrone** : la génération vidéo est longue → file d'attente + webhook,
  jamais un appel bloquant. Ce prototype renvoie un `jobId` + statut ; `pollVideo()`
  récupère l'URL finale.
- **Revue d'application** obligatoire pour publier : permissions Meta
  (`instagram_content_publish`, `pages_manage_posts`) et scope TikTok
  (`video.publish`). Prévoir ce processus avant la mise en production.
- **OAuth par compte** : chaque réseau nécessite un token du compte connecté
  (stocké chiffré, table `social_accounts`).
- **Coûts & formats** : APIs vidéo facturées à la génération ; respecter 9:16 et
  la durée max par plateforme.

---

## 🗂️ Structure

```
marketing-video/
├── index.html               Démo (produit → script → vidéo → publications)
├── server.js                Serveur Node classique (local, Render…)
├── vercel.json              Config Vercel (statique + fonction)
├── api/
│   └── index.js             Fonction serverless Vercel
└── lib/
    ├── ai.js                Client Claude (texte, JSON)
    ├── script-generator.js  Script vidéo (Claude + repli hors-ligne)
    ├── video-providers.js   Adaptateurs HeyGen / Runway + mock
    ├── social-publishers.js Publication Meta (IG/FB) / TikTok + mock
    ├── pipeline.js          Orchestration script → vidéo → publication
    └── engine.js            Config + actions (partagé serveur/serverless)
```


---

## 🗄️ Persistence & merchant accounts (optional)

By default, generated videos are stored **in memory** (demo). To persist them
**durably** and scope them **per merchant**, set the SAME variables as the
`auth` module:

| Variable | Role |
| --- | --- |
| `AUTH_JWT_SECRET` | Verify the merchant JWT — **must be identical on every module** |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase `service_role` key (server only) |

Run `../auth/schema.sql` once in Supabase to create the tables.

Send the merchant JWT as `Authorization: Bearer <token>` (or a `merchantId` in
the body) when calling `POST /api/generate`. `GET /api/videos` then returns only
that merchant's videos (by token, or `?merchantId=<user_id>`).

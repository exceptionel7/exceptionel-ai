# Exceptionel AI — Dashboard client

Vue centralisée qui réunit les modules d'Exceptionel AI : **statistiques**,
**prospects** (leads du chatbot), **vidéos** générées, **configuration de la
marque** et **catalogue produits**.

SPA **vanilla, zéro dépendance**. Le dashboard interroge en direct les APIs des
modules déployés (chatbot + vidéo) — aucune donnée n'est dupliquée.

---

## 🚀 Lancer en local

Sers simplement les fichiers statiques (n'importe quel serveur). Exemple :

```bash
cd dashboard
python3 -m http.server 8080     # ou: npx serve .
```

Puis ouvre **http://localhost:8080**, va dans **⚙️ Réglages** et renseigne les
URLs de tes modules.

---

## 🔗 Connexion aux modules

Dans **Réglages**, saisis :

| Champ | Exemple |
| --- | --- |
| URL du module Chatbot | `https://exceptionel-ai.vercel.app` |
| URL du module Vidéo   | `https://exceptionel-video.vercel.app` |

Les URLs sont mémorisées dans le navigateur (`localStorage`). Le dashboard
appelle `/api/health`, `/api/leads` (chatbot) et `/api/videos` (vidéo). Le CORS
est déjà ouvert côté modules.

---

## 📊 Ce que tu peux faire

- **Vue d'ensemble** : KPIs (prospects, qualifiés, vidéos, publications) + état en
  direct de chaque module.
- **Prospects** : tableau des leads (email, besoin, budget, score, statut).
- **Vidéos** : vidéos générées + leurs publications par réseau.
- **Marque** : nom, ton, public, arguments clés (mémorisés localement).
- **Catalogue** : édite tes produits en JSON, et pousse-les dans le chatbot
  (session démo) via `/api/config`.

---

## ▲ Déploiement Vercel

1. **Add New… → Project → Import** `exceptionel7/exceptionel-ai`
2. **Root Directory** = `dashboard`
3. **Application Preset** = `Node` (le `vercel.json` gère le statique)
4. **Deploy**

> ⚠️ Prototype : les modules stockent leurs données en mémoire (elles peuvent se
> réinitialiser). En production, le dashboard lira les données persistées en
> PostgreSQL via le backend (voir `../ARCHITECTURE.md`).

---

## 🗂️ Structure

```
dashboard/
├── index.html    Structure + navigation par onglets
├── styles.css    Thème sombre
├── app.js        Logique (fetch modules, KPIs, tableaux, config locale)
├── vercel.json   Sert les fichiers statiques
└── README.md
```

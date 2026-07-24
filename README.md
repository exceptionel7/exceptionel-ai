# Exceptionel AI ✦

Studio marketing propulsé par l'IA pour la boutique e-commerce **exceptionel.com**.

Plusieurs outils en un, dans une interface web moderne :

- **✍️ Générateur de contenu** — descriptions produits, articles de blog, posts réseaux sociaux et emails marketing, avec choix du ton.
- **🖼️ Générateur de visuels** — crée des images de posts prêtes à publier (1080×1080) via le Canvas, téléchargeables en PNG.
- **📅 Calendrier de publication** — planifiez vos posts par date et par plateforme (stocké dans le navigateur).
- **🌍 Bilingue FR / EN** — toute l'interface et le contenu généré basculent entre français et anglais.
- **🔗 Catalogue en temps réel** — connectez vos vrais produits depuis une URL JSON (compatible Shopify `/products.json`).
- **💬 Assistant commercial (chatbot)** — répond aux visiteurs, recommande des produits et les oriente vers l'achat.

L'application est **autonome et sans aucune dépendance** (HTML + CSS + JavaScript). Elle fonctionne même hors-ligne grâce à un moteur « démo » intégré, et bascule automatiquement sur une **vraie IA** dès qu'une clé API est fournie.

---

## 🚀 Démarrage rapide

### Option 1 — Ouvrir directement (le plus simple, pour une démo)

Ouvrez `index.html` dans votre navigateur. Tout fonctionne en mode démo, sans rien installer.

### Option 2 — Avec le serveur local (recommandé)

Nécessite [Node.js](https://nodejs.org) (aucune installation de paquet requise).

```bash
node server.js
```

Puis ouvrez **http://localhost:3000**.

---

## 🤖 Activer la « vraie » IA (OpenAI)

Par défaut, l'app utilise son moteur démo. Pour générer du contenu avec une vraie IA :

1. Créez une clé API sur https://platform.openai.com
2. Lancez le serveur avec la clé :

```bash
export OPENAI_API_KEY="sk-votre-cle"
node server.js
```

Le badge en haut à droite passera de **« Mode démo »** à **« IA connectée »** dès la première génération.

Variables d'environnement disponibles :

| Variable         | Rôle                                   | Défaut        |
| ---------------- | -------------------------------------- | ------------- |
| `OPENAI_API_KEY` | Active la vraie IA                     | _(vide)_      |
| `OPENAI_MODEL`   | Modèle utilisé                         | `gpt-4o-mini` |
| `PORT`           | Port du serveur                        | `3000`        |

> 💡 Le code d'appel à l'IA est isolé dans `server.js`. On peut facilement le remplacer par un autre fournisseur (Anthropic Claude, Mistral, etc.).

---

## 🔗 Connecter votre vrai catalogue (temps réel)

Dans l'onglet **Réglages**, collez l'URL d'un flux produits JSON puis cliquez sur
« Charger le catalogue ». Tout le contenu et le chatbot utiliseront alors vos vrais
produits. L'URL est mémorisée : le catalogue est rechargé automatiquement à la
prochaine visite.

Formats acceptés :

- **Shopify** — `https://votre-boutique.com/products.json` (CORS ouvert par défaut)
- **Tableau JSON** de produits
- **Objet** `{ "products": [...] }` ou `{ "items": [...] }`

> ⚠️ La boutique cible doit autoriser le **CORS**. Shopify expose `/products.json`
> publiquement. Pour une API privée, prévoyez un proxy côté serveur.

## 🖼️ Générateur de visuels & 📅 Calendrier

- **Visuels** : choisissez un produit, une accroche et un style, puis téléchargez
  l'image PNG prête pour Instagram, Facebook, etc. (généré localement, sans IA payante).
  Le bouton « Planifier » du générateur de contenu envoie directement un post au calendrier.
- **Calendrier** : planifiez vos publications par date et plateforme. Les données
  sont stockées dans le navigateur (`localStorage`), aucune inscription requise.

## 🛍️ Utiliser vos vrais produits (fichier statique)

Vous pouvez aussi éditer directement le catalogue par défaut dans **`js/products.js`**.
Chaque produit suit ce format :

```js
{
  id: "mon-produit",
  name: "Nom du produit",
  category: "Catégorie",
  price: 49.9,
  currency: "EUR",
  tags: ["mot-clé1", "mot-clé2"],
  shortPitch: "Une phrase d'accroche.",
  features: ["Atout 1", "Atout 2"],
  audience: "À qui ça s'adresse",
  url: "https://exceptionel.com/produits/mon-produit"
}
```

---

## 🌐 Intégrer le chatbot à exceptionel.com

Pour ajouter l'assistant sur votre site existant, copiez le bloc `#chat-widget`
de `index.html`, les styles `.chat-*` de `styles.css`, et la partie chatbot de
`app.js` (avec `js/products.js`, `js/ai-engine.js`, `js/api.js`). Le widget est
autonome et flotte en bas à droite de la page.

---

## 📁 Structure du projet

```
exceptionel-ai/
├── index.html              Interface (dashboard, générateur, visuels, calendrier, produits, réglages, chatbot)
├── styles.css              Thème et mise en page
├── app.js                  Logique d'interface (câblage de tout)
├── server.js               Serveur optionnel (Node natif) + proxy IA OpenAI (texte & images)
├── js/
│   ├── products.js         Catalogue de démonstration
│   ├── store.js            Source de vérité du catalogue (rechargeable à chaud)
│   ├── i18n.js             Traductions de l'interface (FR / EN)
│   ├── ai-engine.js        Moteur "démo" hors-ligne bilingue (contenu + chatbot)
│   ├── visual-generator.js Génération d'images de posts (Canvas)
│   ├── calendar.js         Calendrier de publication (localStorage)
│   ├── catalog.js          Connexion catalogue temps réel (Shopify & JSON)
│   └── api.js              Couche API : vraie IA si dispo, sinon démo
└── README.md
```

---

## ☁️ Déployer pour présenter au public

- **Statique** (démo hors-ligne) : déposez le dossier sur **Netlify**, **Vercel**, **GitHub Pages** ou **Cloudflare Pages**. Aucune configuration.
- **Avec la vraie IA** : déployez sur une plateforme Node (Vercel, Render, Railway…) et définissez la variable `OPENAI_API_KEY` dans les paramètres. **Ne mettez jamais votre clé API dans le code** — utilisez toujours les variables d'environnement.

# Exceptionel AI — Prototype du chatbot de vente

Le **cœur différenciant** du produit : un widget de chat embarquable qui connaît
le catalogue du marchand, recommande les bons produits, lève les objections,
qualifie le prospect (email / besoin / budget) et **conclut la vente** dans la
conversation.

Ce prototype est **exécutable sans aucune dépendance** (Node.js natif + widget
vanilla). Il fonctionne hors-ligne grâce à un moteur de vente intégré, et bascule
automatiquement sur **Claude (Anthropic) avec function calling** dès qu'une clé
API est fournie.

---

## 🚀 Lancer le prototype

```bash
cd sales-chatbot
node server.js
```

Ouvrez **http://localhost:4000** : une boutique de démonstration avec le widget
intégré en bas à droite.

### Essayez cette conversation
1. « je cherche un casque pour voyager »
2. « c'est trop cher, j'ai un budget de 80 euros »
3. « mon email est prenom.nom@example.com »
4. « je le prends »

Puis consultez les prospects capturés : **http://localhost:4000/api/leads**

---

## 🤖 Activer Claude (function calling réel)

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
# optionnel : export ANTHROPIC_MODEL="claude-sonnet-4-20250514"
node server.js
```

Claude reçoit alors 3 outils que le backend **exécute réellement** :

| Outil              | Action exécutée par le backend                          |
| ------------------ | ------------------------------------------------------- |
| `search_products`  | Recherche/score dans le catalogue                       |
| `capture_lead`     | Enregistre le prospect (email, besoin, budget)          |
| `create_checkout`  | Prépare un lien de paiement (Stripe en production)      |

Si la clé est absente ou le réseau indisponible, le serveur bascule de façon
transparente sur le moteur hors-ligne (`lib/recommender.js`).

---

## 🧩 Intégrer le widget sur un site (une seule ligne)

```html
<script
  src="https://cdn.exceptionel.ai/embed.js"
  data-key="VOTRE_CLE_PUBLIQUE"
  data-api="https://api.exceptionel.ai"
  data-title="Conseiller Exceptionel"
  data-accent="#7c5cff"
></script>
```

Le widget s'isole dans un **Shadow DOM** (aucun conflit avec le CSS du site hôte).

---

## 📦 Fournir votre catalogue

Le chatbot répond à partir d'un catalogue JSON. Formats acceptés par produit :

```json
{
  "id": "sku-123",
  "name": "Nom du produit",
  "category": "Catégorie",
  "price_cents": 7900,
  "currency": "EUR",
  "tags": ["mot-clé", "keyword"],
  "description": "Description vendeuse et précise.",
  "image_url": "https://…",
  "url": "https://votre-boutique.com/produits/sku-123"
}
```

- **Prototype** : le catalogue de démo est `demo/catalog.sample.json`.
- **Par session** : `POST /api/config { sessionId, catalog, brand }`.
- **Production** : catalogue rattaché à l'organisation en base (voir `../ARCHITECTURE.md`).

---

## 🔌 API

| Méthode & route     | Rôle                                                        |
| ------------------- | ----------------------------------------------------------- |
| `POST /api/chat`    | `{ sessionId, message, catalog?, brand? }` → réponse + produits + actions |
| `POST /api/config`  | Associe un catalogue / une marque à une session             |
| `GET  /api/leads`   | Liste des prospects qualifiés                               |
| `GET  /api/health`  | État du service (mode Claude/hors-ligne, taille catalogue)  |

---

## 🗂️ Structure

```
sales-chatbot/
├── server.js               Backend zéro-dépendance (routes, sessions, bascule IA)
├── lib/
│   ├── recommender.js      Moteur de vente hors-ligne (recherche, objections, leads)
│   └── claude.js           Client Claude + function calling (natif https)
├── public/
│   └── embed.js            Widget embarquable (vanilla, Shadow DOM)
├── demo/
│   ├── index.html          Boutique de démonstration
│   └── catalog.sample.json Catalogue d'exemple
└── README.md
```

> ⚠️ Prototype : la persistance est **en mémoire**. En production, les
> conversations, leads et commandes sont stockés dans PostgreSQL, et les
> paiements passent par Stripe (voir `../ARCHITECTURE.md`).

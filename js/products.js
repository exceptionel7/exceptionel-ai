/*
 * products.js
 * Catalogue de démonstration pour exceptionel.com.
 * Remplace ces produits par les tiens (ou charge-les depuis ton API e-commerce).
 * Chaque produit alimente le générateur de contenu ET le chatbot.
 */

window.EXCEPTIONEL_PRODUCTS = [
  {
    id: "montre-horizon",
    name: "Montre Horizon",
    category: "Accessoires",
    price: 149.0,
    currency: "EUR",
    tags: ["montre", "watch", "acier", "élégant", "cadeau", "gift", "homme", "femme"],
    shortPitch: "Une montre en acier inoxydable au design épuré, étanche 5 ATM.",
    features: [
      "Boîtier en acier inoxydable 316L",
      "Étanche jusqu'à 50 mètres (5 ATM)",
      "Verre saphir anti-rayures",
      "Autonomie de 24 mois",
    ],
    audience: "Ceux qui aiment un style intemporel et raffiné",
    url: "https://exceptionel.com/produits/montre-horizon",
  },
  {
    id: "sac-nomade",
    name: "Sac à dos Nomade",
    category: "Bagagerie",
    price: 89.9,
    currency: "EUR",
    tags: ["sac", "backpack", "bag", "voyage", "travel", "ordinateur", "laptop", "imperméable", "pratique"],
    shortPitch: "Un sac à dos imperméable avec compartiment ordinateur 15\".",
    features: [
      "Tissu recyclé imperméable",
      "Compartiment matelassé pour ordinateur 15 pouces",
      "Port USB intégré",
      "Dos ergonomique et respirant",
    ],
    audience: "Les voyageurs et le télétravail nomade",
    url: "https://exceptionel.com/produits/sac-nomade",
  },
  {
    id: "casque-serenity",
    name: "Casque Serenity",
    category: "Audio",
    price: 199.0,
    currency: "EUR",
    tags: ["casque", "headphones", "headset", "audio", "musique", "music", "réduction de bruit", "sans fil", "wireless"],
    shortPitch: "Un casque sans fil à réduction de bruit active, 40h d'autonomie.",
    features: [
      "Réduction de bruit active (ANC)",
      "40 heures d'autonomie",
      "Son haute résolution",
      "Charge rapide : 10 min = 5 h d'écoute",
    ],
    audience: "Les mélomanes et ceux qui veulent du calme",
    url: "https://exceptionel.com/produits/casque-serenity",
  },
  {
    id: "bougie-aurea",
    name: "Bougie parfumée Aurea",
    category: "Maison",
    price: 29.5,
    currency: "EUR",
    tags: ["bougie", "candle", "maison", "home", "cadeau", "gift", "détente", "naturel"],
    shortPitch: "Une bougie en cire de soja naturelle, parfum vanille & bois de santal.",
    features: [
      "Cire de soja 100% naturelle",
      "Jusqu'à 50 heures de combustion",
      "Parfum vanille et bois de santal",
      "Mèche en coton sans plomb",
    ],
    audience: "Les amateurs d'ambiances cosy et de cadeaux",
    url: "https://exceptionel.com/produits/bougie-aurea",
  },
  {
    id: "gourde-pure",
    name: "Gourde isotherme Pure",
    category: "Lifestyle",
    price: 34.9,
    currency: "EUR",
    tags: ["gourde", "bottle", "sport", "écologique", "eco", "isotherme", "eau", "water"],
    shortPitch: "Une gourde isotherme qui garde le froid 24h et le chaud 12h.",
    features: [
      "Acier inoxydable double paroi",
      "Garde le froid 24 h, le chaud 12 h",
      "Sans BPA",
      "Bouchon anti-fuite",
    ],
    audience: "Les sportifs et les éco-responsables",
    url: "https://exceptionel.com/produits/gourde-pure",
  },
];

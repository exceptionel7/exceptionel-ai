/*
 * ai-engine.js
 * Moteur "IA" hors-ligne d'Exceptionel AI — BILINGUE (FR / EN).
 *
 * Génère du contenu marketing et fait tourner le chatbot SANS connexion ni clé
 * API. Il lit le catalogue courant via ProductStore (rechargeable à chaud) et
 * s'adapte à la langue demandée. Quand une vraie IA est branchée (api.js +
 * server.js), c'est elle qui prend le relais ; ce moteur reste le filet "démo".
 */

(function () {
  function products() {
    return (window.ProductStore && window.ProductStore.getProducts()) ||
      window.EXCEPTIONEL_PRODUCTS ||
      [];
  }
  function currentLang() {
    return (window.I18N && window.I18N.getLang()) || "fr";
  }

  // ---------- Utilitaires ----------
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function formatPrice(p) {
    const locale = currentLang() === "en" ? "en-US" : "fr-FR";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: p.currency || "EUR",
    }).format(p.price);
  }
  function findProduct(text) {
    if (!text) return null;
    const t = text.toLowerCase();
    const list = products();
    let match = list.find((p) => t.includes(p.name.toLowerCase()));
    if (match) return match;
    match = list.find(
      (p) =>
        (p.tags || []).some((tag) => t.includes(String(tag).toLowerCase())) ||
        t.includes(String(p.category || "").toLowerCase())
    );
    return match || null;
  }

  // ---------- Styles selon le ton et la langue ----------
  const TONES = {
    fr: {
      professionnel: {
        hooks: [
          "Découvrez un produit pensé pour l'excellence.",
          "La qualité au service de votre quotidien.",
          "Un choix évident pour les plus exigeants.",
        ],
        cta: "Commandez dès aujourd'hui sur exceptionel.com.",
      },
      enthousiaste: {
        hooks: [
          "On est tombés amoureux, et vous allez adorer aussi ✨",
          "Attention, coup de cœur en approche 💥",
          "Le produit dont tout le monde parle est enfin là 🎉",
        ],
        cta: "Foncez le découvrir sur exceptionel.com 🛒",
      },
      luxe: {
        hooks: [
          "L'exception n'attend que vous.",
          "Le raffinement, sans compromis.",
          "Une pièce d'exception pour un art de vivre unique.",
        ],
        cta: "Vivez l'expérience sur exceptionel.com.",
      },
      amical: {
        hooks: [
          "Hey ! On a un petit truc à vous montrer 😊",
          "Vous cherchiez la perle rare ? La voilà !",
          "Petit conseil entre nous : celui-ci vaut le détour.",
        ],
        cta: "Jetez-y un œil sur exceptionel.com 👀",
      },
    },
    en: {
      professionnel: {
        hooks: [
          "Discover a product built for excellence.",
          "Quality at the service of your everyday life.",
          "An obvious choice for the most demanding.",
        ],
        cta: "Order today on exceptionel.com.",
      },
      enthousiaste: {
        hooks: [
          "We fell in love, and you will too ✨",
          "Heads up — a new favorite is coming 💥",
          "The product everyone's talking about is finally here 🎉",
        ],
        cta: "Go grab it on exceptionel.com 🛒",
      },
      luxe: {
        hooks: [
          "Excellence awaits you.",
          "Refinement, without compromise.",
          "An exceptional piece for a unique lifestyle.",
        ],
        cta: "Experience it on exceptionel.com.",
      },
      amical: {
        hooks: [
          "Hey! We've got something to show you 😊",
          "Looking for a gem? Here it is!",
          "A little tip between us: this one's worth it.",
        ],
        cta: "Take a look on exceptionel.com 👀",
      },
    },
  };

  // ---------- Libellés statiques par langue ----------
  const L = {
    fr: {
      whyLove: "Pourquoi vous allez l'adopter :",
      idealFor: "Idéal pour :",
      genericFeatures: [
        "Qualité premium et finitions soignées",
        "Conçu pour durer",
        "Un rapport qualité-prix imbattable",
      ],
      you: "vous",
      defaultPitch: "un produit d'exception sélectionné pour vous.",
      reviewTitle: (t) => `${t} : notre avis complet`,
      blogIntro: (name) =>
        `Vous hésitez encore à propos de ${name} ? Laissez-nous vous raconter pourquoi ce produit fait la différence.`,
      blogIntroTopic: (t) =>
        `Aujourd'hui, on vous parle de ${t} et de tout ce qu'il peut changer dans votre quotidien.`,
      blogDetail:
        "C'est exactement le genre de détail qui transforme un bon produit en un produit d'exception.",
      summary: "En résumé",
      summaryP: (name, price, aud) =>
        `${name} coche toutes les cases pour ${aud.toLowerCase()}. À ${price}, c'est un investissement qui a du sens.`,
      summaryTopic: (t) => `${t} a tout pour devenir votre nouveau favori.`,
      emailHello: "Bonjour {{prénom}},",
      emailIntro: (name) => `Nous sommes ravis de vous présenter ${name}.`,
      emailLikes: "Ce que vous allez aimer :",
      emailPrice: (price) => `Le tout pour seulement ${price}.`,
      emailSign: "À très vite,\nL'équipe Exceptionel",
      subjectPrefix: "Objet : ",
      subjectFallback: (name) => `${name} vous attend chez Exceptionel`,
      genericEmailFeatures: ["Qualité premium", "Livraison rapide", "Satisfaction garantie"],
      newness: "notre nouveauté",
    },
    en: {
      whyLove: "Why you'll love it:",
      idealFor: "Perfect for:",
      genericFeatures: [
        "Premium quality and refined finishes",
        "Built to last",
        "Unbeatable value for money",
      ],
      you: "you",
      defaultPitch: "an exceptional product hand-picked for you.",
      reviewTitle: (t) => `${t}: our full review`,
      blogIntro: (name) =>
        `Still unsure about ${name}? Let us tell you why this product makes the difference.`,
      blogIntroTopic: (t) =>
        `Today, we're talking about ${t} and everything it can change in your daily life.`,
      blogDetail:
        "That's exactly the kind of detail that turns a good product into an exceptional one.",
      summary: "In short",
      summaryP: (name, price, aud) =>
        `${name} ticks every box for ${aud.toLowerCase()}. At ${price}, it's an investment that makes sense.`,
      summaryTopic: (t) => `${t} has everything to become your new favorite.`,
      emailHello: "Hi {{first_name}},",
      emailIntro: (name) => `We're thrilled to introduce ${name}.`,
      emailLikes: "What you'll love:",
      emailPrice: (price) => `All that for only ${price}.`,
      emailSign: "See you soon,\nThe Exceptionel team",
      subjectPrefix: "Subject: ",
      subjectFallback: (name) => `${name} is waiting for you at Exceptionel`,
      genericEmailFeatures: ["Premium quality", "Fast shipping", "Satisfaction guaranteed"],
      newness: "our latest arrival",
    },
  };

  function tone(name, lang) {
    const set = TONES[lang] || TONES.fr;
    return set[name] || set.professionnel;
  }

  // ---------- Générateurs par type de contenu ----------
  function genProductDescription(subject, t, lang) {
    const lx = L[lang] || L.fr;
    const p = findProduct(subject);
    const st = tone(t, lang);
    const name = p ? p.name : subject || (lang === "en" ? "This product" : "Ce produit");
    const priceLine = p ? ` (${formatPrice(p)})` : "";
    const features = p && p.features && p.features.length ? p.features : lx.genericFeatures;
    const audience = p && p.audience ? p.audience : lx.you;
    const bullets = features.map((f) => `• ${f}`).join("\n");
    return [
      pick(st.hooks),
      "",
      `${name}${priceLine} — ${p && p.shortPitch ? p.shortPitch : lx.defaultPitch}`,
      "",
      lx.whyLove,
      bullets,
      "",
      `${lx.idealFor} ${audience}.`,
      "",
      st.cta,
    ].join("\n");
  }

  function genBlogArticle(subject, t, lang) {
    const lx = L[lang] || L.fr;
    const p = findProduct(subject);
    const st = tone(t, lang);
    const topic = p ? p.name : subject || lx.newness;
    const intro = p ? lx.blogIntro(p.name) : lx.blogIntroTopic(topic);
    const features = p && p.features && p.features.length ? p.features : lx.genericFeatures;
    const sections = features
      .map(
        (f, i) =>
          `## ${i + 1}. ${f.split(" ").slice(0, 6).join(" ")}\n${f}. ${lx.blogDetail}`
      )
      .join("\n\n");
    return [
      `# ${lx.reviewTitle(topic)}`,
      "",
      pick(st.hooks),
      "",
      intro,
      "",
      sections,
      "",
      `## ${lx.summary}`,
      p ? lx.summaryP(p.name, formatPrice(p), p.audience || lx.you) : lx.summaryTopic(topic),
      "",
      st.cta,
    ].join("\n");
  }

  function genSocialPost(subject, t, lang) {
    const lx = L[lang] || L.fr;
    const p = findProduct(subject);
    const st = tone(t, lang);
    const name = p ? p.name : subject || lx.newness;
    const pitch = p && p.shortPitch ? p.shortPitch : (lang === "en" ? "A must-see." : "À découvrir absolument.");
    const hashtags = p
      ? ["#exceptionel", "#" + String(p.category || "shop").toLowerCase().replace(/\s/g, ""), lang === "en" ? "#new" : "#nouveaute", "#shopping"]
      : ["#exceptionel", lang === "en" ? "#new" : "#nouveaute", "#shopping", lang === "en" ? "#trending" : "#tendance"];
    return [
      pick(st.hooks),
      "",
      `${name} — ${pitch}`,
      p ? `👉 ${formatPrice(p)}` : "",
      "",
      st.cta,
      "",
      hashtags.join(" "),
    ]
      .filter(Boolean)
      .join("\n");
  }

  function genMarketingEmail(subject, t, lang) {
    const lx = L[lang] || L.fr;
    const p = findProduct(subject);
    const st = tone(t, lang);
    const name = p ? p.name : subject || lx.newness;
    const subjectLine = p && p.shortPitch ? `${name} : ${p.shortPitch}` : lx.subjectFallback(name);
    const features = (p && p.features && p.features.length ? p.features : lx.genericEmailFeatures)
      .map((f) => `  ✓ ${f}`)
      .join("\n");
    return [
      `${lx.subjectPrefix}${subjectLine}`,
      "",
      lx.emailHello,
      "",
      pick(st.hooks),
      "",
      lx.emailIntro(name),
      p && p.shortPitch ? p.shortPitch : "",
      "",
      lx.emailLikes,
      features,
      "",
      p ? lx.emailPrice(formatPrice(p)) : "",
      "",
      `[ ${st.cta} ]`,
      "",
      lx.emailSign,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const GENERATORS = {
    "product-description": genProductDescription,
    "blog-article": genBlogArticle,
    "social-post": genSocialPost,
    "marketing-email": genMarketingEmail,
  };

  function generate({ type, subject, tone: t, lang }) {
    const language = lang || currentLang();
    const gen = GENERATORS[type] || genProductDescription;
    return gen(subject, t, language);
  }

  // ---------- Chatbot / assistant commercial (bilingue) ----------
  function recommend(text) {
    const p = findProduct(text);
    if (p) return [p];
    return [...products()].sort((a, b) => a.price - b.price).slice(0, 2);
  }

  const CHAT = {
    fr: {
      greet: (n) =>
        "Bonjour et bienvenue chez Exceptionel ! 👋 Dites-moi ce que vous cherchez (un cadeau, un accessoire, de l'audio...) et je vous guide.",
      price: (name, price, pitch) =>
        `${name} est à ${price}. ${pitch} Souhaitez-vous que je vous en dise plus ?`,
      shipping:
        "La livraison est offerte dès 50 € d'achat, et vos articles arrivent généralement sous 2 à 4 jours ouvrés. 🚚",
      returns:
        "Vous disposez de 30 jours pour changer d'avis, retours gratuits. Tous nos produits sont garantis. 👍",
      gift:
        "Excellente idée ! 🎁 Voici deux valeurs sûres qui font toujours plaisir. Vous voulez que je vous aide à choisir selon le budget ?",
      reco: (name, pitch, price) =>
        `Je pense que ${name} pourrait vous plaire : ${pitch} (${price}). Voulez-vous l'ajouter à votre panier sur exceptionel.com ?`,
      fallback:
        "Je note ! Pour mieux vous conseiller, dites-moi le type de produit qui vous intéresse : accessoires, audio, maison, voyage... 😊",
    },
    en: {
      greet: (n) =>
        "Hello and welcome to Exceptionel! 👋 Tell me what you're looking for (a gift, an accessory, audio...) and I'll guide you.",
      price: (name, price, pitch) =>
        `${name} is ${price}. ${pitch} Would you like to know more?`,
      shipping:
        "Shipping is free over €50, and your items usually arrive within 2 to 4 business days. 🚚",
      returns:
        "You have 30 days to change your mind, free returns. All our products are guaranteed. 👍",
      gift:
        "Great idea! 🎁 Here are two safe bets that always please. Want me to help you choose by budget?",
      reco: (name, pitch, price) =>
        `I think you'd like ${name}: ${pitch} (${price}). Want to add it to your cart on exceptionel.com?`,
      fallback:
        "Got it! To advise you better, tell me the kind of product you're after: accessories, audio, home, travel... 😊",
    },
  };

  const PATTERNS = {
    fr: {
      greet: /^(bonjour|salut|hello|coucou|bonsoir|hey)\b/,
      price: /(prix|combien|coûte|coute|tarif|cher)/,
      shipping: /(livraison|expédi|delai|délai|reçoit|recevoir)/,
      returns: /(retour|rembours|garantie|échange|echange)/,
      gift: /(cadeau|offrir|anniversaire|noël|noel)/,
    },
    en: {
      greet: /^(hello|hi|hey|good\s?(morning|evening))\b/,
      price: /(price|how much|cost|cheap|expensive)/,
      shipping: /(shipping|delivery|deliver|arrive|receive)/,
      returns: /(return|refund|warranty|guarantee|exchange)/,
      gift: /(gift|present|birthday|christmas)/,
    },
  };

  function chat(message, history, langArg) {
    const lang = langArg || currentLang();
    const c = CHAT[lang] || CHAT.fr;
    // On teste les patterns des DEUX langues pour être tolérant.
    const P = PATTERNS[lang] || PATTERNS.fr;
    const Pother = lang === "en" ? PATTERNS.fr : PATTERNS.en;
    const msg = (message || "").toLowerCase().trim();
    const test = (key) => P[key].test(msg) || Pother[key].test(msg);

    if (P.greet.test(msg) || Pother.greet.test(msg)) {
      return { text: c.greet(), products: [] };
    }
    if (test("price")) {
      const p = findProduct(msg) || recommend(msg)[0];
      return { text: c.price(p.name, formatPrice(p), p.shortPitch || ""), products: [p] };
    }
    if (test("shipping")) return { text: c.shipping, products: [] };
    if (test("returns")) return { text: c.returns, products: [] };
    if (test("gift")) {
      let gifts = products().filter((p) => (p.tags || []).includes("cadeau") || (p.tags || []).includes("gift"));
      if (gifts.length < 2) gifts = [...products()].sort((a, b) => a.price - b.price).slice(0, 2);
      else gifts = gifts.slice(0, 2);
      return { text: c.gift, products: gifts };
    }
    const recs = recommend(msg);
    if (recs.length) {
      const p = recs[0];
      return { text: c.reco(p.name, p.shortPitch || "", formatPrice(p)), products: recs };
    }
    return { text: c.fallback, products: [] };
  }

  // ---------- Export global ----------
  window.ExceptionelAI = {
    generate,
    chat,
    get products() {
      return products();
    },
    formatPrice,
    findProduct,
  };
})();

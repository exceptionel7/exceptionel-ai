/*
 * i18n.js — Traductions de l'interface (FR / EN).
 *
 * Les éléments HTML portant data-i18n="clé" voient leur texte remplacé.
 * data-i18n-ph="clé" traduit un placeholder d'input.
 * La langue choisie est mémorisée dans localStorage et transmise au moteur IA.
 */

(function () {
  const DICT = {
    fr: {
      "nav.dashboard": "Tableau de bord",
      "nav.generator": "Générateur",
      "nav.visuals": "Visuels",
      "nav.calendar": "Calendrier",
      "nav.products": "Produits",
      "nav.settings": "Réglages",
      "hero.title": "Vendez plus, écrivez moins.",
      "hero.lead":
        "Exceptionel AI crée vos descriptions produits, articles, posts et emails — et discute avec vos visiteurs pour les convertir en clients.",
      "hero.generate": "✍️ Générer du contenu",
      "hero.chat": "💬 Tester l'assistant",
      "card.content.title": "Contenu en un clic",
      "card.content.desc": "Descriptions, blog, réseaux sociaux, emails. Choisissez le ton, l'IA rédige.",
      "card.assistant.title": "Assistant de vente",
      "card.assistant.desc": "Un chatbot qui répond et recommande les bons produits, 24h/24.",
      "card.visual.title": "Visuels de posts",
      "card.visual.desc": "Générez des images prêtes à publier pour vos réseaux sociaux.",
      "stat.products": "produits",
      "stat.types": "types de contenu",
      "stat.langs": "langues",
      "stat.assistant": "assistant actif",
      "gen.title": "Générateur de contenu",
      "gen.subtitle": "Choisissez un type, un produit ou un sujet, un ton — puis générez.",
      "gen.type": "Type de contenu",
      "gen.type.product": "Description produit",
      "gen.type.social": "Post réseau social",
      "gen.type.blog": "Article de blog",
      "gen.type.email": "Email marketing",
      "gen.subject": "Produit ou sujet",
      "gen.subject.ph": "ex : Casque Serenity, ou un thème libre…",
      "gen.tone": "Ton",
      "tone.professionnel": "Professionnel",
      "tone.enthousiaste": "Enthousiaste",
      "tone.luxe": "Luxe",
      "tone.amical": "Amical",
      "gen.btn": "Générer ✨",
      "gen.result": "Résultat",
      "gen.copy": "Copier",
      "gen.schedule": "Planifier",
      "gen.placeholder": "Votre contenu généré apparaîtra ici…",
      "visual.title": "Générateur de visuels",
      "visual.subtitle": "Créez une image de post prête à publier, en quelques secondes.",
      "visual.product": "Produit",
      "visual.headline": "Accroche (optionnel)",
      "visual.headline.ph": "Laisser vide pour utiliser l'accroche du produit",
      "visual.theme": "Style",
      "visual.generate": "Générer le visuel 🎨",
      "visual.download": "Télécharger",
      "calendar.title": "Calendrier de publication",
      "calendar.subtitle": "Planifiez vos publications réseaux sociaux.",
      "calendar.date": "Date",
      "calendar.platform": "Plateforme",
      "calendar.content": "Contenu",
      "calendar.content.ph": "Texte du post à publier…",
      "calendar.add": "Planifier ce post",
      "calendar.upcoming": "Publications planifiées",
      "calendar.empty": "Aucune publication planifiée pour l'instant.",
      "calendar.delete": "Supprimer",
      "products.title": "Catalogue",
      "products.subtitle": "Le contenu et l'assistant s'appuient sur ces produits.",
      "products.buy": "Voir sur exceptionel.com →",
      "settings.title": "Réglages",
      "settings.catalog.title": "Connexion au catalogue en temps réel",
      "settings.catalog.desc":
        "Chargez vos vrais produits depuis une URL JSON (ex : Shopify /products.json, ou votre propre API).",
      "settings.catalog.url": "URL du flux produits (JSON)",
      "settings.catalog.load": "Charger le catalogue",
      "settings.catalog.reset": "Revenir aux produits de démo",
      "settings.lang.title": "Langue",
      "chat.title": "Assistant Exceptionel",
      "chat.status": "En ligne • répond en quelques secondes",
      "chat.ph": "Posez votre question…",
      "chat.send": "Envoyer",
      "chat.greeting":
        "Bonjour ! 👋 Je suis l'assistant d'Exceptionel. Je peux vous conseiller un produit, répondre sur la livraison, les prix… Comment puis-je vous aider ?",
      "badge.demo": "Mode démo",
      "badge.live": "IA connectée",
      "toast.copied": "Copié ✓",
      "toast.scheduled": "Post planifié ✓",
      "toast.catalogLoaded": "Catalogue chargé : {n} produits",
      "toast.catalogError": "Impossible de charger ce catalogue. Vérifiez l'URL.",
      "toast.catalogReset": "Catalogue de démo rétabli",
    },
    en: {
      "nav.dashboard": "Dashboard",
      "nav.generator": "Generator",
      "nav.visuals": "Visuals",
      "nav.calendar": "Calendar",
      "nav.products": "Products",
      "nav.settings": "Settings",
      "hero.title": "Sell more, write less.",
      "hero.lead":
        "Exceptionel AI writes your product descriptions, articles, posts and emails — and chats with visitors to turn them into customers.",
      "hero.generate": "✍️ Generate content",
      "hero.chat": "💬 Try the assistant",
      "card.content.title": "Content in one click",
      "card.content.desc": "Descriptions, blog, social, emails. Pick a tone, the AI writes.",
      "card.assistant.title": "Sales assistant",
      "card.assistant.desc": "A chatbot that answers and recommends the right products, 24/7.",
      "card.visual.title": "Post visuals",
      "card.visual.desc": "Generate ready-to-publish images for your social media.",
      "stat.products": "products",
      "stat.types": "content types",
      "stat.langs": "languages",
      "stat.assistant": "assistant online",
      "gen.title": "Content generator",
      "gen.subtitle": "Pick a type, a product or topic, a tone — then generate.",
      "gen.type": "Content type",
      "gen.type.product": "Product description",
      "gen.type.social": "Social media post",
      "gen.type.blog": "Blog article",
      "gen.type.email": "Marketing email",
      "gen.subject": "Product or topic",
      "gen.subject.ph": "e.g. Serenity Headphones, or any topic…",
      "gen.tone": "Tone",
      "tone.professionnel": "Professional",
      "tone.enthousiaste": "Enthusiastic",
      "tone.luxe": "Luxury",
      "tone.amical": "Friendly",
      "gen.btn": "Generate ✨",
      "gen.result": "Result",
      "gen.copy": "Copy",
      "gen.schedule": "Schedule",
      "gen.placeholder": "Your generated content will appear here…",
      "visual.title": "Visual generator",
      "visual.subtitle": "Create a ready-to-publish post image in seconds.",
      "visual.product": "Product",
      "visual.headline": "Headline (optional)",
      "visual.headline.ph": "Leave empty to use the product's tagline",
      "visual.theme": "Style",
      "visual.generate": "Generate visual 🎨",
      "visual.download": "Download",
      "calendar.title": "Publishing calendar",
      "calendar.subtitle": "Schedule your social media posts.",
      "calendar.date": "Date",
      "calendar.platform": "Platform",
      "calendar.content": "Content",
      "calendar.content.ph": "Text of the post to publish…",
      "calendar.add": "Schedule this post",
      "calendar.upcoming": "Scheduled posts",
      "calendar.empty": "No posts scheduled yet.",
      "calendar.delete": "Delete",
      "products.title": "Catalog",
      "products.subtitle": "Content and the assistant rely on these products.",
      "products.buy": "View on exceptionel.com →",
      "settings.title": "Settings",
      "settings.catalog.title": "Real-time catalog connection",
      "settings.catalog.desc":
        "Load your real products from a JSON URL (e.g. Shopify /products.json, or your own API).",
      "settings.catalog.url": "Products feed URL (JSON)",
      "settings.catalog.load": "Load catalog",
      "settings.catalog.reset": "Back to demo products",
      "settings.lang.title": "Language",
      "chat.title": "Exceptionel Assistant",
      "chat.status": "Online • replies in seconds",
      "chat.ph": "Ask your question…",
      "chat.send": "Send",
      "chat.greeting":
        "Hi! 👋 I'm the Exceptionel assistant. I can recommend a product, answer questions about shipping, prices… How can I help?",
      "badge.demo": "Demo mode",
      "badge.live": "AI connected",
      "toast.copied": "Copied ✓",
      "toast.scheduled": "Post scheduled ✓",
      "toast.catalogLoaded": "Catalog loaded: {n} products",
      "toast.catalogError": "Could not load this catalog. Check the URL.",
      "toast.catalogReset": "Demo catalog restored",
    },
  };

  let lang = localStorage.getItem("exc_lang") || "fr";

  function t(key, vars) {
    let str = (DICT[lang] && DICT[lang][key]) || (DICT.fr[key] || key);
    if (vars) {
      Object.keys(vars).forEach((k) => {
        str = str.replace("{" + k + "}", vars[k]);
      });
    }
    return str;
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    scope.querySelectorAll("[data-i18n-ph]").forEach((el) => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph")));
    });
    document.documentElement.setAttribute("lang", lang);
  }

  const listeners = [];
  function onChange(fn) {
    if (typeof fn === "function") listeners.push(fn);
  }

  function setLang(next) {
    if (!DICT[next]) return;
    lang = next;
    localStorage.setItem("exc_lang", lang);
    apply();
    listeners.forEach((fn) => {
      try {
        fn(lang);
      } catch (e) {
        /* noop */
      }
    });
  }

  function getLang() {
    return lang;
  }

  window.I18N = { t, apply, setLang, getLang, onChange };
})();

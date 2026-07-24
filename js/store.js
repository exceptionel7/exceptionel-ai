/*
 * store.js — Source de vérité unique du catalogue.
 *
 * Toute l'application (moteur IA, chatbot, visuels, UI) lit les produits via
 * ProductStore.getProducts(). Le catalogue démarre avec les produits par défaut
 * (products.js) et peut être remplacé à chaud par la connexion en temps réel
 * (catalog.js) ou par les préférences enregistrées.
 */

(function () {
  const DEFAULTS = (window.EXCEPTIONEL_PRODUCTS || []).slice();
  let current = DEFAULTS.slice();
  const listeners = [];

  const ProductStore = {
    getProducts() {
      return current;
    },
    getDefaults() {
      return DEFAULTS.slice();
    },
    setProducts(products) {
      if (Array.isArray(products) && products.length) {
        current = products;
        listeners.forEach((fn) => {
          try {
            fn(current);
          } catch (e) {
            /* noop */
          }
        });
      }
    },
    reset() {
      this.setProducts(DEFAULTS.slice());
    },
    onChange(fn) {
      if (typeof fn === "function") listeners.push(fn);
    },
  };

  window.ProductStore = ProductStore;
})();

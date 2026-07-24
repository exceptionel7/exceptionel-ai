/*
 * calendar.js
 * Calendrier de publication réseaux sociaux.
 *
 * Stocke les publications planifiées dans localStorage (aucun serveur requis).
 * Chaque entrée : { id, date, platform, content, createdAt }.
 * L'app peut ajouter un post depuis le générateur, et lister/supprimer ici.
 */

(function () {
  const KEY = "exc_schedule";

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  function all() {
    // Tri chronologique
    return load().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  function add(entry) {
    const list = load();
    const item = {
      id: "p_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      date: entry.date || new Date().toISOString().slice(0, 10),
      platform: entry.platform || "Instagram",
      content: entry.content || "",
      createdAt: new Date().toISOString(),
    };
    list.push(item);
    save(list);
    return item;
  }

  function remove(id) {
    save(load().filter((e) => e.id !== id));
  }

  window.PublishCalendar = { all, add, remove };
})();

/*
 * visual-generator.js
 * Génère une image de post pour les réseaux sociaux avec le Canvas HTML5.
 *
 * 100% hors-ligne : dessine un visuel carré (1080x1080) avec un fond dégradé,
 * le nom du produit, une accroche, le prix et l'identité Exceptionel.
 * Le résultat est un data URL PNG, téléchargeable.
 *
 * Si un backend d'images IA est disponible (server.js /api/image), l'app peut
 * l'utiliser à la place ; sinon ce générateur reste la valeur sûre "démo".
 */

(function () {
  const SIZE = 1080;

  const THEMES = {
    violet: { from: "#7c5cff", to: "#22d3ee", text: "#ffffff", accent: "#ffe27a" },
    nuit: { from: "#0f1115", to: "#1f232c", text: "#ffffff", accent: "#7c5cff" },
    or: { from: "#3a2f10", to: "#b8860b", text: "#fff8e7", accent: "#ffffff" },
    corail: { from: "#ff6b6b", to: "#ffd93d", text: "#1a1a1a", accent: "#ffffff" },
    menthe: { from: "#0f9b8e", to: "#a8e063", text: "#04231f", accent: "#ffffff" },
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Découpe un texte en lignes qui tiennent dans maxWidth.
  function wrapText(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = "";
    words.forEach((w) => {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  /**
   * Dessine le visuel sur un canvas et renvoie le canvas.
   * @param {Object} opts { productName, headline, price, themeName }
   */
  function draw(canvas, opts) {
    const theme = THEMES[opts.themeName] || THEMES.violet;
    const ctx = canvas.getContext("2d");
    canvas.width = SIZE;
    canvas.height = SIZE;

    // Fond dégradé diagonal
    const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    grad.addColorStop(0, theme.from);
    grad.addColorStop(1, theme.to);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Cercles décoratifs translucides
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(SIZE * 0.85, SIZE * 0.18, 220, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(SIZE * 0.12, SIZE * 0.9, 160, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const pad = 90;

    // Marque en haut
    ctx.fillStyle = theme.text;
    ctx.font = "600 40px system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText("✦ EXCEPTIONEL", pad, pad);

    // Accroche (gros titre) au centre-gauche
    const headline = opts.headline || opts.productName || "Nouveauté";
    ctx.font = "800 96px system-ui, sans-serif";
    const lines = wrapText(ctx, headline, SIZE - pad * 2).slice(0, 4);
    let y = SIZE * 0.32;
    lines.forEach((ln) => {
      ctx.fillText(ln, pad, y);
      y += 112;
    });

    // Nom du produit (sous-titre)
    if (opts.productName && opts.productName !== headline) {
      ctx.font = "500 46px system-ui, sans-serif";
      ctx.globalAlpha = 0.9;
      ctx.fillText(opts.productName, pad, y + 10);
      ctx.globalAlpha = 1;
      y += 80;
    }

    // Pastille de prix
    if (opts.price) {
      ctx.font = "800 54px system-ui, sans-serif";
      const priceText = opts.price;
      const tw = ctx.measureText(priceText).width;
      const bw = tw + 70;
      const bh = 96;
      const bx = pad;
      const by = SIZE - pad - bh;
      ctx.fillStyle = theme.accent;
      roundRect(ctx, bx, by, bw, bh, 48);
      ctx.fill();
      ctx.fillStyle = "#111111";
      ctx.textBaseline = "middle";
      ctx.fillText(priceText, bx + 35, by + bh / 2);
      ctx.textBaseline = "top";
    }

    // Appel à l'action en bas à droite
    ctx.fillStyle = theme.text;
    ctx.font = "600 38px system-ui, sans-serif";
    const cta = "exceptionel.com";
    const cw = ctx.measureText(cta).width;
    ctx.fillText(cta, SIZE - pad - cw, SIZE - pad - 44);

    return canvas;
  }

  function toDataURL(opts) {
    const canvas = document.createElement("canvas");
    draw(canvas, opts);
    return canvas.toDataURL("image/png");
  }

  window.VisualGenerator = { draw, toDataURL, THEMES };
})();

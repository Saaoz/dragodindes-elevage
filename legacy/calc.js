/* =====================================================================
   calc.js — logique de calcul PURE (aucun accès au DOM ni au navigateur)
   Testable avec Node : node tests.js   |  ou dans le navigateur : tests.html
   ===================================================================== */
(function (root) {
  "use strict";

  /* Génétons gagnés par parent selon sa génération (voir data.js) */
  const GENETONS = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 15, 6: 30, 7: 60, 8: 120, 9: 250, 10: 0 };

  const clamp = (n, a, b) => Math.min(b, Math.max(a, Number.isFinite(+n) ? +n : a));
  const pos = (x) => (typeof x === "number" && isFinite(x) && x > 0 ? x : 0);

  /* ---------- parseKamas : "1 200 000", "250k", "1,5M", "1.200.000" → nombre ----------
     Renvoie null si illisible ou négatif (jamais de corruption silencieuse). */
  function parseKamas(input) {
    if (typeof input === "number") return isFinite(input) && input >= 0 ? Math.round(input) : null;
    const s = String(input == null ? "" : input)
      .toLowerCase()
      .replace(/[\s  _']/g, "")
      .replace(/kamas?$/, "");
    if (!s) return null;
    // "1.200.000" ou "1,200,000" : séparateurs de milliers
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return parseInt(s.replace(/[.,]/g, ""), 10);
    const m = s.match(/^(\d+(?:[.,]\d+)?)(kk|mk|m|k)?$/);
    if (!m) return null;
    const num = parseFloat(m[1].replace(",", "."));
    const mult = m[2] === "k" ? 1e3 : m[2] ? 1e6 : 1;
    return Math.round(num * mult);
  }

  /* ---------- formatage ---------- */
  const fmt = (n) => Math.round(n).toLocaleString("fr-FR");
  function fmtShort(n) {
    const a = Math.abs(n), sign = n < 0 ? "−" : "";
    if (a >= 1e6) return sign + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(".", ",").replace(/,?0+$/, "") + " M";
    if (a >= 1e3) return sign + Math.round(a / 1e3).toLocaleString("fr-FR") + " k";
    return sign + Math.round(a);
  }

  /* ---------- chance de génération cible ---------- */
  function chanceCible(lvlA, lvlB, opti, optiBonus) {
    const p = 0.30 + 0.0015 * (clamp(lvlA, 1, 200) + clamp(lvlB, 1, 200)) + (opti ? optiBonus / 100 : 0);
    return Math.min(1, Math.max(0, p));
  }

  /* ---------- compute : un couple, un accouplement ----------
     c = réglages du simulateur, P = prix numériques {gen:[_,g1..g10], neurone, optimakina, genetons}
     Un prix manquant (absent ou 0) est listé dans `missing` : le résultat est alors INCOMPLET. */
  function compute(c, P) {
    const missing = [];
    const need = (label, v) => { if (!(v > 0)) missing.push(label); return pos(v); };

    const target = clamp(c.target, 2, 10), genA = clamp(c.genA, 1, 10), genB = clamp(c.genB, 1, 10);
    const babies = c.repro ? 2 : 1;
    const p = chanceCible(c.lvlA, c.lvlB, c.opti, c.optiBonus);

    const failGen = Math.max(1, target - 1);
    const priceT = c.priceTarget > 0 ? c.priceTarget : need("Monture gén. " + target + " (bébé cible)", P.gen[target]);
    const priceF = c.priceFail > 0 ? c.priceFail : need("Monture gén. " + failGen + " (bébé raté)", P.gen[failGen]);

    let costParents = 0;
    if (c.origin === "hdv") {
      costParents = need("Monture gén. " + genA + " (parent A)", P.gen[genA]) + need("Monture gén. " + genB + " (parent B)", P.gen[genB]);
    }
    const costOpti = c.opti ? need("Optimakina", P.optimakina) : 0;
    const fuel = pos(c.fuel);
    const cost = costParents + fuel + costOpti;

    let recovery = 0;
    if (c.parentsMode === "extract") {
      const neurones = (genA > 1 ? genA : 0) + (genB > 1 ? genB : 0);
      if (neurones > 0) recovery = neurones * need("Neurone", P.neurone);
    } else if (c.parentsMode === "sell") {
      recovery = 2 * need("Revente d'un parent stérile", c.sterileSell);
    }

    // Génétons : seulement si l'option est cochée ET que le bébé dépasse les générations des parents
    const genGain = c.countGenetons && target > Math.max(genA, genB) ? (GENETONS[genA] || 0) + (GENETONS[genB] || 0) : 0;
    const genValue = genGain > 0 ? genGain * need("Valeur d'un Géténon", P.genetons) : 0;

    const profitSuccess = babies * priceT + recovery + genValue - cost;
    const profitFail = babies * priceF + recovery - cost;
    const profitExpected = p * profitSuccess + (1 - p) * profitFail;

    // chance minimale pour que l'espérance soit >= 0
    const denom = babies * (priceT - priceF) + genValue;
    const breakEvenP = denom > 0 ? (cost - recovery - babies * priceF) / denom : null;

    return {
      p, babies, priceT, priceF, costParents, costOpti, fuel, cost, recovery, genGain, genValue,
      profitSuccess, profitFail, profitExpected, breakEvenP,
      roi: cost > 0 ? profitExpected / cost : null,
      missing: Array.from(new Set(missing)), incomplete: missing.length > 0
    };
  }

  /* Scénario "montée vers la génération g" utilisé par la heatmap et le graphique :
     parent A = gén. g-1, parent B = même gén. (mode "same") ou gén. 1 ; achetés à l'HDV.
     Reprend les réglages du simulateur (niveaux, Optimakina, carburant, parents, Génétons). */
  function scenario(calc, g, modeB) {
    return Object.assign({}, calc, {
      target: g, genA: g - 1, genB: modeB === "gen1" ? 1 : g - 1,
      origin: "hdv", priceTarget: 0, priceFail: 0
    });
  }

  const api = { GENETONS, clamp, parseKamas, fmt, fmtShort, chanceCible, compute, scenario };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof window !== "undefined" ? window : globalThis);

/* =====================================================================
   store.js — état de l'appli, sauvegarde fiable, migration, import/export
   Prix datés : chaque prix = { v: nombre, t: timestamp }  (pour le badge de fraîcheur)
   ===================================================================== */
const Store = (function () {
  "use strict";
  const KEY = "dd-elevage-v2", OLD = "dd-elevage-v1", SCHEMA = 2;
  const PRICE_KEYS = ["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10", "neurone", "optimakina", "genetons"];

  const defaultCalc = () => ({
    target: 5, genA: 4, genB: 4, lvlA: 100, lvlB: 100,
    opti: true, optiBonus: 10, repro: false,
    origin: "hdv", parentsMode: "extract", sterileSell: 0,
    fuel: 0, priceTarget: 0, priceFail: 0, countGenetons: false
  });

  let state = { schema: SCHEMA, server: SERVEURS[0].id, matB: "same", theme: "dark", calc: defaultCalc(), prices: {} };
  let demo = false;
  let lastError = null;

  /* ---------- validation : on ne fait jamais confiance au contenu stocké / importé ---------- */
  const srvIds = () => SERVEURS.map((s) => s.id);
  function cleanCalc(c) {
    const d = defaultCalc(), o = Object.assign(d, c || {});
    const cl = Calc.clamp;
    o.target = cl(o.target, 2, 10); o.genA = cl(o.genA, 1, 10); o.genB = cl(o.genB, 1, 10);
    o.lvlA = cl(o.lvlA, 1, 200); o.lvlB = cl(o.lvlB, 1, 200);
    o.optiBonus = o.optiBonus == 20 ? 20 : 10;
    ["fuel", "sterileSell", "priceTarget", "priceFail"].forEach((k) => (o[k] = Math.max(0, Math.round(+o[k] || 0))));
    ["opti", "repro", "countGenetons"].forEach((k) => (o[k] = !!o[k]));
    if (!["hdv", "capture"].includes(o.origin)) o.origin = "hdv";
    if (!["extract", "sell", "none"].includes(o.parentsMode)) o.parentsMode = "extract";
    return o;
  }
  function cleanPrices(p) {
    const out = {};
    srvIds().forEach((id) => {
      const src = p && p[id]; if (!src) return;
      const dst = {};
      PRICE_KEYS.forEach((k) => {
        const e = src[k];
        if (e && typeof e.v === "number" && isFinite(e.v) && e.v > 0) dst[k] = { v: Math.round(e.v), t: +e.t || Date.now() };
      });
      out[id] = dst;
    });
    return out;
  }
  function normalize(s) {
    const n = Object.assign({ schema: SCHEMA, server: srvIds()[0], matB: "same", theme: "dark" }, s || {});
    if (!srvIds().includes(n.server)) n.server = srvIds()[0];
    n.matB = n.matB === "gen1" ? "gen1" : "same";
    n.theme = n.theme === "light" ? "light" : "dark";
    n.calc = cleanCalc(n.calc);
    n.prices = cleanPrices(n.prices);
    n.schema = SCHEMA;
    return n;
  }

  /* ---------- migration de l'ancienne version (v1 : tableaux de nombres sans date) ---------- */
  function migrateV1(old) {
    const prices = {}, now = Date.now();
    Object.keys(old.prices || {}).forEach((id) => {
      const o = old.prices[id], d = {};
      (o.gen || []).forEach((v, g) => { if (g >= 1 && g <= 10 && v > 0) d["g" + g] = { v, t: now }; });
      ["neurone", "optimakina", "genetons"].forEach((k) => { if (o[k] > 0) d[k] = { v: o[k], t: now }; });
      prices[id] = d;
    });
    return { server: old.server, matB: old.matB, calc: old.calc, prices };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { state = normalize(JSON.parse(raw)); return; }
      const old = localStorage.getItem(OLD);
      if (old) state = normalize(migrateV1(JSON.parse(old)));
    } catch (e) { lastError = e; }
  }

  /* save() renvoie true/false : l'UI n'affiche « Enregistré » que si c'est vrai */
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); lastError = null; return true; }
    catch (e) { lastError = e; return false; }
  }

  /* ---------- prix ---------- */
  const DEMO_VALUES = { g1: 20000, g2: 40000, g3: 90000, g4: 160000, g5: 300000, g6: 520000, g7: 800000, g8: 1300000, g9: 2400000, g10: 4000000, neurone: 25000, optimakina: 150000, genetons: 3000 };
  function entry(server, key) {
    if (demo) return DEMO_VALUES[key] ? { v: DEMO_VALUES[key], t: Date.now() } : null;
    return (state.prices[server] || {})[key] || null;
  }
  function values(server) {            // prix numériques pour calc.js
    const P = { gen: Array(11).fill(0), neurone: 0, optimakina: 0, genetons: 0 };
    for (let g = 1; g <= 10; g++) { const e = entry(server, "g" + g); P.gen[g] = e ? e.v : 0; }
    ["neurone", "optimakina", "genetons"].forEach((k) => { const e = entry(server, k); P[k] = e ? e.v : 0; });
    return P;
  }
  function setPrice(server, key, v) {
    if (demo) return false;
    if (!state.prices[server]) state.prices[server] = {};
    if (v > 0) state.prices[server][key] = { v: Math.round(v), t: Date.now() };
    else delete state.prices[server][key];
    return save();
  }
  const count = (server) => PRICE_KEYS.filter((k) => entry(server, k)).length;
  function ageDays(server, key) {
    const e = entry(server, key); return e ? Math.floor((Date.now() - e.t) / 864e5) : null;
  }
  function oldestAge(server) {
    const ages = PRICE_KEYS.map((k) => ageDays(server, k)).filter((a) => a !== null);
    return ages.length ? Math.max(...ages) : null;
  }
  function clearServer(server) { delete state.prices[server]; return save(); }
  function copyToAll(server) {          // copie les prix d'un serveur vers tous les autres
    const src = JSON.parse(JSON.stringify(state.prices[server] || {}));
    srvIds().forEach((id) => { if (id !== server) state.prices[id] = JSON.parse(JSON.stringify(src)); });
    return save();
  }

  /* ---------- export / import JSON ---------- */
  function exportJSON() { return JSON.stringify({ app: "dd-elevage", schemaVersion: SCHEMA, exportedAt: new Date().toISOString(), data: state }, null, 2); }
  function importJSON(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return { ok: false, msg: "Ce n'est pas un JSON valide." }; }
    if (!obj || obj.app !== "dd-elevage" || !obj.data) return { ok: false, msg: "Fichier non reconnu (pas un export de cet outil)." };
    if (obj.schemaVersion > SCHEMA) return { ok: false, msg: "Export créé par une version plus récente de l'outil." };
    state = normalize(obj.data);
    return { ok: save(), msg: "Import terminé." };
  }

  /* ---------- import par collage (une ligne = « gen 5  300k » / « neurone 25k » …) ---------- */
  function importPaste(server, text) {
    let ok = 0, bad = [];
    text.split(/\r?\n/).forEach((line) => {
      const l = line.trim(); if (!l) return;
      const m = l.match(/^(?:gen\.?|g|génération)?\s*(\d{1,2}|neurones?|optimakina|g[ée]n[ée]tons?)\s*[:;\t =-]+\s*(.+)$/i);
      if (!m) { bad.push(l); return; }
      let key = m[1].toLowerCase();
      if (/^\d+$/.test(key)) { if (+key < 1 || +key > 10) { bad.push(l); return; } key = "g" + +key; }
      else if (key.startsWith("neuron")) key = "neurone";
      else if (key.startsWith("optim")) key = "optimakina";
      else key = "genetons";
      const v = Calc.parseKamas(m[2]);
      if (!v) { bad.push(l); return; }
      if (!state.prices[server]) state.prices[server] = {};
      state.prices[server][key] = { v, t: Date.now() }; ok++;
    });
    save();
    return { ok, bad };
  }

  return {
    PRICE_KEYS, load, save, defaultCalc, cleanCalc,
    get state() { return state; },
    get demo() { return demo; }, set demo(v) { demo = !!v; },
    get lastError() { return lastError; },
    values, setPrice, entry, count, ageDays, oldestAge, clearServer, copyToAll,
    exportJSON, importJSON, importPaste
  };
})();

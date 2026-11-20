/* =====================================================================
   app.js — interface (rendu, événements). Le calcul est dans calc.js,
   la sauvegarde dans store.js, les données du jeu dans data.js.
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const { fmt, fmtShort, parseKamas } = Calc;
Store.load();
const S = Store.state;

/* ---------- retour d'état de sauvegarde (honnête : n'affiche « Enregistré » que si ça a marché) ---------- */
let saveTimer;
function saved(ok) {
  const el = $("#saveState");
  if (ok === false) {
    el.textContent = "⚠ Sauvegarde impossible (navigateur en mode privé ?) — exporte tes prix";
    el.className = "save bad";
  } else {
    el.textContent = "Enregistré ✓"; el.className = "save ok";
    clearTimeout(saveTimer); saveTimer = setTimeout(() => (el.textContent = ""), 1800);
  }
}
const persist = () => saved(Store.save());

/* ---------- thème ---------- */
function applyTheme() { document.documentElement.dataset.theme = S.theme; $("#btnTheme").textContent = S.theme === "light" ? "🌙" : "☀"; }
$("#btnTheme").onclick = () => { S.theme = S.theme === "light" ? "dark" : "light"; applyTheme(); persist(); };
applyTheme();

/* ---------- navigation : onglets ARIA + hash (#/renta) ---------- */
const TABS = $$("#nav [role=tab]");
function showTab(name, focus) {
  if (!TABS.some((t) => t.dataset.tab === name)) name = "vue";
  TABS.forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle("on", on); t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  });
  $$("main section").forEach((s) => { const on = s.id === "tab-" + name; s.classList.toggle("on", on); s.hidden = !on; });
  if (name === "renta") renderAll();
}
TABS.forEach((t, i) => {
  t.onclick = () => { location.hash = "#/" + t.dataset.tab; };
  t.onkeydown = (e) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (d) { e.preventDefault(); location.hash = "#/" + TABS[(i + d + TABS.length) % TABS.length].dataset.tab; }
  };
});
window.addEventListener("hashchange", () => showTab(location.hash.replace("#/", ""), document.activeElement && document.activeElement.getAttribute("role") === "tab"));

/* ---------- serveur actif (en-tête fixe) ---------- */
const srvSel = $("#srvGlobal");
srvSel.innerHTML = SERVEURS.map((s) => `<option>${s.id}</option>`).join("");
srvSel.value = S.server;
srvSel.onchange = () => { S.server = srvSel.value; persist(); renderAll(); };

/* ---------- contenu statique généré depuis data.js ---------- */
$("#almanaxMois").textContent = ALMANAX[new Date().getMonth()];
$("#tblFilets").innerHTML = FILETS.map((f) => `<tr><td><b>${f.nom}</b></td><td>${f.niveau}+</td><td>${f.effet}</td></tr>`).join("");
$("#tblEnclos").innerHTML = ENCLOS_METIER.map((e, i) => `<tr><td>${e.niveau}</td><td>${e.label} → ${i + 1} enclos au total (${(i + 1) * 10} places)</td></tr>`).join("");
$("#tblJauges").innerHTML = JAUGES.map((j) => `<tr><td><b>${j.nom}</b></td><td>${j.effet}</td></tr>`).join("");
$("#tblTiers").innerHTML = TIERS.map((t) => {
  const w = ((t.max - Math.max(0, t.min - 1)) / CAPACITE_JAUGE * 100).toFixed(0);   // largeur de la barre ∝ taille du tier
  return `<tr><td>${t.tier}</td><td>${t.plage}<div class="bar"><i style="width:${w}%"></i></div></td><td>${t.duree}</td><td>${t.xpS}</td></tr>`;
}).join("");
$("#tblCarb").innerHTML = CARBURANTS.map((c) => `<tr><td><b>${c.nom}</b></td><td>${c.tierMax}</td><td>${c.metier}</td><td>${fmt(c.poussiere)}</td></tr>`).join("");
$("#tblMakinas").innerHTML = MAKINAS.map((m) => `<tr><td><b>${m.nom}</b></td><td>${m.effet}</td></tr>`).join("");
$("#tblGenetons").innerHTML = "<tr><th>Gén.</th><th>Génétons</th></tr>" +
  Object.keys(Calc.GENETONS).filter((g) => g < 10).map((g) => `<tr><td>${g}</td><td>${Calc.GENETONS[g]}</td></tr>`).join("");
$("#tblSrv").innerHTML = SERVEURS.map((s) => `<tr><td><b>${s.id}</b></td><td>${s.type}</td><td>${s.note}</td></tr>`).join("");
$("#srcList").innerHTML = SOURCES.map((s) => `<li><a href="${s[1]}" target="_blank" rel="noopener">${s[0]}</a></li>`).join("");

function renderGens() {
  const q = $("#searchColor").value.trim().toLowerCase();
  $("#genList").innerHTML = GENERATIONS.map((g) => {
    const pills = g.couleurs.map((c) => `<span class="pill ${q && c.toLowerCase().includes(q) ? "hit" : ""}">${c}</span>`).join("");
    const info = g.sauvage ? "Capture directe · non extractible" : `${g.gen} neurone${g.gen > 1 ? "s" : ""} à l'extraction · ${g.couleurs.length} couleur${g.couleurs.length > 1 ? "s" : ""}`;
    return `<div class="gen"><div class="g">Gen ${g.gen}</div><div><div class="mut">${info}</div><div class="pills">${pills}</div></div></div>`;
  }).join("");
}
$("#searchColor").oninput = renderGens; renderGens();

/* ---------- outils : sérénité + XP ---------- */
function serenity() {
  const v = Math.max(-5000, Math.min(5000, parseInt($("#serIn").value, 10) || 0));
  const g = [];
  if (v <= -1) g.push("Endurance");
  if (v >= -2000 && v <= 2000) g.push("Maturité");
  if (v >= 0) g.push("Amour");
  const conseil = v <= -2001 ? "Active <b>Sérénité +</b> pour remonter la sérénité."
    : v <= -1 ? "Active <b>Endurance + Maturité</b>."
    : v <= 2000 ? "Active <b>Amour + Maturité</b>."
    : "Active <b>Sérénité −</b> pour faire baisser la sérénité.";
  $("#serOut").innerHTML = `<p>Jauges qui progressent : <b>${g.join(", ") || "aucune"}</b></p><p>${conseil}</p>`;
}
$("#serIn").oninput = serenity; serenity();
function xp() {
  const total = parseFloat($("#xpRoute").value);
  const rate = parseFloat($("#xpTier").value) * ($("#xpSage").checked ? 2 : 1);
  $("#xpOut").innerHTML = `<p>Durée théorique à régime constant : <b>${(total / rate / 3600).toFixed(1)} h</b></p><p class="mut">En pratique la jauge se vide (tier 4 = 42 min) : les guides annoncent 100-150 h pour le niveau 200.</p>`;
}
["#xpRoute", "#xpTier", "#xpSage"].forEach((s) => ($(s).onchange = xp)); xp();

/* =====================================================================
   RENTABILITÉ
   ===================================================================== */
const PRICE_ROWS = [
  ...Array.from({ length: 10 }, (_, i) => ({ key: "g" + (i + 1), label: `Monture génération ${i + 1}`, hint: GENERATIONS[i].couleurs.length + " couleur" + (GENERATIONS[i].couleurs.length > 1 ? "s" : "") })),
  { key: "neurone", label: "Neurone (extraction)", hint: "ressource" },
  { key: "optimakina", label: "Optimakina", hint: "Makina" },
  { key: "genetons", label: "Valeur perso d'un Géténon", hint: "ce que tu en fais" }
];
const ageBadge = (a) => a === null ? "" : a === 0 ? '<span class="age">aujourd\'hui</span>' : `<span class="age ${a > 7 ? "old" : ""}">${a > 7 ? "⏱ " : ""}il y a ${a} j</span>`;

/* --- bannière démo (surcouche mémoire : jamais écrite dans tes vrais prix) --- */
function renderDemoBanner() {
  $("#demoBanner").hidden = !Store.demo;
  $("#btnDemo").textContent = Store.demo ? "Quitter la démo" : "Voir une démo (prix fictifs)";
}
$("#btnDemo").onclick = () => { Store.demo = !Store.demo; renderAll(); };

/* --- tableau de saisie des prix --- */
function renderPrices() {
  const s = SERVEURS.find((x) => x.id === S.server);
  $("#srvName").textContent = s.id + " — " + s.type;
  $("#srvNote").textContent = s.note;
  const n = Store.count(S.server);
  $("#priceCount").textContent = `${n} / ${PRICE_ROWS.length} prix renseignés`;
  $("#priceCount").className = "count " + (n === 0 ? "bad" : n < PRICE_ROWS.length ? "mid" : "ok");
  $("#emptyPrices").hidden = n > 0 || Store.demo;
  $("#priceBody").innerHTML = PRICE_ROWS.map((r) => {
    const e = Store.entry(S.server, r.key);
    return `<tr data-key="${r.key}">
      <td><label for="p_${r.key}">${r.label}</label><div class="mut">${r.hint}</div></td>
      <td><input id="p_${r.key}" inputmode="numeric" autocomplete="off" placeholder="ex. 250k" value="${e ? fmt(e.v) : ""}" ${Store.demo ? "disabled" : ""}><div class="err" hidden></div></td>
      <td>${ageBadge(Store.ageDays(S.server, r.key))}</td>
      <td><button class="btn sm" data-clear="${r.key}" aria-label="Effacer ${r.label}" ${e && !Store.demo ? "" : "disabled"}>✕</button></td></tr>`;
  }).join("");
  $$("#priceBody input").forEach((inp) => {
    inp.onchange = () => {
      const key = inp.closest("tr").dataset.key, err = inp.parentElement.querySelector(".err");
      if (inp.value.trim() === "") { saved(Store.setPrice(S.server, key, 0)); }
      else {
        const v = parseKamas(inp.value);
        if (!v) { inp.classList.add("invalid"); err.hidden = false; err.textContent = "Format : 250000, 250k, 1,5M"; return; }
        inp.classList.remove("invalid"); err.hidden = true;
        saved(Store.setPrice(S.server, key, v));
      }
      renderAll();
    };
  });
  $$("[data-clear]").forEach((b) => (b.onclick = () => { saved(Store.setPrice(S.server, b.dataset.clear, 0)); renderAll(); }));
}
$("#btnCopyAll").onclick = () => {
  if (!Store.count(S.server)) return alert("Aucun prix à copier sur ce serveur.");
  if (confirm(`Copier les prix de ${S.server} vers TOUS les autres serveurs ? Leurs prix actuels seront écrasés.`)) { saved(Store.copyToAll(S.server)); renderAll(); }
};
$("#btnReset").onclick = () => {
  if (confirm(`Vider tous les prix de ${S.server} ? (Pense à exporter avant.)`)) { saved(Store.clearServer(S.server)); renderAll(); }
};
$("#btnPaste").onclick = () => {
  const r = Store.importPaste(S.server, $("#pasteBox").value);
  $("#pasteRes").innerHTML = `<b>${r.ok}</b> ligne(s) importée(s)` + (r.bad.length ? `, <span class="neg">${r.bad.length} ignorée(s)</span> : <code>${r.bad.slice(0, 3).join(" | ").replace(/</g, "&lt;")}</code>` : "");
  if (r.ok) $("#pasteBox").value = "";
  saved(true); renderAll();
};
$("#btnExport").onclick = () => {
  const blob = new Blob([Store.exportJSON()], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = "dragodindes-prix-" + new Date().toISOString().slice(0, 10) + ".json"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("#fileImport").onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    if (!confirm("Importer ce fichier remplace TOUTES tes données actuelles. Continuer ?")) return;
    const r = Store.importJSON(rd.result);
    $("#pasteRes").textContent = r.msg;
    if (r.ok) { Object.assign(S, Store.state); location.reload(); }
  };
  rd.readAsText(f); e.target.value = "";
};

/* --- simulateur d'un couple --- */
const genOpts = (sel, from) => Array.from({ length: 11 - from }, (_, i) => from + i).map((g) => `<option value="${g}" ${g === sel ? "selected" : ""}>Gén. ${g}</option>`).join("");
function renderCalcForm() {
  const c = S.calc;
  $("#calcForm").innerHTML = `
    <div><label>Génération cible</label><select data-k="target" data-num="1">${genOpts(c.target, 2)}</select></div>
    <div><label>Parent A — génération</label><select data-k="genA" data-num="1">${genOpts(c.genA, 1)}</select></div>
    <div><label>Parent B — génération</label><select data-k="genB" data-num="1">${genOpts(c.genB, 1)}</select></div>
    <div><label>Parent A — niveau (1-200)</label><input type="number" min="1" max="200" data-k="lvlA" value="${c.lvlA}"></div>
    <div><label>Parent B — niveau (1-200)</label><input type="number" min="1" max="200" data-k="lvlB" value="${c.lvlB}"></div>
    <div><label>Origine des parents</label><select data-k="origin">
      <option value="hdv" ${c.origin === "hdv" ? "selected" : ""}>Achetés (prix HDV)</option>
      <option value="capture" ${c.origin === "capture" ? "selected" : ""}>Capturés / déjà à moi (0 kamas)</option></select></div>
    <div><label>Après l'accouplement, les parents…</label><select data-k="parentsMode">
      <option value="extract" ${c.parentsMode === "extract" ? "selected" : ""}>Sont extraits (neurones)</option>
      <option value="sell" ${c.parentsMode === "sell" ? "selected" : ""}>Sont revendus stériles</option>
      <option value="none" ${c.parentsMode === "none" ? "selected" : ""}>Valeur 0 (clonés pour un succès…)</option></select></div>
    <div><label>Revente d'un parent stérile (kamas)</label><input data-k="sterileSell" data-kamas="1" inputmode="numeric" value="${c.sterileSell ? fmt(c.sterileSell) : ""}"></div>
    <div><label>Carburant par couple (kamas)</label><input data-k="fuel" data-kamas="1" inputmode="numeric" value="${c.fuel ? fmt(c.fuel) : ""}"></div>
    <div><label>Forcer le prix du bébé cible</label><input data-k="priceTarget" data-kamas="1" inputmode="numeric" placeholder="vide = table" value="${c.priceTarget ? fmt(c.priceTarget) : ""}"></div>
    <div><label>Forcer le prix du bébé raté</label><input data-k="priceFail" data-kamas="1" inputmode="numeric" placeholder="vide = gén. −1" value="${c.priceFail ? fmt(c.priceFail) : ""}"></div>
    <div class="check"><input type="checkbox" id="cOpti" data-k="opti" ${c.opti ? "checked" : ""}><label for="cOpti">Utiliser une Optimakina</label></div>`;
  $("#hypForm").innerHTML = `
    <div><label>Bonus de l'Optimakina</label><select data-k="optiBonus" data-num="1"><option value="10" ${c.optiBonus == 10 ? "selected" : ""}>+10 % (2 guides)</option><option value="20" ${c.optiBonus == 20 ? "selected" : ""}>+20 % (1 guide)</option></select></div>
    <div class="check"><input type="checkbox" id="cRepro" data-k="repro" ${c.repro ? "checked" : ""}><label for="cRepro">Capacité Reproducteur (+1 bébé, mêmes chances)</label></div>
    <div class="check"><input type="checkbox" id="cGen" data-k="countGenetons" ${c.countGenetons ? "checked" : ""}><label for="cGen">Compter les Génétons dans le profit</label></div>`;
  [$("#calcForm"), $("#hypForm")].forEach((root) => $$("[data-k]", root).forEach((el) => {
    const ev = el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "change";
    el.addEventListener(ev, () => {
      const k = el.dataset.k;
      if (el.type === "checkbox") c[k] = el.checked;
      else if (el.dataset.kamas) {
        const raw = el.value.trim(), v = raw === "" ? 0 : parseKamas(raw);
        if (v === null) { el.classList.add("invalid"); return; }
        el.classList.remove("invalid"); c[k] = v; el.value = v ? fmt(v) : "";
      } else if (el.dataset.num) c[k] = +el.value;
      else if (el.type === "number") c[k] = Calc.clamp(el.value, +el.min, +el.max), el.value = c[k];
      else c[k] = el.value;
      Object.assign(S.calc, Store.cleanCalc(c)); persist(); renderResults(); renderMatrix(); renderChart();
    });
  }));
}

function renderResults() {
  const c = S.calc, P = Store.values(S.server), r = Calc.compute(c, P);
  const sgn = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v));
  const cls = (v) => (v >= 0 ? "pos" : "neg");
  const beTxt = r.breakEvenP === null ? "jamais rentable à ces prix"
    : r.breakEvenP <= 0 ? "toujours rentable (même en cas d'échec)"
    : r.breakEvenP > 1 ? "impossible (même à 100 %)" : (r.breakEvenP * 100).toFixed(0) + " %";
  const miss = r.missing.length ? `<div class="warn">⚠ Résultat <b>incomplet</b> : prix manquants → ${r.missing.map((m) => `<span class="pill">${m}</span>`).join(" ")} <a href="#priceTable">Saisir</a></div>` : "";
  $("#calcRes").innerHTML = miss + `
    <div class="hero ${r.incomplete ? "dim" : ""}">
      <div class="hero-col"><small>Si ça rate (génération inférieure)</small><b class="${cls(r.profitFail)}">${sgn(r.profitFail)}</b></div>
      <div class="hero-col"><small>Si ça passe (génération ${c.target})</small><b class="${cls(r.profitSuccess)}">${sgn(r.profitSuccess)}</b></div>
      <div class="hero-col"><small>Chance de réussite</small><b>${(r.p * 100).toFixed(1)} %</b></div>
    </div>
    <p class="mut">Un couple = ${r.babies} bébé${r.babies > 1 ? "s" : ""} : le résultat réel est l'une des deux colonnes, jamais la moyenne. Espérance sur beaucoup de couples : <b class="${cls(r.profitExpected)}">${sgn(r.profitExpected)} kamas</b> par couple. Chance minimale pour être rentable : <b>${beTxt}</b>.</p>
    <div class="cascade">
      <div><small>Coût parents</small><b>${fmt(r.costParents)}</b></div><div>+<small>Carburant</small><b>${fmt(r.fuel)}</b></div>
      <div>+<small>Optimakina</small><b>${fmt(r.costOpti)}</b></div><div>=<small>Coût total</small><b>${fmt(r.cost)}</b></div>
      <div>·<small>Récup. parents</small><b>${fmt(r.recovery)}</b></div><div>·<small>Génétons (si succès)</small><b>${r.genGain}</b></div>
    </div>`;
  // sensibilité ±20 % sur le prix du bébé cible
  if (r.priceT > 0) {
    const row = (f) => { const x = Calc.compute(Object.assign({}, c, { priceTarget: Math.round(r.priceT * f) }), P); return `<td class="${cls(x.profitExpected)}">${sgn(x.profitExpected)}</td>`; };
    $("#sens").innerHTML = `<table><thead><tr><th>Prix du bébé cible</th><th>−20 %</th><th>Actuel</th><th>+20 %</th></tr></thead><tbody><tr><td>Profit espéré / couple</td>${row(0.8)}${row(1)}${row(1.2)}</tr></tbody></table>`;
  } else $("#sens").innerHTML = "";
}

/* --- heatmap serveurs × génération (cases incomplètes hachurées, jamais colorées) --- */
function renderMatrix() {
  const mode = S.matB, cells = {};
  let maxAbs = 0;
  SERVEURS.forEach((s) => {
    const P = Store.values(s.id);
    cells[s.id] = [];
    for (let g = 2; g <= 10; g++) {
      const r = Calc.compute(Calc.scenario(S.calc, g, mode), P);
      cells[s.id][g] = r;
      if (!r.incomplete) maxAbs = Math.max(maxAbs, Math.abs(r.profitExpected));
    }
  });
  let html = "<thead><tr><th class='l'>Serveur</th>" + Array.from({ length: 9 }, (_, i) => `<th>Gén. ${i + 2}</th>`).join("") + "</tr></thead><tbody>";
  SERVEURS.forEach((s) => {
    const n = Store.count(s.id), age = Store.oldestAge(s.id);
    const done = cells[s.id].filter((r) => r && !r.incomplete);
    const best = done.length ? Math.max(...done.map((r) => r.profitExpected)) : null;
    html += `<tr><th class="l" scope="row">${s.id}<div class="mut">${n === 0 ? "aucun prix" : n + " prix" + (age !== null && age > 7 ? " · ⏱ " + age + " j" : "")}</div></th>`;
    for (let g = 2; g <= 10; g++) {
      const r = cells[s.id][g];
      if (r.incomplete) { html += `<td class="inc" title="Prix manquants : ${r.missing.join(", ")}">—</td>`; continue; }
      const v = r.profitExpected, a = maxAbs ? 0.12 + 0.5 * Math.abs(v) / maxAbs : 0;
      html += `<td class="${v === best ? "best" : ""}" style="background:${v >= 0 ? `rgba(62,207,142,${a})` : `rgba(239,91,91,${a})`}" title="Succès ${fmt(r.profitSuccess)} / échec ${fmt(r.profitFail)}">${v >= 0 ? "+" : "−"}${fmtShort(Math.abs(v))}</td>`;
    }
    html += "</tr>";
  });
  $("#matrix").innerHTML = html + "</tbody>";
  $("#matB").value = mode;
}
$("#matB").onchange = () => { S.matB = $("#matB").value; persist(); renderMatrix(); renderChart(); };

/* --- graphique SVG : profit espéré par génération cible (serveur actif) --- */
function renderChart() {
  const P = Store.values(S.server), W = 640, H = 240, pl = 56, pb = 28, pt = 14;
  const rs = []; for (let g = 2; g <= 10; g++) rs[g] = Calc.compute(Calc.scenario(S.calc, g, S.matB), P);
  const ok = rs.filter((r) => r && !r.incomplete);
  if (!ok.length) { $("#chart").innerHTML = '<p class="mut empty">Renseigne les prix des générations pour voir le graphique de ce serveur.</p>'; return; }
  const vals = ok.flatMap((r) => [r.profitFail, r.profitSuccess, 0]);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const y = (v) => pt + (H - pt - pb) * (1 - (v - lo) / span), bw = (W - pl - 10) / 9;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Profit par génération cible">`;
  svg += `<line x1="${pl}" x2="${W - 6}" y1="${y(0)}" y2="${y(0)}" stroke="currentColor" opacity=".4"/>`;
  [lo, hi].forEach((v) => (svg += `<text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="currentColor" opacity=".7">${fmtShort(v)}</text>`));
  for (let g = 2; g <= 10; g++) {
    const x = pl + (g - 2) * bw + bw / 2, r = rs[g];
    svg += `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".7">${g}</text>`;
    if (r.incomplete) { svg += `<text x="${x}" y="${y(0) - 6}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".4">—</text>`; continue; }
    const v = r.profitExpected, top = Math.min(y(v), y(0)), h = Math.abs(y(v) - y(0)) || 1;
    svg += `<rect x="${x - bw * 0.28}" y="${top}" width="${bw * 0.56}" height="${h}" rx="3" fill="${v >= 0 ? "var(--acc2)" : "var(--bad)"}" opacity=".8"><title>Gén. ${g} : espéré ${fmt(v)} (échec ${fmt(r.profitFail)} / succès ${fmt(r.profitSuccess)})</title></rect>`;
    svg += `<line x1="${x}" x2="${x}" y1="${y(r.profitFail)}" y2="${y(r.profitSuccess)}" stroke="currentColor" stroke-width="2"/>`;
  }
  $("#chart").innerHTML = svg + "</svg>";
}

function renderAll() {
  renderDemoBanner(); renderPrices(); renderResults(); renderMatrix(); renderChart();
}

/* ---------- init ---------- */
renderCalcForm();
showTab(location.hash.replace("#/", "") || "vue");
renderAll();
window.addEventListener("beforeunload", () => { Store.demo = false; });

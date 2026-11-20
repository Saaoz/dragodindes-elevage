/* Tests de calc.js — Node : `node tests.js` ; navigateur : ouvrir tests.html */
(function (root) {
  const Calc = typeof require !== "undefined" && typeof module !== "undefined" ? require("./calc.js") : root.Calc;
  const results = [];
  const eq = (name, got, want) => results.push({ name, ok: JSON.stringify(got) === JSON.stringify(want), got, want });
  const near = (name, got, want) => results.push({ name, ok: Math.abs(got - want) < 1e-6, got, want });

  // parseKamas : jamais de corruption silencieuse
  eq("parse 1 200 000", Calc.parseKamas("1 200 000"), 1200000);
  eq("parse 1.200.000", Calc.parseKamas("1.200.000"), 1200000);
  eq("parse 250k", Calc.parseKamas("250k"), 250000);
  eq("parse 1,5M", Calc.parseKamas("1,5M"), 1500000);
  eq("parse 300000 kamas", Calc.parseKamas("300000 kamas"), 300000);
  eq("parse texte", Calc.parseKamas("abc"), null);
  eq("parse négatif", Calc.parseKamas("-5"), null);
  eq("parse vide", Calc.parseKamas(""), null);

  const P = { gen: [0, 20000, 40000, 90000, 160000, 300000, 520000, 800000, 1300000, 2400000, 4000000], neurone: 25000, optimakina: 150000, genetons: 3000 };
  const base = { target: 5, genA: 4, genB: 4, lvlA: 100, lvlB: 100, opti: true, optiBonus: 10, repro: false, origin: "hdv", parentsMode: "extract", sterileSell: 0, fuel: 0, priceTarget: 0, priceFail: 0, countGenetons: true };

  const r = Calc.compute(base, P);
  near("chance 70 %", r.p, 0.7);
  near("coût 470 000", r.cost, 470000);
  near("profit espéré 21 600", r.profitExpected, 21600);
  near("profit succès", r.profitSuccess, 300000 + 200000 + 16 * 3000 - 470000);
  near("profit échec", r.profitFail, 160000 + 200000 - 470000);
  eq("complet", r.incomplete, false);

  const r2 = Calc.compute(Object.assign({}, base, { countGenetons: false }), P);
  near("sans Génétons", r2.profitExpected, 21600 - 0.7 * 16 * 3000);

  // niveau 200 ×2 + Optimakina = 100 %
  near("100 % cap", Calc.chanceCible(200, 200, true, 10), 1);
  near("90 % sans Opti", Calc.chanceCible(200, 200, false, 10), 0.9);

  // prix manquants signalés, pas silencieusement mis à 0
  const rm = Calc.compute(base, { gen: Array(11).fill(0), neurone: 0, optimakina: 0, genetons: 0 });
  eq("incomplet si aucun prix", rm.incomplete, true);
  eq("liste des manquants non vide", rm.missing.length > 0, true);

  // seuil de rentabilité
  const be = Calc.compute(base, P).breakEvenP;
  eq("breakEven entre 0 et 1", be > 0 && be < 1, true);

  const s = Calc.scenario(base, 7, "gen1");
  eq("scénario gen1", [s.target, s.genA, s.genB], [7, 6, 1]);

  const failed = results.filter((x) => !x.ok);
  if (typeof document !== "undefined") {
    document.getElementById("out").innerHTML =
      `<h2>${results.length - failed.length}/${results.length} tests OK</h2>` +
      results.map((x) => `<div style="color:${x.ok ? "#3ecf8e" : "#ef5b5b"}">${x.ok ? "✔" : "✘"} ${x.name}${x.ok ? "" : " — obtenu " + JSON.stringify(x.got) + ", attendu " + JSON.stringify(x.want)}</div>`).join("");
  } else {
    results.forEach((x) => console.log((x.ok ? "OK  " : "FAIL") + " " + x.name + (x.ok ? "" : " got=" + JSON.stringify(x.got) + " want=" + JSON.stringify(x.want))));
    console.log(`\n${results.length - failed.length}/${results.length} tests OK`);
    if (failed.length) process.exit(1);
  }
})(typeof window !== "undefined" ? window : globalThis);

/*
 * Pure calculation functions (no DOM). Also loadable in Node for testing.
 */
(function (root) {
  const KOH_MW = 56.11;
  const NAOH_MW = 40.00;
  const G_PER = { g: 1, oz: 28.349523125, lb: 453.59237 };

  // Ranges as published by SoapCalc for its quality numbers.
  const QUALITIES = [
    { key: "hardness",     label: "Hardness",     min: 29,  max: 54,  scale: 100, tip: "Firmness of the bar. Lauric + myristic + palmitic + stearic.",
      low: "Soft bar: slower to unmold and cure.", high: "Very hard bar: can be brittle or crumbly to cut." },
    { key: "cleansing",    label: "Cleansing",    min: 12,  max: 22,  scale: 70,  tip: "How strongly the soap strips oils. Lauric + myristic.",
      low: "Mild cleansing.", high: "Strong cleansing: can feel drying. Consider a higher superfat." },
    { key: "conditioning", label: "Conditioning", min: 44,  max: 69,  scale: 100, tip: "Emollience. Oleic + ricinoleic + linoleic + linolenic.",
      low: "Less conditioning feel.", high: "Very conditioning: bar may be soft or slow to harden." },
    { key: "bubbly",       label: "Bubbly",       min: 14,  max: 46,  scale: 80,  tip: "Big, fluffy lather. Lauric + myristic + ricinoleic.",
      low: "Little fluffy lather.", high: "Very bubbly lather." },
    { key: "creamy",       label: "Creamy",       min: 16,  max: 48,  scale: 80,  tip: "Dense, stable lather. Palmitic + stearic + ricinoleic.",
      low: "Thin lather: less creamy and stable.", high: "Very dense lather." },
    { key: "iodine",       label: "Iodine",       min: 41,  max: 70,  scale: 150, tip: "Unsaturation. Higher means softer and more prone to rancidity.",
      low: "Low unsaturation: hard, long-lasting bar.", high: "High unsaturation: softer bar, more prone to rancidity (DOS)." },
    { key: "ins",          label: "INS",          min: 136, max: 165, scale: 300, tip: "SAP value minus iodine. A rough overall balance indicator; ~160 is classic.",
      low: "Low INS: softer bar that may take longer to firm up.", high: "High INS: hard bar, may be brittle." }
  ];

  function sapNaOH(oil) { return (oil.sap * NAOH_MW / KOH_MW) / 1000; } // g NaOH per g oil
  function sapKOH(oil)  { return oil.sap / 1000; }                       // g KOH per g oil

  /*
   * state: {
   *   units, totalOil, inputMode ('pct'|'wt'),
   *   naohShare (0-100, % of saponification done by NaOH), naohPurity, kohPurity (percent),
   *   superfat, waterMode ('pct'|'conc'|'ratio'), waterPct, lyeConc, waterRatio,
   *   fragrancePct,
   *   oils: [{ id, pct, wt }]
   * }
   * oilLookup: id -> oil record
   */
  function calculate(state, oilLookup) {
    const rows = [];
    let sumPct = 0;
    for (const r of state.oils) {
      const oil = oilLookup(r.id);
      if (!oil) continue;
      const pct = num(r.pct);
      const wt = state.inputMode === "pct" ? pct / 100 * num(state.totalOil) : num(r.wt);
      sumPct += pct;
      rows.push({ oil, pct, wt });
    }
    const oilTotal = rows.reduce((a, r) => a + r.wt, 0);
    if (state.inputMode === "wt") {
      for (const r of rows) r.pct = oilTotal > 0 ? r.wt / oilTotal * 100 : 0;
      sumPct = oilTotal > 0 ? 100 : 0;
    }

    const sf = num(state.superfat) / 100;
    const share = clamp(num(state.naohShare), 0, 100) / 100;
    const naohPur = clamp(num(state.naohPurity) || 100, 1, 100) / 100;
    const kohPur = clamp(num(state.kohPurity) || 100, 1, 100) / 100;

    let naohFull = 0, kohFull = 0;
    for (const r of rows) {
      naohFull += r.wt * sapNaOH(r.oil);
      kohFull += r.wt * sapKOH(r.oil);
    }
    const naoh = share * naohFull * (1 - sf) / naohPur;
    const koh = (1 - share) * kohFull * (1 - sf) / kohPur;
    const lye = naoh + koh;

    let water = 0;
    if (state.waterMode === "pct") water = oilTotal * num(state.waterPct) / 100;
    else if (state.waterMode === "conc") {
      const c = clamp(num(state.lyeConc), 1, 99) / 100;
      water = lye * (1 - c) / c;
    } else water = lye * num(state.waterRatio);

    const conc = lye + water > 0 ? lye / (lye + water) * 100 : 0;
    const ratio = lye > 0 ? water / lye : 0;
    const fragrance = oilTotal * num(state.fragrancePct) / 100;
    const batch = oilTotal + lye + water + fragrance;

    // Fragrance blend: split the total fragrance by relative parts.
    const comps = (state.fragrances || []);
    const totalParts = comps.reduce((a, c) => a + Math.max(0, num(c.parts)), 0);
    const blend = comps.map(c => {
      const parts = Math.max(0, num(c.parts));
      const share = totalParts > 0 ? parts / totalParts : 0;
      const wt = fragrance * share;
      return {
        name: c.name || "", type: c.type || "EO", parts, share, wt,
        pctOils: oilTotal > 0 ? wt / oilTotal * 100 : 0,
        max: c.max === "" || c.max == null ? null : num(c.max)
      };
    });

    // Recipe-wide profile, weighted by oil weight.
    const fa = [0, 0, 0, 0, 0, 0, 0, 0];
    let iod = 0, ins = 0;
    for (const r of rows) {
      const f = oilTotal > 0 ? r.wt / oilTotal : 0;
      r.oil.fa.forEach((v, i) => { fa[i] += v * f; });
      iod += r.oil.iod * f;
      ins += r.oil.ins * f;
    }
    const q = qualitiesFromFA(fa, iod, ins);

    return { rows, sumPct, oilTotal, naoh, koh, lye, water, conc, ratio, fragrance, batch, fa, q, share, blend, totalParts };
  }

  function qualitiesFromFA(fa, iod, ins) {
    const [lau, myr, pal, ste, ric, ole, lin, lnn] = fa;
    return {
      hardness: lau + myr + pal + ste,
      cleansing: lau + myr,
      conditioning: ole + ric + lin + lnn,
      bubbly: lau + myr + ric,
      creamy: pal + ste + ric,
      iodine: iod,
      ins: ins
    };
  }

  function oilQualities(oil) { return qualitiesFromFA(oil.fa, oil.iod, oil.ins); }

  /* Returns [{level: 'danger'|'warn'|'info', text}] */
  function warnings(state, res) {
    const w = [];
    const add = (level, text) => w.push({ level, text });
    if (!res.rows.length) { add("info", "Add oils from the list to start a recipe."); return w; }

    if (state.inputMode === "pct" && Math.abs(res.sumPct - 100) > 0.05)
      add("warn", `Oil percentages add up to ${fmt(res.sumPct, 1)}%, not 100%. Lye is calculated for the oils as entered (${fmt(res.sumPct, 1)}% of your total).`);

    const sf = num(state.superfat);
    if (sf < 0) add("danger", "Negative superfat means excess lye. The soap will be harsh and unsafe on skin.");
    else if (sf < 3) add("warn", "Superfat under 3% leaves little margin for scale error or SAP variation.");
    else if (sf > 20 && res.share > 0) add("warn", "Superfat above 20% gives soft, greasy bars that are more prone to rancidity.");

    if (res.lye > 0) {
      if (res.conc > 40) add("warn", `Lye concentration is ${fmt(res.conc, 1)}%. Very strong solutions trace fast and run hot. Best left to experienced makers.`);
      else if (res.conc < 25 && res.share > 0.5) add("info", `Lye concentration is ${fmt(res.conc, 1)}% (a lot of water). Expect slower trace, longer unmolding, and possible soda ash or warping.`);
    }

    const pctOf = ids => res.rows.filter(r => ids.includes(r.oil.id)).reduce((a, r) => a + r.pct, 0);
    const lauric = pctOf(["coconut-76", "palm-kernel", "babassu"]);
    if (lauric > 30 && sf < 10 && res.share > 0.5)
      add("warn", `High-lauric oils (coconut, palm kernel, babassu) are ${fmt(lauric, 0)}% of the recipe. Above ~30% bars can be drying; many makers raise the superfat to 10–20%.`);

    const pufa = res.fa[6] + res.fa[7];
    if (pufa > 15) add("warn", `Linoleic + linolenic is ${fmt(pufa, 0)}% (over 15%). Higher risk of rancidity (orange spots). Use fresh oils and consider an antioxidant like rosemary extract.`);

    const castor = pctOf(["castor"]);
    if (castor > 10 && res.share > 0.5) add("warn", `Castor oil at ${fmt(castor, 0)}% can make bars sticky or tacky. 5–8% is typical for bar soap.`);

    const wax = pctOf(["beeswax"]);
    if (wax > 8) add("warn", `Beeswax at ${fmt(wax, 0)}% is high. It speeds trace and can make bars draggy. Keep it to about 1–5%.`);
    else if (wax > 0) add("info", "Beeswax speeds trace. Soap warm (around 150°F / 65°C) so it stays melted.");

    if (pctOf(["stearic-acid"]) > 0) add("info", "Stearic acid accelerates trace. Mix with the warm oils and work quickly.");
    if (pctOf(["jojoba"]) > 10) add("info", "Jojoba is a liquid wax and leaves a large unsaponifiable fraction. It adds little lather above ~10%.");

    if (res.share > 0 && res.share < 1) add("info", `Dual lye: ${fmt(res.share * 100, 0)}% NaOH / ${fmt((1 - res.share) * 100, 0)}% KOH. Dissolve each lye separately, or together in the full water amount.`);
    if (res.share === 0) add("info", "KOH only: this makes a soft paste for liquid soap. The bar-soap quality ranges below don't apply.");

    if (num(state.fragrancePct) > 6) add("warn", `Fragrance at ${fmt(num(state.fragrancePct), 1)}% of oils is high. Check your supplier's IFRA maximum for skin-safe use.`);

    if (res.blend && res.blend.length) {
      if (res.totalParts <= 0) add("warn", "The fragrance blend has no parts entered, so it can't be split. Enter relative parts for each component.");
      if (num(state.fragrancePct) <= 0) add("warn", "The fragrance blend has components but the total fragrance is 0% of oils.");
      for (const c of res.blend) {
        const label = c.name.trim() || "Unnamed component";
        if (c.max != null && c.max > 0 && c.pctOils > c.max + 1e-9)
          add("danger", `${label} is ${fmt(c.pctOils, 2)}% of oils, above its ${fmt(c.max, 2)}% maximum. Lower its parts or the total fragrance.`);
      }
      const noMax = res.blend.filter(c => c.parts > 0 && (c.max == null || c.max <= 0)).length;
      if (noMax) add("info", `${noMax} blend component${noMax > 1 ? "s have" : " has"} no max % entered. Add the skin-safe limit from the supplier's IFRA sheet to check it.`);
    }

    if (res.share > 0.5) {
      for (const def of QUALITIES) {
        const v = res.q[def.key];
        if (v < def.min) add("info", `${def.label} ${fmt(v, 0)} is below ${def.min}. ${def.low}`);
        else if (v > def.max) add("info", `${def.label} ${fmt(v, 0)} is above ${def.max}. ${def.high}`);
      }
    }
    return w;
  }

  function num(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function fmt(v, d) { return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
  function toGrams(v, unit) { return v * G_PER[unit]; }
  function fromGrams(v, unit) { return v / G_PER[unit]; }

  const api = { calculate, warnings, oilQualities, sapNaOH, sapKOH, QUALITIES, G_PER, toGrams, fromGrams, fmt, num, KOH_MW, NAOH_MW };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SoapCalc = api;
})(typeof window !== "undefined" ? window : globalThis);

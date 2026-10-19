/* UI wiring for the soap calculator. Depends on oils.js and calc.js. */
(function () {
  "use strict";
  const C = window.SoapCalc;
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const KEYS = { current: "soapcalc.current", recipes: "soapcalc.recipes", custom: "soapcalc.customOils", blends: "soapcalc.blends", shareNotes: "soapcalc.shareNotes" };
  const DECIMALS = { g: 1, oz: 2, lb: 3 };

  const DEFAULT_STATE = () => ({
    name: "",
    units: "g",
    totalOil: 1000,
    inputMode: "pct",
    naohShare: 100,
    naohPurity: 100,
    kohPurity: 90,
    superfat: 5,
    waterMode: "pct",
    waterPct: 33,
    lyeConc: 33,
    waterRatio: 2,
    fragrancePct: 3,
    notes: "",
    oils: [],
    fragrances: []
  });

  // ---------- storage helpers (never throw) ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    }
  };

  let customOils = store.get(KEYS.custom, []);
  let state = DEFAULT_STATE();
  let previewOil = null;
  let catFilter = "all";
  let activeIndex = 0;

  function lookup(id) {
    return window.OILS.find(o => o.id === id) || customOils.find(o => o.id === id) || null;
  }
  function allOils() {
    return window.OILS.concat(customOils.map(o => Object.assign({ cat: "custom" }, o)));
  }

  // ---------- formatting ----------
  const fmt = C.fmt;
  function w(v, unit) { unit = unit || state.units; return fmt(v, DECIMALS[unit]); }
  function alt(vInUnit) {
    const g = C.toGrams(vInUnit, state.units);
    return state.units === "g" ? `${fmt(C.fromGrams(g, "oz"), 2)} oz` : `${fmt(g, 0)} g`;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- settings form <-> state ----------
  const bindings = [
    ["#recipe-name", "name", "text"],
    ["#total-oil", "totalOil", "num"],
    ["#naoh-purity", "naohPurity", "num"],
    ["#koh-purity", "kohPurity", "num"],
    ["#superfat", "superfat", "num"],
    ["#water-pct", "waterPct", "num"],
    ["#lye-conc", "lyeConc", "num"],
    ["#water-ratio", "waterRatio", "num"],
    ["#fragrance-pct", "fragrancePct", "num"],
    ["#notes", "notes", "text"]
  ];

  function writeForm() {
    for (const [sel, key] of bindings) $(sel).value = state[key];
    $("#units").value = state.units;
    $("#input-mode").value = state.inputMode;
    $("#naoh-share").value = state.naohShare;
    $$('input[name="water-mode"]').forEach(r => { r.checked = r.value === state.waterMode; });
    syncModeUI();
  }

  function syncModeUI() {
    $$(".unit-label").forEach(el => { el.textContent = state.units; });
    $("#naoh-share-out").textContent = state.naohShare;
    $("#koh-share-out").textContent = 100 - state.naohShare;
    $$(".presets .chip").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.share === +state.naohShare)));
    $$(".water-input").forEach(el => { el.hidden = el.dataset.mode !== state.waterMode; });
    $("#total-oil").readOnly = state.inputMode === "wt";
    $("#total-field").querySelector("span").firstChild.textContent =
      state.inputMode === "wt" ? "Total oil weight, from oils (" : "Total oil weight (";
  }

  function bindForm() {
    for (const [sel, key, type] of bindings) {
      $(sel).addEventListener("input", e => {
        state[key] = type === "num" ? e.target.value : e.target.value;
        if (key === "totalOil") refreshRowCells();
        changed();
      });
    }
    $("#units").addEventListener("change", e => {
      const from = state.units, to = e.target.value;
      const f = C.G_PER[from] / C.G_PER[to];
      state.totalOil = +fmt(C.num(state.totalOil) * f, DECIMALS[to]);
      state.oils.forEach(r => { r.wt = +(C.num(r.wt) * f).toFixed(4); });
      state.units = to;
      $("#total-oil").value = state.totalOil;
      syncModeUI(); renderRecipe(); changed();
    });
    $("#input-mode").addEventListener("change", e => {
      const mode = e.target.value;
      if (mode === "wt") {
        state.oils.forEach(r => { r.wt = +(C.num(r.pct) / 100 * C.num(state.totalOil)).toFixed(4); });
      } else {
        const sum = state.oils.reduce((a, r) => a + C.num(r.wt), 0);
        state.oils.forEach(r => { r.pct = sum > 0 ? +(C.num(r.wt) / sum * 100).toFixed(2) : 0; });
        state.totalOil = +fmt(sum, DECIMALS[state.units]) || state.totalOil;
        $("#total-oil").value = state.totalOil;
      }
      state.inputMode = mode;
      syncModeUI(); renderRecipe(); changed();
    });
    $("#naoh-share").addEventListener("input", e => { state.naohShare = +e.target.value; syncModeUI(); changed(); });
    $$(".presets .chip").forEach(b => b.addEventListener("click", () => {
      state.naohShare = +b.dataset.share;
      $("#naoh-share").value = state.naohShare;
      syncModeUI(); changed();
    }));
    $$('input[name="water-mode"]').forEach(r => r.addEventListener("change", () => {
      state.waterMode = r.value; syncModeUI(); changed();
    }));
  }

  // ---------- oil picker ----------
  function renderCatFilters() {
    const cats = ["all"].concat(Object.keys(window.CATEGORIES).filter(c => c !== "custom" || customOils.length));
    $("#cat-filters").innerHTML = cats.map(c =>
      `<button type="button" class="chip" data-cat="${c}" aria-pressed="${c === catFilter}">${c === "all" ? "All" : window.CATEGORIES[c]}</button>`
    ).join("");
    $$("#cat-filters .chip").forEach(b => b.addEventListener("click", () => {
      catFilter = b.dataset.cat; activeIndex = 0; renderCatFilters(); renderOilList();
    }));
  }

  function filteredOils() {
    const q = $("#oil-search").value.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    return allOils()
      .filter(o => catFilter === "all" || o.cat === catFilter)
      .filter(o => terms.every(t => o.name.toLowerCase().includes(t)))
      .sort((a, b) => {
        if (q) { // names that start with the query first
          const as = a.name.toLowerCase().startsWith(q) ? 0 : 1, bs = b.name.toLowerCase().startsWith(q) ? 0 : 1;
          if (as !== bs) return as - bs;
        }
        return a.name.localeCompare(b.name);
      });
  }

  function renderOilList() {
    const list = filteredOils();
    const used = new Set(state.oils.map(r => r.id));
    if (activeIndex >= list.length) activeIndex = Math.max(0, list.length - 1);
    $("#oil-list").innerHTML = list.length ? list.map((o, i) => `
      <li role="option" data-id="${esc(o.id)}" class="${used.has(o.id) ? "in-recipe" : ""} ${i === activeIndex ? "active" : ""}">
        <span>${esc(o.name)}</span><span class="add">${used.has(o.id) ? "added" : "+ add"}</span>
      </li>`).join("") : `<li class="none">No match. Try another name, or add a custom oil.</li>`;
    $$("#oil-list li[data-id]").forEach(li => {
      li.addEventListener("click", () => addOil(li.dataset.id));
      li.addEventListener("mouseenter", () => showPreview(lookup(li.dataset.id)));
    });
  }

  function showPreview(oil) {
    previewOil = oil;
    const el = $("#oil-preview");
    if (!oil) { el.innerHTML = `<span class="hint">Hover over an oil to see its SAP values and compare it on the quality bars.</span>`; renderBars(lastResult); return; }
    const sat = oil.fa.slice(0, 4).reduce((a, b) => a + b, 0);
    const unsat = oil.fa.slice(4).reduce((a, b) => a + b, 0);
    el.innerHTML = `<strong>${esc(oil.name)}</strong> · SAP NaOH ${fmt(C.sapNaOH(oil), 4)} · KOH ${fmt(C.sapKOH(oil), 4)} · Iodine ${oil.iod} · INS ${oil.ins}` +
      (sat + unsat > 0 ? ` · Sat:Unsat ${fmt(sat, 0)}:${fmt(unsat, 0)}` : "") +
      `<br>Black markers on the quality bars show this oil on its own.`;
    renderBars(lastResult);
  }

  function addOil(id) {
    if (state.oils.some(r => r.id === id)) { toast("Already in the recipe"); return; }
    const remaining = Math.max(0, 100 - state.oils.reduce((a, r) => a + C.num(r.pct), 0));
    const row = { id, pct: state.inputMode === "pct" ? +fmt(remaining, 1) : 0, wt: 0 };
    if (state.inputMode === "pct") row.wt = row.pct / 100 * C.num(state.totalOil);
    state.oils.push(row);
    renderRecipe(); renderOilList(); changed();
    const inputs = $$("#recipe-body tr:last-child input:not([readonly])");
    if (inputs[0]) { inputs[0].focus(); inputs[0].select(); }
  }

  function bindPicker() {
    $("#oil-search").addEventListener("input", () => { activeIndex = 0; renderOilList(); });
    $("#oil-search").addEventListener("keydown", e => {
      const list = filteredOils();
      if (e.key === "ArrowDown") { activeIndex = Math.min(list.length - 1, activeIndex + 1); renderOilList(); showPreview(list[activeIndex]); e.preventDefault(); }
      else if (e.key === "ArrowUp") { activeIndex = Math.max(0, activeIndex - 1); renderOilList(); showPreview(list[activeIndex]); e.preventDefault(); }
      else if (e.key === "Enter" && list[activeIndex]) { addOil(list[activeIndex].id); e.target.select(); e.preventDefault(); }
    });
    $("#oil-list").addEventListener("mouseleave", () => showPreview(null));
  }

  // ---------- recipe table ----------
  function renderRecipe() {
    const body = $("#recipe-body");
    const ro = state.inputMode === "wt";
    body.innerHTML = state.oils.map((r, i) => {
      const oil = lookup(r.id);
      return `<tr data-i="${i}">
        <td>${oil ? esc(oil.name) : `<em>Unknown oil (${esc(r.id)})</em>`}</td>
        <td class="num"><input type="number" class="in-pct" step="any" min="0" value="${fmt(C.num(r.pct), ro ? 1 : 2) * 1}" ${ro ? "readonly tabindex=-1" : ""} aria-label="Percent"></td>
        <td class="num"><input type="number" class="in-wt" step="any" min="0" value="${w(rowWeight(r)) * 1}" aria-label="Weight"></td>
        <td><button type="button" class="remove" aria-label="Remove">×</button></td>
      </tr>`;
    }).join("");
    $("#recipe-empty").hidden = state.oils.length > 0;

    $$("#recipe-body tr").forEach(tr => {
      const i = +tr.dataset.i;
      tr.querySelector(".in-pct").addEventListener("input", e => {
        state.oils[i].pct = e.target.value;
        state.oils[i].wt = C.num(e.target.value) / 100 * C.num(state.totalOil);
        tr.querySelector(".in-wt").value = w(state.oils[i].wt) * 1;
        changed();
      });
      tr.querySelector(".in-wt").addEventListener("input", e => {
        state.oils[i].wt = e.target.value;
        if (state.inputMode === "pct") {
          const t = C.num(state.totalOil);
          state.oils[i].pct = t > 0 ? +(C.num(e.target.value) / t * 100).toFixed(2) : 0;
          tr.querySelector(".in-pct").value = state.oils[i].pct;
        }
        changed();
      });
      tr.querySelector(".remove").addEventListener("click", () => {
        state.oils.splice(i, 1); renderRecipe(); renderOilList(); changed();
      });
      tr.addEventListener("mouseenter", () => showPreview(lookup(state.oils[i].id)));
      tr.addEventListener("mouseleave", () => showPreview(null));
    });
  }

  function rowWeight(r) { return state.inputMode === "pct" ? C.num(r.pct) / 100 * C.num(state.totalOil) : C.num(r.wt); }

  // Update derived cells without re-rendering (keeps focus while typing).
  function refreshRowCells() {
    $$("#recipe-body tr").forEach(tr => {
      const r = state.oils[+tr.dataset.i];
      if (state.inputMode === "pct") {
        const wi = tr.querySelector(".in-wt");
        if (document.activeElement !== wi) wi.value = w(rowWeight(r)) * 1;
      }
    });
  }

  // ---------- fragrance blend ----------
  function renderBlend() {
    const body = $("#blend-body");
    body.innerHTML = state.fragrances.map((c, i) => `
      <tr data-i="${i}">
        <td class="b-name-cell"><input type="text" class="b-name" value="${esc(c.name || "")}" placeholder="e.g. Lavender 40/42" aria-label="Name"></td>
        <td data-label="Type"><select class="b-type" aria-label="Type">
          <option value="EO" ${c.type === "EO" ? "selected" : ""}>EO</option>
          <option value="FO" ${c.type === "FO" ? "selected" : ""}>FO</option>
        </select></td>
        <td class="num" data-label="Parts"><input type="number" class="b-parts" step="any" min="0" value="${c.parts}" aria-label="Parts"></td>
        <td class="num b-share" data-label="% of blend">–</td>
        <td class="num b-wt" data-label="Weight">–</td>
        <td class="num" data-label="Max % of oils"><input type="number" class="b-max" step="any" min="0" value="${c.max == null ? "" : c.max}" placeholder="–" aria-label="Max % of oils"></td>
        <td><button type="button" class="remove" aria-label="Remove">×</button></td>
      </tr>`).join("");
    $("#blend-empty").hidden = state.fragrances.length > 0;

    $$("#blend-body tr").forEach(tr => {
      const i = +tr.dataset.i;
      const c = state.fragrances[i];
      tr.querySelector(".b-name").addEventListener("input", e => { c.name = e.target.value; changed(); });
      tr.querySelector(".b-type").addEventListener("change", e => { c.type = e.target.value; changed(); });
      tr.querySelector(".b-parts").addEventListener("input", e => { c.parts = e.target.value; changed(); });
      tr.querySelector(".b-max").addEventListener("input", e => { c.max = e.target.value === "" ? null : e.target.value; changed(); });
      tr.querySelector(".remove").addEventListener("click", () => { state.fragrances.splice(i, 1); renderBlend(); changed(); });
    });
  }

  function renderBlendDerived(res) {
    const u = state.units;
    const pct = C.num(state.fragrancePct);
    $("#fragrance-hint").textContent = `= ${w(res.fragrance)} ${u} (${alt(res.fragrance)}) · ${fmt(pct * 10, 0)} g per kg · ${fmt(pct / 100 * 16, 2)} oz per lb of oils`;
    $("#fragrance-total").innerHTML = `Total fragrance: <strong>${w(res.fragrance)} ${u}</strong> <span class="muted">(${alt(res.fragrance)}) · ${fmt(pct, 1)}% of oils, set under Water &amp; fragrance</span>`;
    $$("#blend-body tr").forEach(tr => {
      const b = res.blend[+tr.dataset.i];
      if (!b) return;
      tr.querySelector(".b-share").textContent = fmt(b.share * 100, 1) + "%";
      tr.querySelector(".b-wt").innerHTML = `${w(b.wt)}<div class="muted small">${fmt(b.pctOils, 2)}% of oils</div>`;
      const over = b.max != null && b.max > 0 && b.pctOils > b.max + 1e-9;
      tr.classList.toggle("over", over);
    });
  }

  function refreshBlendList() {
    const blends = store.get(KEYS.blends, []);
    $("#blend-load").innerHTML = `<option value="">Saved blends…</option>` +
      blends.map((b, i) => `<option value="${i}">${esc(b.name)}</option>`).join("") +
      (blends.length ? `<option value="__delete">Delete a saved blend…</option>` : "");
  }

  function bindBlend() {
    $("#btn-blend-add").addEventListener("click", () => {
      state.fragrances.push({ name: "", type: "EO", parts: 1, max: null });
      renderBlend(); changed();
      const last = $$("#blend-body tr:last-child .b-name")[0];
      if (last) last.focus();
    });
    $("#btn-blend-save").addEventListener("click", () => {
      if (!state.fragrances.length) { toast("Add blend components first"); return; }
      const name = prompt("Name this blend:", state.fragrances.map(c => c.name).filter(Boolean).join(" / ").slice(0, 60) || "My blend");
      if (!name) return;
      const blends = store.get(KEYS.blends, []);
      const entry = { name, fragrancePct: C.num(state.fragrancePct), items: JSON.parse(JSON.stringify(state.fragrances)) };
      const idx = blends.findIndex(b => b.name === name);
      if (idx >= 0) blends[idx] = entry; else blends.push(entry);
      blends.sort((a, b) => a.name.localeCompare(b.name));
      toast(store.set(KEYS.blends, blends) ? "Blend saved" : "Couldn't save: browser storage is unavailable.");
      refreshBlendList();
    });
    $("#blend-load").addEventListener("change", e => {
      const v = e.target.value;
      const blends = store.get(KEYS.blends, []);
      if (v === "__delete") {
        const name = prompt("Type the name of the blend to delete:\n" + blends.map(b => "• " + b.name).join("\n"));
        if (name && blends.some(b => b.name === name)) { store.set(KEYS.blends, blends.filter(b => b.name !== name)); toast("Blend deleted"); }
      } else if (v !== "" && blends[+v]) {
        const b = blends[+v];
        state.fragrances = JSON.parse(JSON.stringify(b.items));
        if (b.fragrancePct) { state.fragrancePct = b.fragrancePct; $("#fragrance-pct").value = b.fragrancePct; }
        renderBlend(); changed();
        toast(`Loaded “${b.name}”`);
      }
      refreshBlendList();
    });
  }

  // ---------- results ----------
  let lastResult = null;

  function changed() {
    const res = C.calculate(state, lookup);
    lastResult = res;
    if (state.inputMode === "wt") {
      res.rows.forEach((r, i) => {
        state.oils[i].pct = r.pct;
        const cell = $$("#recipe-body .in-pct")[i];
        if (cell) cell.value = fmt(r.pct, 1) * 1;
      });
      state.totalOil = +fmt(res.oilTotal, DECIMALS[state.units]);
      $("#total-oil").value = state.totalOil;
    }
    renderTotals(res);
    renderStats(res);
    renderBlendDerived(res);
    renderWarnings(res);
    renderBars(res);
    store.set(KEYS.current, state);
    if (location.hash.startsWith("#r=")) history.replaceState(null, "", location.pathname + location.search);
  }

  function renderTotals(res) {
    const el = $("#pct-total");
    if (!state.oils.length) { el.textContent = ""; return; }
    const off = state.inputMode === "pct" && Math.abs(res.sumPct - 100) > 0.05;
    el.innerHTML = `Total ${fmt(res.sumPct, 1)}% · ${w(res.oilTotal)} ${state.units}` + (off ? ` <span style="color:var(--warn)">(should be 100%)</span>` : "");
  }

  function renderStats(res) {
    const u = state.units;
    const stat = (label, v, cls) => `<div class="stat ${cls || ""}"><div class="label">${label}</div><div class="value">${w(v)} <small>${u}</small></div><div class="sub">${alt(v)}</div></div>`;
    let html = stat("Oils", res.oilTotal);
    if (res.share > 0) html += stat(`NaOH${C.num(state.naohPurity) < 100 ? ` (${state.naohPurity}% pure)` : ""}`, res.naoh, "lye");
    if (res.share < 1) html += stat(`KOH (${state.kohPurity}% pure)`, res.koh, "lye");
    html += stat("Water", res.water);
    if (res.fragrance > 0) html += stat("Fragrance", res.fragrance);
    html += stat("Total batch", res.batch);
    html += `<div class="stat"><div class="label">Lye conc.</div><div class="value">${fmt(res.conc, 1)}%</div><div class="sub" title="Water ${fmt(res.oilTotal ? res.water / res.oilTotal * 100 : 0, 1)}% of oils">water : lye ${fmt(res.ratio, 2)} : 1</div></div>`;
    $("#batch-stats").innerHTML = html;
  }

  function renderWarnings(res) {
    const list = C.warnings(state, res);
    const serious = list.filter(x => x.level !== "info");
    let html = list.map(x => `<li class="${x.level}">${esc(x.text)}</li>`).join("");
    if (res.rows.length && !serious.length) html = `<li class="ok">No problems found in the lye, water or oil balance.</li>` + html;
    $("#warnings").innerHTML = html;
    const dangers = list.filter(x => x.level === "danger").length;
    const warns = list.filter(x => x.level === "warn").length;
    const status = !res.rows.length ? "" : dangers ? "danger" : warns ? "warn" : "ok";
    const card = $("#warnings").closest(".card");
    card.classList.remove("status-ok", "status-warn", "status-danger");
    if (status) card.classList.add("status-" + status);
    const badge = $("#check-badge");
    badge.className = "badge" + (status ? " " + status : "");
    badge.textContent = !status ? "" : dangers
      ? `${dangers} problem${dangers > 1 ? "s" : ""}${warns ? ` · ${warns} warning${warns > 1 ? "s" : ""}` : ""}`
      : warns ? `${warns} warning${warns > 1 ? "s" : ""}` : "All clear";
  }

  function barStatus(v, min, max) {
    if (v >= min && v <= max) return "ok";
    const span = max - min;
    return (v < min - span * 0.5 || v > max + span * 0.5) ? "danger" : "warn";
  }

  function renderBars(res) {
    if (!res) return;
    const has = res.rows.length > 0;
    const one = previewOil ? C.oilQualities(previewOil) : null;
    const bar = (label, tip, v, scale, min, max, ghost) => {
      const pct = x => Math.max(0, Math.min(100, x / scale * 100));
      const status = min == null ? "neutral" : barStatus(v, min, max);
      return `<div class="bar-row">
        <span class="bar-label" title="${esc(tip)}" tabindex="0">${label}</span>
        <div class="bar-track">
          ${min != null ? `<div class="bar-band" style="left:${pct(min)}%;width:${pct(max) - pct(min)}%"></div>` : ""}
          ${has ? `<div class="bar-fill ${status}" style="width:${pct(v)}%"></div>` : ""}
          ${ghost != null ? `<div class="bar-ghost" style="left:calc(${pct(ghost)}% - 1px)"></div>` : ""}
        </div>
        <span class="bar-value">${has ? fmt(v, 0) : "–"}${min != null ? `<span class="bar-range">${min}–${max}</span>` : ""}</span>
      </div>`;
    };
    $("#quality-bars").innerHTML = C.QUALITIES.map(d =>
      bar(d.label, d.tip, res.q[d.key], d.scale, d.min, d.max, one ? one[d.key] : null)).join("");
    $("#fa-bars").innerHTML = window.FA_NAMES.map((n, i) =>
      bar(n, `${n} acid, % of total fatty acids`, res.fa[i], 100, null, null, previewOil ? previewOil.fa[i] : null)).join("");
    const sat = res.fa.slice(0, 4).reduce((a, b) => a + b, 0);
    const unsat = res.fa.slice(4).reduce((a, b) => a + b, 0);
    $("#sat-ratio").textContent = has ? `Saturated : unsaturated = ${fmt(sat, 0)} : ${fmt(unsat, 0)}. Minor fatty acids are not tracked, so totals may be under 100.` : "";
  }

  // ---------- saving, library, sharing ----------
  function snapshot() { return JSON.parse(JSON.stringify(state)); }
  function usedCustomOils(s) { return customOils.filter(o => s.oils.some(r => r.id === o.id)); }

  function loadState(s, extraOils) {
    if (extraOils && extraOils.length) {
      for (const o of extraOils) if (!lookup(o.id)) customOils.push(o);
      store.set(KEYS.custom, customOils);
      renderCatFilters();
    }
    state = Object.assign(DEFAULT_STATE(), s);
    state.oils = (state.oils || []).map(r => ({ id: r.id, pct: C.num(r.pct), wt: C.num(r.wt) }));
    state.fragrances = (state.fragrances || []).map(c => ({
      name: String(c.name || ""), type: c.type === "FO" ? "FO" : "EO", parts: C.num(c.parts),
      max: c.max === "" || c.max == null ? null : C.num(c.max)
    }));
    writeForm(); renderRecipe(); renderBlend(); renderOilList(); changed();
  }

  // Comparable form of a recipe state (ignores derived weights in percent mode, number-vs-string differences).
  function fingerprint(st) {
    if (!st) return "";
    const n = Object.assign(DEFAULT_STATE(), st);
    const out = {};
    for (const k of Object.keys(DEFAULT_STATE())) out[k] = n[k];
    out.oils = (n.oils || []).map(r => [r.id, +C.num(r.pct).toFixed(2), n.inputMode === "wt" ? +C.num(r.wt).toFixed(3) : 0]);
    out.fragrances = (n.fragrances || []).map(c => [String(c.name || ""), c.type === "FO" ? "FO" : "EO", C.num(c.parts), c.max === "" || c.max == null ? null : C.num(c.max)]);
    for (const k of ["totalOil", "naohShare", "naohPurity", "kohPurity", "superfat", "waterPct", "lyeConc", "waterRatio", "fragrancePct"]) out[k] = C.num(out[k]);
    out.name = String(out.name || "").trim();
    return JSON.stringify(out);
  }

  // Save the current recipe without prompting; never overwrite a different recipe with the same name.
  function saveCurrentQuietly() {
    const recipes = store.get(KEYS.recipes, []);
    let name = state.name.trim() || "Untitled recipe";
    const same = recipes.find(r => r.name === name);
    if (same && fingerprint(same.state) !== fingerprint(state)) name += ` (saved ${new Date().toLocaleString()})`;
    if (same && fingerprint(same.state) === fingerprint(state)) return name;
    recipes.unshift({ id: String(Date.now()), name, savedAt: new Date().toISOString(), state: snapshot(), customOils: usedCustomOils(state) });
    return store.set(KEYS.recipes, recipes) ? name : null;
  }

  function saveRecipe() {
    const name = state.name.trim() || prompt("Name this recipe:", "Untitled recipe");
    if (!name) return;
    state.name = name; $("#recipe-name").value = name;
    const recipes = store.get(KEYS.recipes, []);
    const existing = recipes.find(r => r.name === name);
    const entry = { id: existing ? existing.id : String(Date.now()), name, savedAt: new Date().toISOString(), state: snapshot(), customOils: usedCustomOils(state) };
    if (existing) Object.assign(existing, entry); else recipes.unshift(entry);
    toast(store.set(KEYS.recipes, recipes) ? (existing ? "Recipe updated" : "Recipe saved") : "Couldn't save: browser storage is unavailable. Use Export JSON instead.");
  }

  function openLibrary() {
    const recipes = store.get(KEYS.recipes, []);
    const list = $("#library-list");
    list.innerHTML = recipes.length ? recipes.map(r => `
      <li data-id="${esc(r.id)}">
        <div><div>${esc(r.name)}</div><div class="meta">${new Date(r.savedAt).toLocaleString()} · ${r.state.oils.length} oils</div></div>
        <div class="actions">
          <button type="button" class="btn small" data-act="load">Open</button>
          <button type="button" class="btn ghost small" data-act="dup">Duplicate</button>
          <button type="button" class="btn ghost small" data-act="del">Delete</button>
        </div>
      </li>`).join("") : `<li class="muted">No saved recipes yet.</li>`;
    list.querySelectorAll("button[data-act]").forEach(b => b.addEventListener("click", () => {
      const id = b.closest("li").dataset.id;
      const all = store.get(KEYS.recipes, []);
      const rec = all.find(r => r.id === id);
      if (!rec) return;
      if (b.dataset.act === "load") { loadState(rec.state, rec.customOils); $("#library-dialog").close(); toast(`Opened “${rec.name}”`); }
      if (b.dataset.act === "dup") {
        all.unshift(Object.assign({}, rec, { id: String(Date.now()), name: rec.name + " (copy)", savedAt: new Date().toISOString() }));
        store.set(KEYS.recipes, all); openLibrary();
      }
      if (b.dataset.act === "del" && confirm(`Delete “${rec.name}”?`)) {
        store.set(KEYS.recipes, all.filter(r => r.id !== id)); openLibrary();
      }
    }));
    if (!$("#library-dialog").open) $("#library-dialog").showModal();
  }

  function encodePayload(obj) {
    const json = JSON.stringify(obj);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodePayload(str) {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  }

  function buildShareUrl() {
    const snap = snapshot();
    if (!$("#share-notes").checked) snap.notes = "";
    return location.origin + location.pathname + "#r=" + encodePayload({ v: 1, s: snap, c: usedCustomOils(state) });
  }

  function openShare() {
    $("#share-notes").checked = store.get(KEYS.shareNotes, false) === true;
    $("#share-notes-row").hidden = !state.notes.trim();
    $("#share-url").value = buildShareUrl();
    $("#share-local").hidden = location.protocol !== "file:";
    $("#share-dialog").showModal();
    $("#share-url").select();
  }

  function copyShare() {
    const url = $("#share-url").value;
    const fallback = () => { $("#share-url").select(); document.execCommand && document.execCommand("copy"); toast("Link copied"); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(() => toast("Link copied"), fallback);
    else fallback();
  }

  // Incoming shared link: ask before replacing unsaved work.
  function hasUnsavedWork(current, starter, shared) {
    if (!current || !(current.oils || []).length) return false;
    const fp = fingerprint(current);
    if (fp === fingerprint(starter) || fp === fingerprint(shared.s)) return false;
    return !store.get(KEYS.recipes, []).some(r => fingerprint(r.state) === fp);
  }

  function offerShared(shared) {
    const sName = String(shared.s.name || "").trim() || "Untitled recipe";
    const cName = state.name.trim() || "an untitled recipe";
    $("#incoming-text").innerHTML =
      `This link contains <strong>${esc(sName)}</strong> (${(shared.s.oils || []).length} oils). ` +
      `Opening it will replace the recipe you're working on now, <strong>${esc(cName)}</strong>, which isn't in My recipes yet.`;
    const dlg = $("#incoming-dialog");
    dlg.returnValue = "";
    dlg.onclose = () => {
      const v = dlg.returnValue;
      if (v === "save-open") {
        const saved = saveCurrentQuietly();
        loadState(shared.s, shared.c);
        toast(saved ? `Saved “${saved}” to My recipes, then opened the shared recipe` : "Couldn't save your recipe (browser storage unavailable); shared recipe not opened.");
        if (!saved) loadState(store.get(KEYS.current, null) || shared.s);
      } else if (v === "open") {
        loadState(shared.s, shared.c); toast("Opened the shared recipe");
      } else {
        if (location.hash.startsWith("#r=")) history.replaceState(null, "", location.pathname + location.search);
        toast("Kept your current recipe. The shared one was not opened.");
      }
    };
    dlg.showModal();
  }

  function exportJSON() {
    const payload = { app: "soap-calculator", v: 1, exportedAt: new Date().toISOString(), recipe: snapshot(), customOils: usedCustomOils(state) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (state.name.trim() || "soap-recipe").replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").toLowerCase() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.app === "soapmaker-backup") { restoreBackup(data); return; }
        const recipe = data.recipe || data.s || data;
        if (!Array.isArray(recipe.oils)) throw new Error("no oils");
        loadState(recipe, data.customOils || data.c);
        toast("Recipe imported");
      } catch (e) { toast("That file isn't a recipe from this calculator."); }
    };
    reader.readAsText(file);
  }

  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function backupAll() {
    const payload = {
      app: "soapmaker-backup", v: 1, exportedAt: new Date().toISOString(),
      recipes: store.get(KEYS.recipes, []),
      customOils: customOils,
      blends: store.get(KEYS.blends, [])
    };
    if (!payload.recipes.length && !payload.customOils.length && !payload.blends.length) { toast("Nothing saved yet to back up"); return; }
    downloadJSON(payload, `soapmaker-backup-${new Date().toISOString().slice(0, 10)}.json`);
    toast(`Backed up ${payload.recipes.length} recipe${payload.recipes.length === 1 ? "" : "s"}`);
  }

  function restoreBackup(data) {
    const recipes = store.get(KEYS.recipes, []);
    let nr = 0, no = 0, nb = 0;
    for (const r of data.recipes || []) {
      if (!r || !r.state || !Array.isArray(r.state.oils)) continue;
      const i = recipes.findIndex(x => x.id === r.id);
      if (i >= 0) recipes[i] = r; else recipes.push(r);
      nr++;
    }
    recipes.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    for (const o of data.customOils || []) {
      if (!o || !o.id || !o.sap) continue;
      const i = customOils.findIndex(x => x.id === o.id);
      if (i >= 0) customOils[i] = o; else customOils.push(o);
      no++;
    }
    const blends = store.get(KEYS.blends, []);
    for (const b of data.blends || []) {
      if (!b || !b.name || !Array.isArray(b.items)) continue;
      const i = blends.findIndex(x => x.name === b.name);
      if (i >= 0) blends[i] = b; else blends.push(b);
      nb++;
    }
    blends.sort((a, b) => a.name.localeCompare(b.name));
    const ok = store.set(KEYS.recipes, recipes) & store.set(KEYS.custom, customOils) & store.set(KEYS.blends, blends);
    renderCatFilters(); renderOilList(); refreshBlendList();
    if ($("#library-dialog").open) openLibrary();
    toast(ok ? `Restored ${nr} recipe${nr === 1 ? "" : "s"}, ${nb} blend${nb === 1 ? "" : "s"}, ${no} custom oil${no === 1 ? "" : "s"}` : "Couldn't restore: browser storage is unavailable.");
  }

  function readJSONFile(file, cb) {
    const reader = new FileReader();
    reader.onload = () => { let data; try { data = JSON.parse(reader.result); } catch (e) { toast("That file isn't valid JSON."); return; } cb(data); };
    reader.readAsText(file);
  }

  // ---------- custom oils ----------
  function setupCustomOil() {
    $("#custom-fa").innerHTML = window.FA_NAMES.map((n, i) =>
      `<label class="field"><span>${n}</span><input type="number" name="fa${i}" step="any" min="0" max="100"></label>`).join("");
    $("#btn-custom-oil").addEventListener("click", () => { $("#custom-form").reset(); $("#custom-dialog").showModal(); });
    $("#custom-dialog").addEventListener("close", () => {
      if ($("#custom-dialog").returnValue !== "save") return;
      const f = new FormData($("#custom-form"));
      const raw = C.num(f.get("sap"));
      const type = f.get("sapType");
      const sapKohMg = type === "naoh" ? raw * C.KOH_MW / C.NAOH_MW * 1000 : type === "koh" ? raw * 1000 : raw;
      const fa = window.FA_NAMES.map((_, i) => C.num(f.get("fa" + i)));
      const iod = C.num(f.get("iod"));
      const insRaw = f.get("ins");
      const oil = {
        id: "custom-" + Date.now(),
        name: String(f.get("name")).trim() + " (custom)",
        cat: "custom",
        sap: +sapKohMg.toFixed(2),
        iod,
        ins: insRaw === "" ? Math.round(sapKohMg - iod) : C.num(insRaw),
        fa
      };
      if (!oil.sap || !oil.name) return;
      customOils.push(oil);
      store.set(KEYS.custom, customOils);
      renderCatFilters(); renderOilList();
      toast("Custom oil saved");
    });
  }

  // ---------- print ----------
  function buildPrintSheet() {
    const res = lastResult || C.calculate(state, lookup);
    const u = state.units;
    const rows = res.rows.map(r => `<tr><td class="check"><span class="box"></span></td><td>${esc(r.oil.name)}</td><td class="num">${fmt(r.pct, 1)}%</td><td class="num">${w(r.wt)} ${u}</td><td class="num">${alt(r.wt)}</td></tr>`).join("");
    const line = (label, v) => `<tr><td class="check"><span class="box"></span></td><td>${label}</td><td class="num">${w(v)} ${u}</td><td class="num">${alt(v)}</td></tr>`;
    const lyeLines = (res.share > 0 ? line(`NaOH (${state.naohPurity}% pure)`, res.naoh) : "") + (res.share < 1 ? line(`KOH (${state.kohPurity}% pure)`, res.koh) : "");
    const q = C.QUALITIES.map(d => `<tr><td>${d.label}</td><td class="num">${fmt(res.q[d.key], 0)}</td><td class="num">${d.min}–${d.max}</td></tr>`).join("");
    $("#print-sheet").innerHTML = `
      <h1>${esc(state.name || "Soap recipe")}</h1>
      <div>Printed ${new Date().toLocaleDateString()} · Superfat ${state.superfat}% · Lye ${state.naohShare}% NaOH / ${100 - state.naohShare}% KOH · Lye concentration ${fmt(res.conc, 1)}%</div>
      <h3>Lye solution</h3>
      <table>${lyeLines}${line("Water (distilled)", res.water)}</table>
      <h3>Oils (${w(res.oilTotal)} ${u})</h3>
      <table><tr><th></th><th>Oil</th><th class="num">%</th><th class="num">Weight</th><th class="num"></th></tr>${rows}</table>
      ${res.fragrance > 0 ? `<h3>At trace: fragrance (${state.fragrancePct}% of oils)</h3><table>${
        res.blend.length && res.totalParts > 0
          ? res.blend.filter(b => b.parts > 0).map(b => line(`${esc(b.name || "Unnamed")} (${b.type}, ${fmt(b.share * 100, 1)}% of blend)`, b.wt)).join("") +
            `<tr><td></td><td><em>Blend total</em></td><td class="num">${w(res.fragrance)} ${u}</td><td class="num">${alt(res.fragrance)}</td></tr>`
          : line("Fragrance / essential oil", res.fragrance)
      }</table>` : ""}
      <div class="cols">
        <div><h3>Qualities</h3><table>${q}</table></div>
        <div><h3>Batch</h3><table>
          <tr><td>Total batch</td><td class="num">${w(res.batch)} ${u}</td></tr>
          <tr><td>Date made</td><td></td></tr><tr><td>Unmold date</td><td></td></tr><tr><td>Ready (cure ~4–6 weeks)</td><td></td></tr>
        </table></div>
      </div>
      <h3>Notes</h3><div class="notes-box">${esc(state.notes || "")}</div>`;
  }

  // ---------- init ----------
  function init() {
    bindForm(); bindPicker(); bindBlend(); setupCustomOil(); refreshBlendList();
    $("#btn-save").addEventListener("click", saveRecipe);
    $("#btn-library").addEventListener("click", openLibrary);
    $("#btn-backup").addEventListener("click", backupAll);
    $("#restore-file").addEventListener("change", e => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      readJSONFile(f, data => {
        if (data.app === "soapmaker-backup" || Array.isArray(data.recipes)) restoreBackup(data);
        else if (data.recipe || Array.isArray(data.oils)) { loadState(data.recipe || data, data.customOils); $("#library-dialog").close(); toast("That was a single recipe; it's open now. Save it to add it to your list."); }
        else toast("That file isn't a Soapmaker backup.");
      });
    });
    $("#btn-share").addEventListener("click", openShare);
    $("#share-copy").addEventListener("click", copyShare);
    $("#share-notes").addEventListener("change", e => { store.set(KEYS.shareNotes, e.target.checked); $("#share-url").value = buildShareUrl(); });
    $("#btn-export").addEventListener("click", exportJSON);
    $("#import-file").addEventListener("change", e => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ""; });
    $("#btn-print").addEventListener("click", () => { buildPrintSheet(); window.print(); });
    window.addEventListener("beforeprint", buildPrintSheet);
    $("#btn-new").addEventListener("click", () => {
      if (state.oils.length && !confirm("Start a new recipe? Unsaved changes to this one will be lost.")) return;
      loadState(DEFAULT_STATE());
    });

    renderCatFilters();
    const current = store.get(KEYS.current, null);
    // A starter recipe so the page isn't empty on first visit.
    const starter = Object.assign(DEFAULT_STATE(), {
      name: "Starter bar",
      oils: [
        { id: "olive", pct: 40 }, { id: "coconut-76", pct: 25 }, { id: "shea", pct: 15 },
        { id: "palm", pct: 15 }, { id: "castor", pct: 5 }
      ]
    });
    STARTER = starter;
    const shared = readSharedHash();
    if (shared && !hasUnsavedWork(current, starter, shared)) {
      loadState(shared.s, shared.c);
      toast("Recipe loaded from link");
    } else {
      loadState(current || starter);
      if (shared) offerShared(shared);
    }
    // A shared link pasted into a tab where Soapmaker is already open only changes the hash.
    window.addEventListener("hashchange", () => {
      const sh = readSharedHash();
      if (!sh) return;
      if (hasUnsavedWork(snapshot(), STARTER, sh)) offerShared(sh);
      else { loadState(sh.s, sh.c); toast("Recipe loaded from link"); }
    });
  }

  let STARTER = null;
  function readSharedHash() {
    if (!location.hash.startsWith("#r=")) return null;
    try {
      const sh = decodePayload(location.hash.slice(3));
      if (!sh || !sh.s || !Array.isArray(sh.s.oils)) throw 0;
      return sh;
    } catch (e) { toast("That share link couldn't be read."); return null; }
  }

  document.addEventListener("DOMContentLoaded", init);
})();

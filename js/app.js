// ===== Fútbol · Estadísticas de torneos =====
// Lee data/torneos.json (generado desde el Excel con apps-script/Exportar-Torneos-JSON.gs)
// y arma una pestaña con su dashboard por cada jugador del JSON (Lolo, Fede).
// El login (Supabase) está en js/auth-gate.js: acá se espera a window.AUTH_READY.
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Constantes del dominio
  // ---------------------------------------------------------------------------
  // PUESTO = hasta dónde llegó en el torneo (viene del dropdown del Excel):
  //   🥇Campeón · 🥈Subcampeón · Semifinal · 4️⃣tos (cuartos) · 8️⃣vos (octavos) · Zona
  const RANK = { zona: 0, octavos: 1, cuartos: 2, semifinal: 3, subcampeon: 4, campeon: 5 };
  const INST_LABEL = {
    zona: "Zona", octavos: "Octavos", cuartos: "Cuartos",
    semifinal: "Semifinal", subcampeon: "Subcampeón", campeon: "Campeón"
  };
  // Instancias marcadas con ✅ en el Excel → nivel alcanzado
  const FLAG_RANK = { zona: 0, octavos: 1, cuartos: 2, semifinal: 3, final: 4 };
  const FLAGS = ["zona", "octavos", "cuartos", "semifinal", "final"];

  const GOLD = "#fbbf24", SILVER = "#cbd5e1", BRONZE = "#d97706", SIN_PODIO = "#475569";
  const WIN_DARK = "#15803d";

  const FALLBACK_PALETTE = {
    grid: "#2a313c", tick: "#8b949e", text: "#e6edf3", gold: "#fbbf24", goldFill: "rgba(251,191,36,0.08)",
    silver: "#cbd5e1", silverText: "#cbd5e1", other: "#3a4352",
    partners: ["#60a5fa", "#f472b6", "#2dd4bf", "#a78bfa", "#fb923c", "#facc15", "#f87171", "#94a3b8"]
  };
  const paletteOf = name => (window.THEME
    ? (name ? window.THEME.palette(name) : window.THEME.colors())
    : FALLBACK_PALETTE);

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const trunc = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

  // ---------------------------------------------------------------------------
  // Normalización de filas (tolera ediciones a mano del JSON)
  // ---------------------------------------------------------------------------
  function slug(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  const PUESTO_ALIAS = {
    campeon: "campeon", subcampeon: "subcampeon", semifinal: "semifinal", semis: "semifinal",
    cuartos: "cuartos", "4tos": "cuartos", octavos: "octavos", "8vos": "octavos", zona: "zona"
  };
  function normPuesto(v) {
    const k = slug(v);
    return k ? (PUESTO_ALIAS[k] || null) : null;
  }
  // "futbol 5" / "Fútbol 5" / "f-5" → "F5" · "salon" / "Futsal" → "Futsal" · otro texto → tal cual
  function normCategoria(v) {
    const raw = String(v == null ? "" : v).trim();
    if (!raw) return "";
    const k = slug(raw);
    const m = /^(?:f|fut|futbol)(\d{1,2})$/.exec(k);
    if (m) return "F" + m[1];
    if (/^(futsal|futbolsalon|futbolsala|salon)$/.test(k)) return "Futsal";
    return raw;
  }
  function normRow(r, i) {
    const t = {
      id: Number(r.id) || i + 1,
      anio: r.anio === null || r.anio === undefined || r.anio === "" ? null : Number(r.anio),
      equipo: r.equipo || "",
      torneo: r.torneo || "",
      categoria: normCategoria(r.categoria),
      puesto: normPuesto(r.puesto)
    };
    FLAGS.forEach(f => { t[f] = r[f] === true; });
    return t;
  }

  // Nivel máximo alcanzado: el mayor entre el PUESTO y las instancias con ✅
  function nivel(t) {
    let n = t.puesto ? RANK[t.puesto] : -1;
    FLAGS.forEach(f => { if (t[f] && FLAG_RANK[f] > n) n = FLAG_RANK[f]; });
    return n;
  }
  // Instancia en la que terminó el torneo (para distribución / "más frecuente")
  const instancia = (t) => t.puesto;

  const byOrder = (a, b) => (a.anio || 0) - (b.anio || 0) || a.id - b.id;

  function fechaCorta(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
  }

  // ---------------------------------------------------------------------------
  // Dashboard (uno por jugador)
  // ---------------------------------------------------------------------------
  function createDashboard(player, meta) {
    const k = player.clave;
    const ALL = (player.torneos || []).map(normRow);
    const id = (s) => `${k}-${s}`;
    const el = (s) => $(id(s));

    const filters = { anio: [], equipo: [], torneo: [], categoria: [], puesto: [], lastN: null };
    const combos = {};
    const charts = {};
    let initialized = false;
    let titulosYear = null; // null = Todo (colapsado)

    // ------------------------------ HTML ------------------------------
    const comboHTML = (name, label, placeholder, search) => `
      <div class="field"><label>${label}</label>
        <div class="combo" id="${id("combo-" + name)}"${search ? ' data-search="1"' : ""}>
          <input type="text" class="combo-input" readonly placeholder="${placeholder}" aria-label="${label}">
          <div class="combo-panel">
            ${search ? '<input type="text" class="combo-search" placeholder="Buscar…" aria-label="Buscar">' : ""}
            <ul class="combo-list"></ul>
          </div>
        </div>
      </div>`;

    const kpi = (cls, label, name) => `
      <div class="kpi ${cls}"><div class="label">${label}</div><div class="value" id="${id("kpi-" + name)}">–</div></div>`;

    const WA_SVG = `<svg viewBox="0 0 32 32" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.2 1.6 6L4 27l6.2-1.6c1.7 1 3.7 1.5 5.8 1.5 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-1.9 0-3.7-.5-5.3-1.5l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.6-3.5-1.6-5.5C5.8 9.4 10.4 4.8 16 4.8S26.2 9.4 26.2 15 21.6 24.8 16 24.8zm5.6-7.3c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4z"/></svg>`;

    function template() {
      return `
      <header class="hero">
        <div class="title-block">
          <div class="eyebrow">Circuito de torneos</div>
          <h1>Torneos<br>de Fútbol</h1>
          <p class="sub">${esc(player.nombre)}</p>
          <p class="updated" id="${id("last-update")}"></p>
        </div>
        <div class="record-badge">
          <div class="total" id="${id("record-total")}"></div>
          <div class="total-lbl">Torneos jugados</div>
          <div class="big" id="${id("record")}"></div>
          <div class="lbl">Campeón / Subcamp. / Sin podio</div>
        </div>
      </header>

      <section class="filters" aria-label="Filtros">
        ${comboHTML("anio", "Año", "Todos")}
        ${comboHTML("equipo", "Equipo", "Todos", true)}
        ${comboHTML("torneo", "Torneo", "Todos", true)}
        ${comboHTML("categoria", "Categoría", "Todos")}
        ${comboHTML("puesto", "Puesto", "Todos")}
        <div class="field"><label>Últimos N</label>
          <input type="number" id="${id("last-n")}" class="last-n-input" min="1" max="100" step="1" placeholder="Todos"
            aria-label="Últimos N torneos" inputmode="numeric">
        </div>
        <button class="reset" id="${id("reset")}">Limpiar filtros</button>
      </section>

      <section class="kpis kpis-main">
        ${kpi("", "Torneos jugados", "tj")}
        ${kpi("gold", "🥇 Campeón", "camp")}
        ${kpi("silver", "🥈 Subcampeón", "sub")}
        ${kpi("", "Podios totales", "podios")}
        ${kpi("win", "% Podios", "eff")}
      </section>
      <section class="kpis kpis-streak">
        ${kpi("", "Semifinales alcanzadas", "semis")}
        ${kpi("", "Finales jugadas", "finales")}
        ${kpi("win", "% Finales ganadas", "finwin")}
        ${kpi("loss", "Eliminado en zona", "zona")}
        ${kpi("", "Instancia más frecuente", "inst")}
      </section>

      <p class="empty" id="${id("empty")}" hidden>Todavía no hay torneos cargados para mostrar estadísticas.</p>

      <section class="grid" id="${id("grid")}">
        <div class="card full">
          <h3>Títulos y subcampeonatos en el tiempo
            <button type="button" class="card-share" id="${id("titulos-share")}"
              title="Compartir este gráfico por WhatsApp" aria-label="Compartir este gráfico por WhatsApp">${WA_SVG}</button>
          </h3>
          <div class="range-chips" id="${id("titulos-range")}" role="group" aria-label="Expandir por año"></div>
          <div class="legend-partners" id="${id("titulos-legend")}"></div>
          <div class="chart-box timeline"><canvas id="${id("chart-titulos")}"></canvas></div>
        </div>
        <div class="card">
          <h3>Año · torneos y % podios</h3>
          <div class="chart-box"><canvas id="${id("chart-anio")}"></canvas></div>
        </div>
        <div class="card">
          <h3>Equipo · torneos y % podios</h3>
          <div class="chart-box"><canvas id="${id("chart-equipo")}"></canvas></div>
        </div>
        <div class="card">
          <h3>Torneo · top 8 más jugados</h3>
          <div class="chart-box"><canvas id="${id("chart-torneo")}"></canvas></div>
        </div>
        <div class="card full" id="${id("card-categoria")}">
          <h3>Categoría · torneos y % podios</h3>
          <div class="chart-box"><canvas id="${id("chart-categoria")}"></canvas></div>
        </div>
        <div class="card">
          <h3>Instancia en la que terminó · distribución</h3>
          <div class="chart-box"><canvas id="${id("chart-instancia")}"></canvas></div>
        </div>
        <div class="card full">
          <h3>Top 5 equipos · más torneos jugados</h3>
          <div class="chart-box tall"><canvas id="${id("chart-comp")}"></canvas></div>
        </div>
      </section>

      <section class="card full table-card">
        <h3>Detalle de torneos <span class="count" id="${id("tabla-count")}"></span></h3>
        <div class="table-scroll">
          <table class="tabla">
            <thead>
              <tr>
                <th>#</th><th>Año</th><th>Equipo</th><th>Torneo</th><th>Cat.</th>
                <th class="c-chk">Zona</th><th class="c-chk">Octavos</th><th class="c-chk">Cuartos</th>
                <th class="c-chk">Semi</th><th class="c-chk">Final</th><th>Puesto</th>
              </tr>
            </thead>
            <tbody id="${id("tabla-body")}"></tbody>
          </table>
        </div>
      </section>`;
    }

    // ------------------------------ Init ------------------------------
    function init() {
      if (initialized) return;
      initialized = true;
      buildFilterOptions();
      bindFilters();
      renderLastUpdate();
      render();
    }

    function renderLastUpdate() {
      const f = fechaCorta(meta.actualizado);
      el("last-update").textContent = f ? `Última actualización: ${f}` : "";
    }

    function uniqueSorted(key) {
      return [...new Set(ALL.map(m => m[key]).filter(v => v !== null && v !== undefined && v !== ""))]
        .sort((a, b) => String(a).localeCompare(String(b), "es", { numeric: true }));
    }

    function buildFilterOptions() {
      setupCombo("combo-anio", uniqueSorted("anio").map(v => [String(v), String(v)]), "anio", "Todos");
      setupCombo("combo-equipo", uniqueSorted("equipo").map(v => [v, v]), "equipo", "Todos");
      setupCombo("combo-torneo", uniqueSorted("torneo").map(v => [v, v]), "torneo", "Todos");
      setupCombo("combo-categoria", uniqueSorted("categoria").map(v => [v, v]), "categoria", "Todos");
      const puestos = [];
      ["campeon", "subcampeon", "semifinal", "cuartos", "octavos", "zona"].forEach(p => {
        if (ALL.some(t => t.puesto === p)) {
          puestos.push([p, p === "campeon" ? "🥇 Campeón" : p === "subcampeon" ? "🥈 Subcampeón" : INST_LABEL[p]]);
        }
      });
      if (ALL.some(t => !t.puesto)) puestos.push(["en_curso", "En curso (sin puesto)"]);
      setupCombo("combo-puesto", puestos, "puesto", "Todos");
    }

    // ------------------------------ Combos ------------------------------
    function setupCombo(comboId, items, filterKey, placeholder) {
      const root = el(comboId);
      if (!root) return;
      const input = root.querySelector(".combo-input");
      const search = root.querySelector(".combo-search");
      const list = root.querySelector(".combo-list");
      const hasSearch = root.dataset.search === "1";
      combos[comboId] = { root, input, search, list, filterKey, placeholder, items, hasSearch };
      input.addEventListener("click", () => toggleCombo(comboId));
      if (search) search.addEventListener("input", () => renderComboList(comboId, search.value));
      renderComboList(comboId, "");
      updateComboInput(comboId);
    }

    function renderComboList(comboId, q) {
      const c = combos[comboId];
      const query = (q || "").trim().toLowerCase();
      const sel = filters[c.filterKey];
      const filtered = c.items.filter(([, label]) => label.toLowerCase().includes(query));

      let html = `<li class="combo-opt combo-all" data-val="__all">
        <span class="chk${sel.length === 0 ? " on" : ""}"></span>Todos</li>`;
      html += filtered.map(([val, label]) => {
        const on = sel.includes(val);
        return `<li class="combo-opt" data-val="${esc(val)}"><span class="chk${on ? " on" : ""}"></span>${esc(label)}</li>`;
      }).join("");
      if (!filtered.length) html += '<li class="combo-empty">Sin resultados</li>';
      c.list.innerHTML = html;

      c.list.querySelectorAll(".combo-opt").forEach(li => {
        li.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const val = li.getAttribute("data-val");
          if (val === "__all") {
            filters[c.filterKey] = [];
          } else {
            const arr = filters[c.filterKey];
            const i = arr.indexOf(val);
            if (i === -1) arr.push(val); else arr.splice(i, 1);
          }
          renderComboList(comboId, c.hasSearch && c.search ? c.search.value : "");
          updateComboInput(comboId);
          render();
        });
      });
    }

    function updateComboInput(comboId) {
      const c = combos[comboId];
      const sel = filters[c.filterKey];
      if (sel.length === 0) {
        c.input.value = "";
        c.input.placeholder = c.placeholder;
      } else {
        const labels = sel.map(v => {
          const found = c.items.find(([val]) => val === v);
          return found ? found[1] : v;
        });
        c.input.value = labels.length <= 2 ? labels.join(", ") : `${labels.length} seleccionados`;
      }
    }

    function toggleCombo(comboId) {
      const c = combos[comboId];
      const open = c.root.classList.contains("open");
      closeAllCombos();
      if (!open) {
        c.root.classList.add("open");
        if (c.hasSearch && c.search) {
          c.search.value = "";
          renderComboList(comboId, "");
          setTimeout(() => c.search.focus(), 0);
        }
      }
    }
    function closeAllCombos() { Object.values(combos).forEach(c => c.root.classList.remove("open")); }
    // Click fuera de cualquier combo de este dashboard → cerrar
    document.addEventListener("click", e => {
      Object.values(combos).forEach(c => { if (!c.root.contains(e.target)) c.root.classList.remove("open"); });
    });

    function bindFilters() {
      const lastNInput = el("last-n");
      lastNInput.addEventListener("input", () => {
        let v = parseInt(lastNInput.value, 10);
        if (isNaN(v) || v <= 0) {
          filters.lastN = null;
        } else {
          if (v > 100) { v = 100; lastNInput.value = "100"; }
          filters.lastN = v;
        }
        render();
      });
      el("reset").addEventListener("click", () => {
        Object.keys(filters).forEach(key => { filters[key] = key === "lastN" ? null : []; });
        Object.keys(combos).forEach(cid => {
          if (combos[cid].search) combos[cid].search.value = "";
          updateComboInput(cid);
          renderComboList(cid, "");
        });
        lastNInput.value = "";
        closeAllCombos();
        render();
      });
      const rangeBox = el("titulos-range");
      rangeBox.addEventListener("click", e => {
        const b = e.target.closest("button[data-year]");
        if (!b) return;
        const y = b.dataset.year || null;
        titulosYear = (y === titulosYear) ? null : y; // clic en el año abierto → colapsa a Todo
        titulosTimeline(completed(applyFilters()));
      });
      el("titulos-share").addEventListener("click", shareTitulosChart);
    }

    // ------------------------------ Filtros / stats ------------------------------
    function matchPuesto(t, selected) {
      if (!selected.length) return true;
      return selected.includes(t.puesto || "en_curso");
    }

    function applyFilters() {
      const f = filters;
      let list = ALL.filter(t =>
        (!f.equipo.length || f.equipo.includes(t.equipo)) &&
        (!f.torneo.length || f.torneo.includes(t.torneo)) &&
        (!f.categoria.length || f.categoria.includes(t.categoria)) &&
        (!f.anio.length || f.anio.includes(String(t.anio))) &&
        matchPuesto(t, f.puesto)
      );
      if (f.lastN && f.lastN > 0) {
        list = [...list].sort((a, b) => byOrder(b, a)).slice(0, f.lastN);
      }
      return list;
    }

    // Igual que el Excel (COUNTA de PUESTO): un torneo cuenta como jugado cuando tiene puesto.
    const completed = (list) => list.filter(t => t.puesto);

    function stats(list) {
      const tj = list.length;
      const campeon = list.filter(t => t.puesto === "campeon").length;
      const subcampeon = list.filter(t => t.puesto === "subcampeon").length;
      const podios = campeon + subcampeon;
      const eff = tj ? podios / tj : 0;
      const finales = list.filter(t => nivel(t) >= 4).length;
      const semis = list.filter(t => nivel(t) >= 3).length;
      const zona = list.filter(t => t.puesto === "zona").length;
      return { tj, campeon, subcampeon, podios, eff, finales, semis, zona };
    }

    function render() {
      const data = applyFilters();
      const done = completed(data);
      renderKPIs(done);
      renderRecord(done);
      renderCharts(done);
      renderTable(data);
    }

    function renderRecord(done) {
      const s = stats(done);
      el("record").innerHTML =
        `<span class="w">${s.campeon}</span><span class="sep">/</span>` +
        `<span class="m">${s.subcampeon}</span><span class="sep">/</span>` +
        `<span class="l">${s.tj - s.podios}</span>`;
      el("record-total").textContent = s.tj;
    }

    function renderKPIs(done) {
      const s = stats(done);
      el("kpi-tj").textContent = s.tj;
      el("kpi-camp").textContent = s.campeon;
      el("kpi-sub").textContent = s.subcampeon;
      el("kpi-podios").textContent = s.podios;
      el("kpi-eff").innerHTML = (s.eff * 100).toFixed(1) + "<small>%</small>";
      el("kpi-semis").textContent = s.semis;
      el("kpi-finales").textContent = s.finales;
      el("kpi-finwin").innerHTML = s.finales ? ((s.campeon / s.finales) * 100).toFixed(0) + "<small>%</small>" : "–";
      el("kpi-zona").textContent = s.zona;

      const counts = {};
      done.forEach(t => { const i = instancia(t); if (i) counts[i] = (counts[i] || 0) + 1; });
      let maxInst = null, maxCount = 0;
      Object.entries(counts).forEach(([key, v]) => {
        if (v > maxCount || (v === maxCount && maxInst && RANK[key] > RANK[maxInst])) { maxCount = v; maxInst = key; }
      });
      el("kpi-inst").innerHTML = maxInst ? `${INST_LABEL[maxInst]}<small> (${maxCount})</small>` : "–";
    }

    function puestoBadge(t) {
      switch (t.puesto) {
        case "campeon": return '<span class="badge b-gold">🥇 Campeón</span>';
        case "subcampeon": return '<span class="badge b-silver">🥈 Subcamp.</span>';
        case "semifinal": return '<span class="badge b-bronze">Semifinal</span>';
        case "cuartos": return '<span class="badge b-gray">Cuartos</span>';
        case "octavos": return '<span class="badge b-gray">Octavos</span>';
        case "zona": return '<span class="badge b-gray">Zona</span>';
        default: return '<span class="badge b-gray">En curso</span>';
      }
    }

    function renderTable(data) {
      const tbody = el("tabla-body");
      const rows = [...data].sort((a, b) => a.id - b.id);
      el("tabla-count").textContent = `${rows.length} torneo${rows.length === 1 ? "" : "s"}`;
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="11" class="empty">${ALL.length ? "No hay torneos con estos filtros." : "Todavía no hay torneos cargados."}</td></tr>`;
        return;
      }
      tbody.innerHTML = rows.map(t => `<tr>
        <td class="c-num">${t.id}</td>
        <td>${t.anio || "—"}</td>
        <td>${esc(t.equipo) || "—"}</td>
        <td>${esc(t.torneo) || "—"}</td>
        <td class="c-cat">${t.categoria ? `<span class="badge b-cat">${esc(t.categoria)}</span>` : '<span class="dim">—</span>'}</td>
        ${FLAGS.map(f => `<td class="c-chk">${t[f] ? "✅" : '<span class="dim">·</span>'}</td>`).join("")}
        <td class="c-res">${puestoBadge(t)}</td>
      </tr>`).join("");
    }

    // ------------------------------ Charts ------------------------------
    let GRID = "#2a313c", TICK = "#8b949e";
    function applyPalette() {
      const c = window.THEME ? window.THEME.colors() : null;
      if (c) { GRID = c.grid; TICK = c.tick; }
    }
    applyPalette();
    document.addEventListener("themechange", () => {
      applyPalette();
      if (initialized) renderCharts(completed(applyFilters()));
    });

    function destroyChart(key) { if (charts[key]) { charts[key].destroy(); delete charts[key]; } }
    function effColor(v) { return v >= 50 ? "#15803d" : "#b91c1c"; }

    function baseOpts(extra = {}) {
      return Object.assign({
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { boxWidth: 12, padding: 14 } } },
        scales: {
          x: { grid: { color: GRID }, ticks: { color: TICK } },
          y: { grid: { color: GRID }, ticks: { color: TICK }, beginAtZero: true }
        }
      }, extra);
    }

    function renderCharts(done) {
      const empty = el("empty"), grid = el("grid");
      const has = done.length > 0;
      empty.hidden = has;
      grid.hidden = !has;
      if (!has) {
        Object.keys(charts).forEach(destroyChart);
        el("titulos-range").innerHTML = "";
        el("titulos-legend").innerHTML = "";
        return;
      }

      // Barras apiladas (campeón / subcampeón / sin podio) + línea de % podios
      const comboBar = (canvasId, chartKey, opts) => {
        const groups = {};
        done.forEach(t => {
          const g = opts.groupBy(t);
          if (g == null || g === "") return;
          groups[g] = groups[g] || { camp: 0, sub: 0, sinPodio: 0 };
          if (t.puesto === "campeon") groups[g].camp++;
          else if (t.puesto === "subcampeon") groups[g].sub++;
          else groups[g].sinPodio++;
        });
        const tot = g => g.camp + g.sub + g.sinPodio;
        let keys = Object.keys(groups);
        if (opts.order === "cronologico") keys.sort();
        else if (opts.order === "natural") keys.sort((a, b) => a.localeCompare(b, "es", { numeric: true })); // F5, F8, F11, Futsal
        else keys.sort((a, b) => tot(groups[b]) - tot(groups[a]) || a.localeCompare(b, "es"));
        if (opts.limit) keys = keys.slice(0, opts.limit);
        const labels = keys.map(key => trunc(key, 22));
        const effPodio = keys.map(key => {
          const g = groups[key];
          return tot(g) ? +(((g.camp + g.sub) / tot(g)) * 100).toFixed(1) : 0;
        });
        destroyChart(chartKey);
        charts[chartKey] = new Chart(el(canvasId), {
          data: {
            labels,
            datasets: [
              { type: "bar", label: "🥇 Campeón", data: keys.map(key => groups[key].camp), backgroundColor: GOLD, stack: "s", yAxisID: "y", order: 2 },
              { type: "bar", label: "🥈 Subcampeón", data: keys.map(key => groups[key].sub), backgroundColor: SILVER, stack: "s", yAxisID: "y", order: 2 },
              { type: "bar", label: "Sin podio", data: keys.map(key => groups[key].sinPodio), backgroundColor: SIN_PODIO, stack: "s", yAxisID: "y", order: 2 },
              { type: "line", label: "% Podios", data: effPodio,
                borderColor: WIN_DARK, backgroundColor: WIN_DARK,
                pointBackgroundColor: effPodio.map(effColor), pointBorderColor: effPodio.map(effColor),
                pointRadius: 5, tension: 0.35, yAxisID: "y1", order: 1 }
            ]
          },
          options: baseOpts({
            plugins: {
              legend: { labels: { boxWidth: 12, padding: 14 } },
              tooltip: {
                callbacks: {
                  title: items => keys[items[0].dataIndex],
                  label: c => c.dataset.type === "line" ? `% Podios: ${c.parsed.y}%` : `${c.dataset.label}: ${c.parsed.y}`,
                  footer: items => `Total: ${tot(groups[keys[items[0].dataIndex]])}`
                }
              }
            },
            scales: {
              x: { stacked: true, grid: { color: GRID }, ticks: { color: TICK } },
              y: { stacked: true, position: "left", beginAtZero: true, grid: { color: GRID },
                ticks: { color: TICK, precision: 0 }, title: { display: true, text: "Torneos", color: TICK } },
              y1: { position: "right", beginAtZero: true, max: 100, grid: { drawOnChartArea: false },
                ticks: { color: WIN_DARK, callback: v => v + "%" },
                title: { display: true, text: "% Podios", color: WIN_DARK } }
            }
          })
        });
      };

      comboBar("chart-anio", "anio", { groupBy: t => (t.anio ? String(t.anio) : null), order: "cronologico" });
      comboBar("chart-equipo", "equipo", { groupBy: t => t.equipo, order: "tj" });
      comboBar("chart-torneo", "torneo", { groupBy: t => t.torneo, order: "tj", limit: 8 });
      const hasCat = done.some(t => t.categoria);
      el("card-categoria").hidden = !hasCat;
      if (hasCat) comboBar("chart-categoria", "categoria", { groupBy: t => t.categoria, order: "natural" });
      else destroyChart("categoria");

      titulosTimeline(done);
      topEquipos(done);
      instanciaChart(done);
    }

    // ---- Top 5 equipos ----
    function topEquipos(done) {
      const groups = {};
      done.forEach(t => {
        if (!t.equipo) return;
        const g = groups[t.equipo] = groups[t.equipo] || { tj: 0, camp: 0, sub: 0, sinPodio: 0 };
        g.tj++;
        if (t.puesto === "campeon") g.camp++;
        else if (t.puesto === "subcampeon") g.sub++;
        else g.sinPodio++;
      });
      const rows = Object.entries(groups).map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.tj - a.tj || (b.camp + b.sub) - (a.camp + a.sub) || a.name.localeCompare(b.name, "es"))
        .slice(0, 5);
      const eff = rows.map(r => r.tj ? +(((r.camp + r.sub) / r.tj) * 100).toFixed(1) : 0);

      destroyChart("comp");
      charts.comp = new Chart(el("chart-comp"), {
        data: {
          labels: rows.map(r => trunc(r.name, 26)),
          datasets: [
            { type: "bar", label: "🥇 Campeón", data: rows.map(r => r.camp), backgroundColor: GOLD, stack: "s", yAxisID: "y", order: 2 },
            { type: "bar", label: "🥈 Subcampeón", data: rows.map(r => r.sub), backgroundColor: SILVER, stack: "s", yAxisID: "y", order: 2 },
            { type: "bar", label: "Sin podio", data: rows.map(r => r.sinPodio), backgroundColor: SIN_PODIO, stack: "s", yAxisID: "y", order: 2 },
            { type: "line", label: "% Podios", data: eff,
              borderColor: WIN_DARK, backgroundColor: WIN_DARK,
              pointBackgroundColor: eff.map(effColor), pointBorderColor: eff.map(effColor),
              pointRadius: 5, tension: 0.35, yAxisID: "y1", order: 1 }
          ]
        },
        options: baseOpts({
          plugins: {
            legend: { labels: { boxWidth: 12, padding: 14 } },
            tooltip: { callbacks: {
              title: items => rows[items[0].dataIndex].name,
              label: c => c.dataset.type === "line" ? `% Podios: ${c.parsed.y}%` : `${c.dataset.label}: ${c.parsed.y}`,
              footer: items => `Total: ${rows[items[0].dataIndex].tj}`
            } }
          },
          scales: {
            x: { stacked: true, grid: { color: GRID }, ticks: { color: TICK } },
            y: { stacked: true, position: "left", beginAtZero: true, grid: { color: GRID },
              ticks: { color: TICK, precision: 0 }, title: { display: true, text: "Torneos", color: TICK } },
            y1: { position: "right", beginAtZero: true, max: 100, grid: { drawOnChartArea: false },
              ticks: { color: WIN_DARK, callback: v => v + "%" },
              title: { display: true, text: "% Podios", color: WIN_DARK } }
          }
        })
      });
    }

    // ---- Distribución por instancia en la que terminó ----
    function instanciaChart(done) {
      const order = ["zona", "octavos", "cuartos", "semifinal", "subcampeon", "campeon"];
      const buckets = Object.fromEntries(order.map(o => [o, 0]));
      done.forEach(t => { if (buckets[t.puesto] !== undefined) buckets[t.puesto]++; });
      const colors = ["#475569", "#64748b", "#94a3b8", BRONZE, SILVER, GOLD];

      destroyChart("inst");
      charts.inst = new Chart(el("chart-instancia"), {
        type: "bar",
        data: {
          labels: order.map(o => INST_LABEL[o]),
          datasets: [{ label: "Torneos", data: order.map(o => buckets[o]), backgroundColor: colors, borderRadius: 6 }]
        },
        options: baseOpts({
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: GRID }, ticks: { color: TICK } },
            y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TICK, precision: 0 },
              title: { display: true, text: "Torneos", color: TICK } }
          }
        })
      });
    }

    // ------------------------------ Títulos y subcampeonatos en el tiempo ------------------------------
    // El Excel guarda solo el AÑO (no la fecha), así que el eje X es el ORDEN de los torneos
    // (año + número "#"). Línea escalonada de títulos acumulados:
    //  · Título: punto con aro dorado (relleno = color del equipo); suma un escalón.
    //  · Subcampeonato: aro plateado sobre el escalón vigente; NO suma.
    //  · Resto: puntito gris sobre la misma línea.
    //  · Rango: "Todo" (colapsado) o un año expandido.
    function titulosModel(done, year = null) {
      const seq = [...done].sort(byOrder).map((t, i) => ({ t, x: i + 1 }));
      const titulosAll = seq.filter(s => s.t.puesto === "campeon");
      const subsAll = seq.filter(s => s.t.puesto === "subcampeon");
      const escalon = x => titulosAll.filter(s => s.x <= x).length;

      const vis = year ? seq.filter(s => String(s.t.anio) === year) : seq;
      const titulos = vis.filter(s => s.t.puesto === "campeon");
      const subs = vis.filter(s => s.t.puesto === "subcampeon");
      const otros = vis.filter(s => s.t.puesto !== "campeon" && s.t.puesto !== "subcampeon");

      // Equipos ordenados por títulos, después subcampeonatos (el orden fija el color)
      const tally = (ts, ss) => {
        const st = {};
        const bump = (s, key) => { const n = s.t.equipo || "—"; (st[n] = st[n] || { camp: 0, sub: 0 })[key]++; };
        ts.forEach(s => bump(s, "camp"));
        ss.forEach(s => bump(s, "sub"));
        return st;
      };
      const statsAll = tally(titulosAll, subsAll);
      const st = tally(titulos, subs);
      const partners = [...new Set(seq.map(s => s.t.equipo || "—"))].sort((a, b) =>
        ((statsAll[b] || {}).camp || 0) - ((statsAll[a] || {}).camp || 0) ||
        ((statsAll[b] || {}).sub || 0) - ((statsAll[a] || {}).sub || 0) || a.localeCompare(b, "es"));
      const legend = partners.filter(p => st[p]);

      const base = year ? titulosAll.filter(s => (s.t.anio || 0) < Number(year)).length : 0;
      const pts = titulos.map((s, i) => ({ x: s.x, y: base + i + 1, t: s.t }));
      const subPts = subs.map(s => ({ x: s.x, y: escalon(s.x), t: s.t }));
      const otrosPts = otros.map(s => ({ x: s.x, y: escalon(s.x), t: s.t }));
      const acc = base + titulos.length;

      let x0 = 0, x1 = 2;
      if (vis.length) {
        x0 = vis[0].x - 0.9; x1 = vis[vis.length - 1].x + 0.9;
        if (x1 - x0 < 2.6) { const c = (x0 + x1) / 2; x0 = c - 1.3; x1 = c + 1.3; }
      }
      const step = [{ x: x0, y: base }, ...pts, { x: x1, y: acc }];

      // Ticks del eje X: colapsado → primer torneo de cada año; expandido → "#" de cada torneo
      let ticks = [];
      if (year) ticks = vis.map(s => ({ value: s.x, label: "#" + s.t.id }));
      else {
        const seen = new Set();
        seq.forEach(s => { const y = String(s.t.anio || "—"); if (!seen.has(y)) { seen.add(y); ticks.push({ value: s.x, label: y }); } });
      }

      return { pts, subPts, otros: otrosPts, step, acc, base, x0, x1, partners, legend, stats: st,
        ticks, nTitulos: titulos.length, nSubs: subs.length };
    }

    function renderTitulosRange(done) {
      const box = el("titulos-range");
      const years = [...new Set(done.filter(t => t.anio).map(t => String(t.anio)))].sort();
      if (titulosYear && !years.includes(titulosYear)) titulosYear = null;
      if (years.length < 2) { box.innerHTML = ""; titulosYear = null; return; }
      const btn = (val, label) => {
        const on = (val || null) === titulosYear;
        return `<button type="button" data-year="${val}" class="${on ? "on" : ""}" aria-pressed="${on}">${label}</button>`;
      };
      box.innerHTML = btn("", "Todo") + years.map(y => btn(y, (y === titulosYear ? "▾ " : "▸ ") + y)).join("");
    }

    const partnerColor = (m, C, name) => C.partners[m.partners.indexOf(name || "—") % C.partners.length];

    function legendHTML(m, C) {
      return m.legend.map(p => {
        const s = m.stats[p], parts = [];
        if (s.camp) parts.push(`🏆 ${s.camp}`);
        if (s.sub) parts.push(`🥈 ${s.sub}`);
        return `<span><i style="background:${partnerColor(m, C, p)}"></i><b>${esc(p)}</b> ${parts.join(" · ")}</span>`;
      }).join("");
    }

    // Configuración de Chart.js. opts.scale agranda textos y puntos (imagen de WhatsApp);
    // opts.compact fuerza / desactiva el modo compacto (por defecto: ancho < 600px).
    function titulosConfig(m, C, opts = {}) {
      const fs = opts.scale || 1;
      const colorOf = name => partnerColor(m, C, name);
      const isCompact = ch => (opts.compact !== undefined ? opts.compact : ch.width < 600);

      const labelPlugin = {
        id: "titulosLabels",
        afterDatasetsDraw(ch) {
          const ctx = ch.ctx, area = ch.chartArea;
          const compact = isCompact(ch);
          if (!m.pts.length && !m.subPts.length) {
            ctx.save();
            ctx.textAlign = "center"; ctx.fillStyle = C.tick;
            ctx.font = `500 ${13 * fs}px Inter, sans-serif`;
            ctx.fillText(titulosYear ? "Sin títulos ni subcampeonatos en " + titulosYear : "Todavía sin títulos ni subcampeonatos", (area.left + area.right) / 2, (area.top + area.bottom) / 2);
            ctx.restore();
            return;
          }

          // Etiquetas sin superposición: cada una prueba posiciones candidatas y se queda con
          // la primera que no pisa otra etiqueta ni otro punto. Si se aleja, lleva línea guía.
          const placed = [];
          const hit = (r, q) => r.l < q.r && r.r > q.l && r.t < q.b && r.b > q.t;
          const pointBoxes = [1, 2, 3].flatMap(di => ch.getDatasetMeta(di).data.map(p => {
            const rr = (di === 1 ? 12 : di === 2 ? 10 : 5) * fs;
            return { l: p.x - rr, r: p.x + rr, t: p.y - rr, b: p.y + rr, x: p.x, y: p.y };
          }));
          const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

          function drawLabel(p, lines, candidates) {
            ctx.save();
            const w = Math.max(...lines.map(([f, txt]) => { ctx.font = f; return ctx.measureText(txt).width; })) + 8 * fs;
            const h = lines.h;
            const obstacles = placed.concat(pointBoxes.filter(q => q.x !== p.x || q.y !== p.y));
            const rectAt = (cx, ty) => ({ l: cx - w / 2, r: cx + w / 2, t: ty, b: ty + h });
            const ok = r => r.t >= area.top - 2 && r.b <= area.bottom - 2 &&
              r.l >= 0 && r.r <= ch.width && !obstacles.some(q => hit(r, q));
            let best = null;
            for (const c of candidates(w, h)) { if (ok(rectAt(c.cx, c.ty))) { best = c; break; } }
            if (!best) best = candidates(w, h).next().value;
            const r = rectAt(best.cx, best.ty);
            placed.push(r);
            const gx = clamp(p.x, r.l, r.r), gy = clamp(p.y, r.t, r.b);
            if (Math.hypot(gx - p.x, gy - p.y) > 22 * fs) {
              ctx.strokeStyle = C.tick; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(gx, gy); ctx.stroke();
              ctx.globalAlpha = 1;
            }
            ctx.textAlign = "center";
            lines.forEach(([f, txt, color, off]) => {
              ctx.font = f; ctx.fillStyle = color;
              ctx.fillText(txt, best.cx, best.ty + off);
            });
            ctx.restore();
          }

          const step = 4 * fs;
          function* titleCandidates(p, w, h) {
            const side = w / 2 + 14 * fs;
            for (let ty = p.y - 14 * fs - h; ty >= area.top - 2; ty -= step) {
              yield { cx: p.x, ty }; yield { cx: p.x - side, ty }; yield { cx: p.x + side, ty };
            }
          }
          function* subCandidates(p, w, h) {
            const side = w / 2 + 14 * fs;
            yield { cx: p.x, ty: p.y + 12 * fs };
            yield { cx: p.x + side, ty: p.y - h / 2 };
            yield { cx: p.x - side, ty: p.y - h / 2 };
            for (let ty = p.y - 12 * fs - h; ty >= area.top - 2; ty -= step) {
              yield { cx: p.x, ty }; yield { cx: p.x - side, ty }; yield { cx: p.x + side, ty };
            }
          }

          ch.getDatasetMeta(1).data.forEach((p, i) => {
            const t = m.pts[i].t;
            let lines;
            if (compact) {
              lines = [[`700 ${14 * fs}px 'Barlow Condensed', sans-serif`, "🏆 " + trunc(t.equipo, 12), C.gold, 12 * fs]];
              lines.h = 15 * fs;
            } else {
              lines = [
                [`700 ${17 * fs}px 'Barlow Condensed', sans-serif`, "🏆 " + trunc(t.equipo, 20), C.gold, 14 * fs],
                [`600 ${12 * fs}px Inter, sans-serif`, trunc(t.torneo, 24), colorOf(t.equipo), 30 * fs],
                [`500 ${11 * fs}px Inter, sans-serif`, String(t.anio || ""), C.tick, 44 * fs]
              ];
              lines.h = 48 * fs;
            }
            drawLabel(p, lines, (w, h) => titleCandidates(p, w, h));
          });

          ch.getDatasetMeta(2).data.forEach((p, i) => {
            const t = m.subPts[i].t;
            let lines;
            if (compact) {
              lines = [[`700 ${13 * fs}px 'Barlow Condensed', sans-serif`, "🥈 " + trunc(t.equipo, 12), C.silverText, 11 * fs]];
              lines.h = 14 * fs;
            } else {
              lines = [
                [`700 ${15 * fs}px 'Barlow Condensed', sans-serif`, "🥈 " + trunc(t.equipo, 20), C.silverText, 12 * fs],
                [`600 ${11 * fs}px Inter, sans-serif`, trunc(t.torneo, 24), colorOf(t.equipo), 26 * fs]
              ];
              lines.h = 30 * fs;
            }
            drawLabel(p, lines, (w, h) => subCandidates(p, w, h));
          });
        }
      };

      const tickFont = { size: 12 * fs };
      const tickLabels = Object.fromEntries(m.ticks.map(t => [t.value, t.label]));
      return {
        data: {
          datasets: [
            { type: "line", label: "Títulos acumulados", data: m.step, stepped: "before",
              borderColor: C.gold, borderWidth: 2 * fs, backgroundColor: C.goldFill, fill: true,
              pointRadius: 0, pointHoverRadius: 0, order: 4 },
            { type: "scatter", label: "Título", data: m.pts,
              pointRadius: 9 * fs, pointHoverRadius: 11 * fs,
              pointBackgroundColor: m.pts.map(p => colorOf(p.t.equipo)),
              pointBorderColor: C.gold, pointBorderWidth: 3 * fs, order: 1 },
            { type: "scatter", label: "Subcampeonato", data: m.subPts,
              pointRadius: 7 * fs, pointHoverRadius: 9 * fs,
              pointBackgroundColor: m.subPts.map(p => colorOf(p.t.equipo)),
              pointBorderColor: C.silver, pointBorderWidth: 3 * fs, order: 2 },
            { type: "scatter", label: "Otros torneos", data: m.otros,
              pointRadius: 3.5 * fs, pointHoverRadius: 5 * fs,
              pointBackgroundColor: C.tick, pointBorderWidth: 0, order: 3 }
          ]
        },
        options: {
          responsive: !opts.static, maintainAspectRatio: false,
          animation: opts.static ? false : undefined,
          devicePixelRatio: opts.dpr || undefined,
          layout: { padding: { top: 6 * fs, right: 12 * fs } },
          interaction: { mode: "nearest", intersect: true },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: !opts.static,
              filter: i => i.datasetIndex !== 0,
              callbacks: {
                title: items => { const t = items[0].raw.t; return t ? `${t.anio || "—"} · ${t.torneo || "—"}` : ""; },
                label: c => {
                  const t = c.raw.t;
                  if (!t) return "";
                  if (c.datasetIndex === 1) return `🏆 Campeón con ${t.equipo || "—"} (título #${c.raw.y})`;
                  if (c.datasetIndex === 2) return `🥈 Subcampeón con ${t.equipo || "—"}`;
                  return `Terminó en: ${INST_LABEL[t.puesto] || "—"} · ${t.equipo || "—"}`;
                }
              }
            }
          },
          scales: {
            x: {
              type: "linear", min: m.x0, max: m.x1,
              grid: { color: C.grid },
              ticks: { color: C.tick, autoSkip: false, maxRotation: 0, font: tickFont,
                callback: v => tickLabels[v] || "" },
              afterBuildTicks: axis => {
                // Raleado según el ancho para que no se pisen los rótulos
                const maxTicks = Math.max(3, Math.floor(axis.chart.width / (62 * fs)));
                const every = Math.max(1, Math.ceil(m.ticks.length / maxTicks));
                axis.ticks = m.ticks.filter((_, i) => i % every === 0).map(t => ({ value: t.value }));
              }
            },
            y: {
              // un escalón de aire debajo del 0 para que los subcampeonatos del arranque no queden sobre el eje
              min: m.base - 1, max: m.acc + (m.acc - m.base ? 3 : 1.5),
              grid: { color: C.grid },
              ticks: { color: C.tick, stepSize: 1, precision: 0, font: tickFont, callback: v => (v >= m.base && v <= m.acc ? v : "") },
              title: { display: true, text: "Títulos acumulados", color: C.tick, font: tickFont }
            }
          }
        },
        plugins: [labelPlugin]
      };
    }

    function titulosTimeline(done) {
      const C = paletteOf();
      renderTitulosRange(done);
      const m = titulosModel(done, titulosYear);
      el("titulos-legend").innerHTML = legendHTML(m, C);
      destroyChart("titulos");
      const canvas = el("chart-titulos");
      if (!canvas) return;
      charts.titulos = new Chart(canvas, titulosConfig(m, C));
    }

    // Gráfico en canvas fuera de pantalla (tema oscuro, tamaño fijo) para la imagen de WhatsApp
    function renderTitulosOffscreen(m, w, h) {
      const C = paletteOf("dark");
      const host = document.createElement("div");
      host.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;height:${h}px;`;
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.style.width = w + "px"; cv.style.height = h + "px";
      host.appendChild(cv);
      document.body.appendChild(host);
      const chart = new Chart(cv, titulosConfig(m, C, { scale: 1.3, compact: false, static: true, dpr: 2 }));
      return { canvas: cv, dispose: () => { chart.destroy(); host.remove(); } };
    }

    // ------------------------------ WhatsApp ------------------------------
    const FILTER_LABELS = { anio: "Año", equipo: "Equipo", torneo: "Torneo", categoria: "Categoría", puesto: "Puesto", lastN: "Últimos" };
    const FILTER_ORDER = ["anio", "equipo", "torneo", "categoria", "puesto", "lastN"];
    const PUESTO_SHORT = { campeon: "Campeón", subcampeon: "Subcampeón", semifinal: "Semifinal",
      cuartos: "Cuartos", octavos: "Octavos", zona: "Zona", en_curso: "En curso" };

    const txt = (s) => { const e = el(s); return e ? e.textContent.trim() : "–"; };

    function shownFilters() {
      const out = [];
      FILTER_ORDER.forEach(key => {
        if (key === "lastN") { if (filters.lastN) out.push(`${FILTER_LABELS.lastN}: ${filters.lastN}`); return; }
        const arr = filters[key] || [];
        if (arr.length) {
          const vals = arr.map(v => key === "puesto" ? (PUESTO_SHORT[v] || v) : String(v)).join(", ");
          out.push(FILTER_LABELS[key] + ": " + vals);
        }
      });
      return out;
    }

    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function baseCanvas() {
      const DPR = 2, W = 1080, H = 1080;
      const cv = document.createElement("canvas");
      cv.width = W * DPR; cv.height = H * DPR;
      const ctx = cv.getContext("2d");
      ctx.scale(DPR, DPR);
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#0d1117"); g.addColorStop(1, "#0a0e14");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const rg = ctx.createRadialGradient(150, -40, 0, 150, -40, 520);
      rg.addColorStop(0, "rgba(251,191,36,0.18)"); rg.addColorStop(1, "rgba(251,191,36,0)");
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      ctx.textBaseline = "alphabetic";
      return { cv, ctx, W, H };
    }

    function fitLine(ctx, line, maxW) {
      if (ctx.measureText(line).width <= maxW) return line;
      while (ctx.measureText(line + "…").width > maxW && line.length) line = line.slice(0, -1);
      return line + "…";
    }

    function buildStatsImage() {
      const { cv, ctx, W } = baseCanvas();
      const PAD = 64;
      ctx.fillStyle = "#fbbf24"; ctx.font = "600 22px Inter, sans-serif";
      ctx.fillText("FÚTBOL · CIRCUITO DE TORNEOS", PAD, 96);
      ctx.fillStyle = "#e6edf3"; ctx.font = "700 76px 'Barlow Condensed', Arial Narrow, sans-serif";
      ctx.fillText("TORNEOS · " + player.nombre.toUpperCase(), PAD, 168);
      ctx.fillStyle = "#8b949e"; ctx.font = "500 24px Inter, sans-serif";
      ctx.fillText(txt("last-update") || "", PAD, 208);

      const fl = shownFilters();
      ctx.fillStyle = "#9aa4b0"; ctx.font = "500 22px Inter, sans-serif";
      ctx.fillText(fitLine(ctx, "Filtros · " + (fl.length ? fl.join("  ·  ") : "Todos los torneos"), W - PAD * 2), PAD, 248);

      const cards = [
        { label: "TORNEOS JUGADOS", value: txt("kpi-tj"), color: "#e6edf3" },
        { label: "CAMPEÓN 🥇", value: txt("kpi-camp"), color: "#fbbf24" },
        { label: "SUBCAMPEÓN 🥈", value: txt("kpi-sub"), color: "#cbd5e1" },
        { label: "PODIOS TOTALES", value: txt("kpi-podios"), color: "#e6edf3" },
        { label: "% PODIOS", value: txt("kpi-eff"), color: "#4ade80" },
        { label: "SEMIS ALCANZADAS", value: txt("kpi-semis"), color: "#e6edf3" },
        { label: "FINALES JUGADAS", value: txt("kpi-finales"), color: "#e6edf3" },
        { label: "INSTANCIA MÁS FRECUENTE", value: txt("kpi-inst"), color: "#fbbf24" }
      ];
      const cols = 2, gap = 26, gridTop = 300, gridBottom = 1000;
      const cw = (W - PAD * 2 - gap * (cols - 1)) / cols;
      const rowCount = Math.ceil(cards.length / cols);
      const ch = (gridBottom - gridTop - gap * (rowCount - 1)) / rowCount;
      cards.forEach((c, i) => {
        const cx = PAD + (i % cols) * (cw + gap);
        const cy = gridTop + Math.floor(i / cols) * (ch + gap);
        roundRect(ctx, cx, cy, cw, ch, 18);
        ctx.fillStyle = "#161b22"; ctx.fill();
        ctx.strokeStyle = "#2a313c"; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = c.color; roundRect(ctx, cx, cy, 6, ch, 3); ctx.fill();
        ctx.fillStyle = "#8b949e"; ctx.font = "600 20px Inter, sans-serif";
        ctx.fillText(c.label, cx + 30, cy + 44);
        ctx.fillStyle = c.color; ctx.font = "700 72px 'Barlow Condensed', Arial Narrow, sans-serif";
        ctx.fillText(c.value.replace(/\s+/g, " "), cx + 30, cy + ch - 30);
      });
      ctx.fillStyle = "#8b949e"; ctx.font = "500 22px Inter, sans-serif";
      ctx.fillText("Estadísticas de Fútbol · Lolo & Fede", PAD, 1048);
      return cv;
    }

    const canvasToBlob = (cv) => new Promise(res => cv.toBlob(res, "image/png"));

    async function shareBlob(blob, filename, text) {
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
    }

    async function shareStats() {
      const fab = $("wa-share");
      if (fab) fab.classList.add("busy");
      try {
        if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) {} }
        const blob = await canvasToBlob(buildStatsImage());
        const text = `Torneos de fútbol de ${player.nombre} ⚽ ${txt("kpi-camp")} campeón · ${txt("kpi-sub")} subcampeón · ${txt("kpi-eff")} podios`;
        await shareBlob(blob, `torneos-futbol-${k}.png`, text);
      } catch (err) {
        if (err && err.name === "AbortError") return;
        console.error(err);
        alert("No se pudo generar la imagen para compartir.");
      } finally {
        if (fab) fab.classList.remove("busy");
      }
    }

    function buildTitulosImage() {
      const { cv, ctx, W } = baseCanvas();
      const PAD = 64;
      const m = titulosModel(completed(applyFilters()), titulosYear);
      const C = paletteOf("dark");

      ctx.fillStyle = "#fbbf24"; ctx.font = "600 22px Inter, sans-serif";
      ctx.fillText("FÚTBOL · CIRCUITO DE TORNEOS", PAD, 96);
      ctx.fillStyle = "#e6edf3"; ctx.font = "700 76px 'Barlow Condensed', Arial Narrow, sans-serif";
      ctx.fillText("TÍTULOS · " + player.nombre.toUpperCase(), PAD, 168);

      ctx.font = "700 34px 'Barlow Condensed', Arial Narrow, sans-serif";
      let x = PAD;
      const seg = (text, color) => { ctx.fillStyle = color; ctx.fillText(text, x, 214); x += ctx.measureText(text).width; };
      seg(`🏆 ${m.nTitulos} título${m.nTitulos === 1 ? "" : "s"}`, "#fbbf24");
      seg("   ·   ", "#8b949e");
      seg(`🥈 ${m.nSubs} subcampeonato${m.nSubs === 1 ? "" : "s"}`, "#cbd5e1");

      const fl = shownFilters().concat(titulosYear ? ["Año " + titulosYear] : []);
      ctx.fillStyle = "#9aa4b0"; ctx.font = "500 22px Inter, sans-serif";
      const prefix = "Filtros · ";
      ctx.fillText(prefix + fitLine(ctx, fl.length ? fl.join("  ·  ") : "Todos los torneos", W - PAD * 2 - ctx.measureText(prefix).width), PAD, 254);

      // leyenda de equipos (con salto de línea)
      let lx = PAD, ly = 302;
      m.legend.forEach(p => {
        const s = m.stats[p], parts = [];
        if (s.camp) parts.push(`🏆 ${s.camp}`);
        if (s.sub) parts.push(`🥈 ${s.sub}`);
        ctx.font = "600 22px Inter, sans-serif";
        const name = trunc(p, 26);
        const nameW = ctx.measureText(name).width;
        ctx.font = "500 20px Inter, sans-serif";
        const cntTxt = "  " + parts.join(" · ");
        const itemW = 24 + nameW + ctx.measureText(cntTxt).width + 30;
        if (lx + itemW > W - PAD && lx > PAD) { lx = PAD; ly += 36; }
        ctx.fillStyle = partnerColor(m, C, p);
        ctx.beginPath(); ctx.arc(lx + 8, ly - 7, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#e6edf3"; ctx.font = "600 22px Inter, sans-serif";
        ctx.fillText(name, lx + 24, ly);
        ctx.fillStyle = "#8b949e"; ctx.font = "500 20px Inter, sans-serif";
        ctx.fillText(cntTxt, lx + 24 + nameW, ly);
        lx += itemW;
      });

      const panelTop = ly + 30, panelBottom = 1004;
      roundRect(ctx, PAD, panelTop, W - PAD * 2, panelBottom - panelTop, 18);
      ctx.fillStyle = "#161b22"; ctx.fill();
      ctx.strokeStyle = "#2a313c"; ctx.lineWidth = 1; ctx.stroke();
      const inset = 22;
      const cw = W - PAD * 2 - inset * 2, chh = panelBottom - panelTop - inset * 2;
      const off = renderTitulosOffscreen(m, cw, chh);
      try { ctx.drawImage(off.canvas, PAD + inset, panelTop + inset, cw, chh); }
      finally { off.dispose(); }

      ctx.fillStyle = "#8b949e"; ctx.font = "500 22px Inter, sans-serif";
      ctx.fillText("Estadísticas de Fútbol · Lolo & Fede", PAD, 1048);
      return { canvas: cv, model: m };
    }

    async function shareTitulosChart() {
      const btn = el("titulos-share");
      if (btn) btn.classList.add("busy");
      try {
        if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) {} }
        const { canvas, model: m } = buildTitulosImage();
        const blob = await canvasToBlob(canvas);
        const text = `Títulos de fútbol de ${player.nombre} 🏆 ${m.nTitulos} título${m.nTitulos === 1 ? "" : "s"} · 🥈 ${m.nSubs} subcampeonato${m.nSubs === 1 ? "" : "s"}`;
        await shareBlob(blob, `titulos-futbol-${k}.png`, text);
      } catch (err) {
        if (err && err.name === "AbortError") return;
        console.error(err);
        alert("No se pudo generar la imagen para compartir.");
      } finally {
        if (btn) btn.classList.remove("busy");
      }
    }

    return {
      key: k,
      html: template,
      init,
      shareStats,
      resizeCharts() { Object.values(charts).forEach(c => c.resize()); }
    };
  }

  // ---------------------------------------------------------------------------
  // Arranque: tabs + dashboards
  // ---------------------------------------------------------------------------
  const DASH = {};

  function activate(key) {
    document.querySelectorAll(".tab").forEach(t => {
      const on = t.dataset.tab === key;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === "tab-" + key));
    window.ACTIVE_TAB = key;
    const d = DASH[key];
    if (d) { d.init(); setTimeout(() => { d.resizeCharts(); window.dispatchEvent(new Event("resize")); }, 30); }
  }

  function showError(msg) {
    $("tab-contents").innerHTML = `<p class="empty">${msg}</p>`;
    $("tabs").hidden = true;
  }

  async function boot() {
    await window.AUTH_READY; // login obligatorio
    let json;
    try {
      const res = await fetch("data/torneos.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      json = await res.json();
    } catch (e) {
      console.error("Error cargando data/torneos.json:", e);
      showError('No se pudo cargar <code>data/torneos.json</code>. Si abriste el archivo directamente, servilo con un servidor local (ej: <code>python -m http.server</code>).');
      return;
    }
    const players = (json.jugadores || []).filter(p => p && p.clave);
    if (!players.length) { showError("El JSON no tiene jugadores. Revisá <code>data/torneos.json</code>."); return; }

    const tabs = $("tabs"), contents = $("tab-contents");
    players.forEach(p => {
      p.nombre = p.nombre || p.clave;
      DASH[p.clave] = createDashboard(p, { actualizado: json.actualizado });
      const b = document.createElement("button");
      b.className = "tab"; b.dataset.tab = p.clave; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", "false");
      b.textContent = "⚽ " + p.nombre;
      b.addEventListener("click", () => activate(p.clave));
      tabs.appendChild(b);
      const c = document.createElement("div");
      c.id = "tab-" + p.clave; c.className = "tab-content";
      c.innerHTML = DASH[p.clave].html();
      contents.appendChild(c);
    });
    activate(players[0].clave);
  }

  // ---------------------------------------------------------------------------
  // Botón flotante de WhatsApp: arrastrable, comparte la pestaña activa
  // ---------------------------------------------------------------------------
  (function () {
    const fab = $("wa-share");
    if (!fab) return;
    let dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    const M = 6;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    function place(left, top) {
      const w = fab.offsetWidth, h = fab.offsetHeight;
      left = clamp(left, M, window.innerWidth - w - M);
      top = clamp(top, M, window.innerHeight - h - M);
      fab.style.left = left + "px"; fab.style.top = top + "px";
      fab.style.right = "auto"; fab.style.bottom = "auto";
    }
    function down(x, y) {
      dragging = true; moved = false;
      const r = fab.getBoundingClientRect();
      ox = x - r.left; oy = y - r.top; sx = x; sy = y;
      fab.classList.add("dragging");
    }
    function move(x, y) {
      if (!dragging) return;
      if (Math.abs(x - sx) > 4 || Math.abs(y - sy) > 4) moved = true;
      place(x - ox, y - oy);
    }
    function up() { if (!dragging) return; dragging = false; fab.classList.remove("dragging"); }

    fab.addEventListener("mousedown", e => { down(e.clientX, e.clientY); e.preventDefault(); });
    window.addEventListener("mousemove", e => move(e.clientX, e.clientY));
    window.addEventListener("mouseup", up);
    fab.addEventListener("touchstart", e => { const t = e.touches[0]; down(t.clientX, t.clientY); }, { passive: true });
    fab.addEventListener("touchmove", e => { const t = e.touches[0]; move(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
    fab.addEventListener("touchend", up);
    window.addEventListener("resize", () => {
      const r = fab.getBoundingClientRect();
      if (fab.style.left) place(r.left, r.top);
    });
    fab.addEventListener("click", e => {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
      const d = DASH[window.ACTIVE_TAB];
      if (d) d.shareStats();
    });
  })();

  boot();
})();

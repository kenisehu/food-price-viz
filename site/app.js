const FOOD = "0002";
const app = document.getElementById("app");
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let data, byCode, children, first, latestIdx, imports;
let mainChart, navChart;

setupTheme();

Promise.all([
  fetch("data/cpi_food.json").then((r) => r.json()),
  fetch("data/import_sources.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
])
  .then(([json, importJson]) => {
    data = json;
    imports = importJson;
    byCode = Object.fromEntries(data.nodes.map((n) => [n.code, n]));
    children = {};
    for (const n of data.nodes) (children[n.parent] ??= []).push(n);
    first = data.meta.first_month;
    latestIdx = monthIndex(data.meta.latest_month);
    window.addEventListener("hashchange", route);
    route();
  });

// ---------- 共通 ----------

function setupTheme() {
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch {}
  const dark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
    route();
  });
}

function monthIndex(ym) {
  return (Number(ym.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + Number(ym.slice(4)) - Number(first.slice(4));
}

function monthLabel(i) {
  const y = Number(first.slice(0, 4)) + Math.floor((i + Number(first.slice(4)) - 1) / 12);
  const m = ((i + Number(first.slice(4)) - 1) % 12) + 1;
  return { y, m, text: `${y}年${m}月` };
}

function value(n, i) {
  const k = i - n.start;
  return k >= 0 && k < n.values.length ? n.values[k] : null;
}

function yoy(n, i = latestIdx) {
  const cur = value(n, i);
  const prev = value(n, i - 12);
  return cur != null && prev ? (cur / prev - 1) * 100 : null;
}

function fmtPct(v) {
  if (v == null) return "-";
  const s = v.toFixed(2);
  return v > 0 ? `+${s}%` : `${s}%`;
}

function pctClass(v) {
  return v > 0 ? "pos" : v < 0 ? "neg" : "";
}

function fmtIndex(v) {
  return v == null ? "-" : v.toFixed(1);
}

function href(n) {
  return n.code === FOOD ? "#/" : n.is_item ? `#/i/${n.code}` : `#/c/${n.code}`;
}

function ancestors(n) {
  const out = [];
  for (let p = byCode[n.parent]; p; p = byCode[p.parent]) out.unshift(p);
  return out;
}

function descendants(code) {
  const out = [];
  const walk = (c) => (children[c] ?? []).forEach((k) => { out.push(k); walk(k.code); });
  walk(code);
  return out;
}

function midCategory(n) {
  if (n.depth <= 1) return n;
  return ancestors(n).find((a) => a.depth === 1);
}

function crumbs(n) {
  const path = [...ancestors(n), n];
  return `<nav class="crumbs"><a href="#/">ホーム</a>${path
    .map((p, i) => `<span class="sep">›</span>${i === path.length - 1 ? `<span>${esc(p.name)}</span>` : `<a href="${href(p)}">${esc(p.name)}</a>`}`)
    .join("")}</nav>`;
}

function footer() {
  return `<footer class="site-footer">
    <p>📊 出典: 消費者物価指数（総務省統計局）</p>
    <p>最終更新: ${data.meta.built_at}（データは${monthLabel(latestIdx).text}分まで）</p>
    <p>本サイトは、政府統計の総合窓口(e-Stat)で公開されているデータを加工して作成したもので、内容は国によって保証されたものではありません。</p>
  </footer>`;
}

function route() {
  mainChart?.destroy();
  navChart?.destroy();
  const [, kind, code] = location.hash.match(/^#\/(c|i)\/(\w+)/) ?? [];
  const n = byCode[code];
  if (kind === "i" && n?.is_item) renderItem(n);
  else if (kind === "c" && n && !n.is_item) renderCategory(n);
  else renderCategory(byCode[FOOD]);
  window.scrollTo(0, 0);
}

// ---------- カテゴリページ ----------

function renderCategory(n) {
  const isTop = n.code === FOOD;
  const desc = descendants(n.code);
  const leaves = desc.filter((d) => d.is_item);
  const ranked = desc.filter((d) => yoy(d) != null);
  const up = [...ranked].sort((a, b) => yoy(b) - yoy(a));
  const down = [...ranked].sort((a, b) => yoy(a) - yoy(b));
  const topN = isTop ? 10 : 5;
  const { y, m } = monthLabel(latestIdx);
  document.title = `${n.name}の物価指数 | 食料物価ウォッチ（試作）`;

  app.innerHTML = `
    ${crumbs(n)}
    <section>
      <h1>${esc(n.name)}の物価指数</h1>
      <p class="page-sub">${isTop ? "消費者物価指数 (CPI) — カテゴリから探す" : `${esc(byCode[n.parent].name)} — サブカテゴリ`}</p>
      <p class="page-meta">${y}年${m}月 | 基準年: ${data.meta.base_year}年 = 100 | ${desc.length} 品目</p>
    </section>
    <section class="tiles">
      <div class="tile"><p class="label">${esc(n.name)} 指数</p><p class="value">${fmtIndex(value(n, latestIdx))}</p><p class="sub ${pctClass(yoy(n))}">前年同月比 ${fmtPct(yoy(n))}</p></div>
      ${up[0] ? `<div class="tile"><p class="label">上昇率上位</p><p class="value">${esc(up[0].name)}</p><p class="sub ${pctClass(yoy(up[0]))}">${fmtPct(yoy(up[0]))}</p></div>` : ""}
      ${down[0] ? `<div class="tile"><p class="label">下落率上位</p><p class="value">${esc(down[0].name)}</p><p class="sub ${pctClass(yoy(down[0]))}">${fmtPct(yoy(down[0]))}</p></div>` : ""}
    </section>
    <section>
      <h2>指数推移</h2>
      ${chartCard()}
    </section>
    ${isTop ? subcategorySection(n) : ""}
    <section class="rank-grid">
      ${rankTable("上昇率上位", up.slice(0, topN))}
      ${rankTable("下落率上位", down.slice(0, topN))}
    </section>
    <section>
      <h2>全品目一覧</h2>
      <div class="filter-bar">
        <input type="search" id="q" placeholder="品目を検索..." aria-label="品目を検索">
        ${isTop ? `<select id="sub" aria-label="サブカテゴリ"><option value="">すべてのサブカテゴリ</option>${children[n.code].map((c) => `<option value="${c.code}">${esc(c.name)}</option>`).join("")}</select>` : ""}
        <button type="button" id="reset">↺ 並び順をリセット</button>
        <span class="filter-count" id="count"></span>
      </div>
      <div class="card table-card"><table id="all-items"><thead></thead><tbody></tbody></table></div>
    </section>
    ${annualSection(n)}
    ${footer()}
  `;
  mountChart(n);
  mountSortable(document.getElementById("sub-table"));
  mountItemList(n, leaves, isTop);
}

function subcategorySection(n) {
  return `<section>
    <h2>サブカテゴリ</h2>
    <div class="card table-card"><table id="sub-table">
      <thead><tr><th class="sortable" data-key="0">サブカテゴリ<span class="arrow">▲</span></th><th class="sortable num" data-key="1" data-type="num">品目数<span class="arrow">▲</span></th></tr></thead>
      <tbody>${children[n.code]
        .map((c) => `<tr><td data-sort="${esc(c.name)}"><a href="${href(c)}">${esc(c.name)}</a></td><td class="num" data-sort="${descendants(c.code).length}">${descendants(c.code).length}</td></tr>`)
        .join("")}</tbody>
    </table></div>
  </section>`;
}

function rankTable(title, rows) {
  return `<div>
    <h2>${title}</h2>
    <div class="card table-card"><table>
      <thead><tr><th class="num" style="text-align:center">#</th><th>品目</th><th class="num">指数</th><th class="num">前年同月比</th></tr></thead>
      <tbody>${rows
        .map((r, i) => `<tr><td class="rank">${i + 1}</td><td><a href="${href(r)}">${esc(r.name)}</a></td><td class="num">${fmtIndex(value(r, latestIdx))}</td><td class="num ${pctClass(yoy(r))}">${fmtPct(yoy(r))}</td></tr>`)
        .join("")}</tbody>
    </table></div>
  </div>`;
}

function annualSection(n) {
  const rows = [];
  for (let i = latestIdx - ((monthLabel(latestIdx).m + 11) % 12); i >= n.start; i -= 12) {
    const v = value(n, i);
    if (v == null) continue;
    rows.push(`<tr><td>${monthLabel(i).y}</td><td class="num">${fmtIndex(v)}</td><td class="num ${pctClass(yoy(n, i))}">${fmtPct(yoy(n, i))}</td></tr>`);
  }
  return `<section>
    <h2>年次データ</h2>
    <div class="card table-card"><table>
      <thead><tr><th>年</th><th class="num">指数（1月）</th><th class="num">前年同月比</th></tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table></div>
  </section>`;
}

// ---------- 全品目一覧（階層表示＋並べ替え） ----------

function mountItemList(n, leaves, isTop) {
  const cols = [
    { key: "name", label: "品目" },
    ...(isTop ? [{ key: "sub", label: "サブカテゴリ" }] : []),
    { key: "index", label: "指数", num: true },
    { key: "yoy", label: "前年同月比", num: true },
  ];
  const state = { q: "", sub: "", sort: null, dir: 1, collapsed: new Set() };
  const table = document.getElementById("all-items");
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  const sortVal = (d, key) =>
    key === "name" ? d.name : key === "sub" ? midCategory(d).name : key === "index" ? value(d, latestIdx) : yoy(d);

  function cells(d) {
    return `<td style="padding-left:${16 + (d.depth - n.depth - 1) * (state.sort ? 0 : 12)}px">${
      d.is_item ? `<a href="${href(d)}">${esc(d.name)}</a>` : `<span class="chev">▾</span>${esc(d.name)}`
    }</td>${isTop ? `<td>${esc(midCategory(d).name)}</td>` : ""}<td class="num">${fmtIndex(value(d, latestIdx))}</td><td class="num ${pctClass(yoy(d))}">${fmtPct(yoy(d))}</td>`;
  }

  function render() {
    thead.innerHTML = `<tr>${cols
      .map((c) => `<th class="sortable${c.num ? " num" : ""}${state.sort === c.key ? " sorted" : ""}" data-key="${c.key}">${c.label}<span class="arrow">${state.sort === c.key && state.dir < 0 ? "▼" : "▲"}</span></th>`)
      .join("")}</tr>`;
    thead.querySelectorAll("th").forEach((th) =>
      th.addEventListener("click", () => {
        state.dir = state.sort === th.dataset.key ? -state.dir : 1;
        state.sort = th.dataset.key;
        render();
      }),
    );

    const match = (d) =>
      (!state.q || d.name.includes(state.q)) && (!state.sub || midCategory(d).code === state.sub);
    const visibleLeaves = leaves.filter(match);
    let html = "";
    if (state.sort) {
      const sorted = [...visibleLeaves].sort((a, b) => {
        const x = sortVal(a, state.sort), y = sortVal(b, state.sort);
        if (x == null || y == null) return (x == null) - (y == null); // 値のない季節品目は常に末尾
        return (typeof x === "string" ? x.localeCompare(y, "ja") : x - y) * state.dir;
      });
      html = sorted.map((d) => `<tr>${cells(d)}</tr>`).join("");
    } else {
      const keep = new Set();
      for (const d of visibleLeaves) for (const a of [d, ...ancestors(d)]) keep.add(a.code);
      const walk = (code) => {
        for (const d of children[code] ?? []) {
          if (!keep.has(d.code)) continue;
          if (d.is_item) html += `<tr>${cells(d)}</tr>`;
          else {
            const closed = state.collapsed.has(d.code);
            html += `<tr class="group-row${closed ? " collapsed" : ""}" data-code="${d.code}">${cells(d)}</tr>`;
            if (!closed) walk(d.code);
          }
        }
      };
      walk(n.code);
    }
    tbody.innerHTML = html;
    tbody.querySelectorAll("tr.group-row").forEach((tr) =>
      tr.addEventListener("click", () => {
        const c = tr.dataset.code;
        state.collapsed.has(c) ? state.collapsed.delete(c) : state.collapsed.add(c);
        render();
      }),
    );
    document.getElementById("count").textContent = `${visibleLeaves.length}/${leaves.length}件`;
  }

  document.getElementById("q").addEventListener("input", (e) => { state.q = e.target.value.trim(); render(); });
  document.getElementById("sub")?.addEventListener("change", (e) => { state.sub = e.target.value; render(); });
  document.getElementById("reset").addEventListener("click", () => { state.sort = null; state.dir = 1; render(); });
  render();
}

function mountSortable(table) {
  if (!table) return;
  let sortKey = null, dir = 1;
  table.querySelectorAll("th.sortable").forEach((th) =>
    th.addEventListener("click", () => {
      const k = Number(th.dataset.key);
      dir = sortKey === k ? -dir : 1;
      sortKey = k;
      const rows = [...table.tBodies[0].rows];
      rows.sort((a, b) => {
        const x = a.cells[k].dataset.sort, y = b.cells[k].dataset.sort;
        return (th.dataset.type === "num" ? x - y : x.localeCompare(y, "ja")) * dir;
      });
      rows.forEach((r) => table.tBodies[0].appendChild(r));
      table.querySelectorAll("th").forEach((h) => { h.classList.toggle("sorted", h === th); h.querySelector(".arrow") && (h.querySelector(".arrow").textContent = h === th && dir < 0 ? "▼" : "▲"); });
    }),
  );
}

// ---------- 品目ページ ----------

function renderItem(n) {
  const anc = ancestors(n);
  const mid = midCategory(n);
  const { y, m } = monthLabel(latestIdx);
  const siblings = descendants(mid.code).filter((d) => d.is_item && d.code !== n.code);
  document.title = `${n.name}の物価指数 | 食料物価ウォッチ（試作）`;
  app.innerHTML = `
    ${crumbs(n)}
    <section>
      <h1>${esc(n.name)}の物価指数</h1>
      <p class="page-sub">分類: ${anc.filter((a) => a.depth <= 1).map((a) => esc(a.name)).join(" / ")}</p>
      <p class="page-meta">${y}年${m}月 | 基準年: ${data.meta.base_year}年 = 100</p>
    </section>
    <section class="tiles">
      <div class="tile"><p class="label">指数</p><p class="value">${fmtIndex(value(n, latestIdx))}</p><p class="sub ${pctClass(yoy(n))}">前年同月比 ${fmtPct(yoy(n))}</p></div>
    </section>
    <section>
      <h2>指数推移</h2>
      ${chartCard()}
    </section>
    ${importSection(n)}
    ${annualSection(n)}
    <section>
      <h2>同じカテゴリの品目</h2>
      <p class="siblings">${siblings.map((s) => `<a href="${href(s)}">${esc(s.name)}</a>`).join('<span class="dot">·</span>')}</p>
    </section>
    ${footer()}
  `;
  mountChart(n);
}

function importSection(n) {
  const it = imports?.items[n.code];
  if (!it) return "";
  const oku = (thousandYen) => (thousandYen / 1e5).toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const others = it.country_count - it.top.length;
  return `<section>
    <h2>主な輸入先（${imports.meta.year}年・輸入額ベース）</h2>
    <div class="card table-card"><table>
      <thead><tr><th class="num" style="text-align:center">#</th><th>国・地域</th><th class="num">輸入額（億円）</th><th class="num">シェア</th></tr></thead>
      <tbody>${it.top
        .map((t, i) => `<tr><td class="rank">${i + 1}</td><td>${esc(t.country)}</td><td class="num">${oku(t.value_thousand_yen)}</td><td class="num">${t.share.toFixed(1)}%</td></tr>`)
        .join("")}</tbody>
    </table></div>
    <p class="page-meta">輸入額の合計 ${oku(it.total_thousand_yen)}億円${others > 0 ? `（ほか${others}か国・地域）` : ""}。対象の貿易統計品目: ${esc(it.hs_description)}${it.note ? `。${esc(it.note)}` : ""}</p>
    <p class="page-meta">出典: ${esc(imports.meta.source)}</p>
  </section>`;
}

// ---------- 指数推移チャート（期間ボタン＋ナビゲーター） ----------

function chartCard() {
  return `<div class="card chart-card">
    <div class="range-bar">
      <button type="button" class="range-btn" data-months="60">5年</button>
      <button type="button" class="range-btn" data-months="120">10年</button>
      <button type="button" class="range-btn" data-months="240">20年</button>
      <button type="button" class="range-btn" data-months="all">全期間</button>
      <span class="range-divider"></span>
      <input type="number" class="range-custom" min="1" step="1" aria-label="期間の長さ">
      <select class="range-unit" aria-label="期間の単位"><option value="12">年</option><option value="1">ヶ月</option></select>
    </div>
    <div class="main-chart"><canvas id="main-chart" role="img" aria-label="指数の推移"></canvas></div>
    <div class="navigator">
      <div class="nav-track" id="nav-track">
        <canvas id="nav-chart"></canvas>
        <div class="nav-shade" id="shade-l"></div><div class="nav-shade" id="shade-r"></div>
        <div class="nav-window" id="nav-window"><div class="nav-handle left" data-edge="l"></div><div class="nav-handle right" data-edge="r"></div></div>
      </div>
      <div class="nav-labels" id="nav-labels"></div>
    </div>
  </div>`;
}

const baseYearLine = {
  id: "baseYearLine",
  afterDatasetsDraw(chart, _args, opts) {
    const i = chart.data.labels.indexOf(opts.label);
    if (i < 0) return;
    const x = chart.scales.x.getPixelForValue(i);
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = opts.color;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = opts.color;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`基準年 ${opts.year}`, x, top + 10);
    ctx.restore();
  },
};

function mountChart(n) {
  const lo = n.start;
  const hi = latestIdx;
  const all = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
  const labels = all.map((i) => monthLabel(i).text);
  const vals = all.map((i) => value(n, i));
  const baseLabel = `${data.meta.base_year}年1月`;
  let range = [Math.max(lo, hi - 119), hi];

  mainChart = new Chart(document.getElementById("main-chart"), {
    type: "line",
    data: { labels: [], datasets: [{ data: [], borderColor: css("--line"), borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, spanGaps: false, tension: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `指数 ${fmtIndex(c.raw)}` } },
        baseYearLine: { label: baseLabel, year: data.meta.base_year, color: css("--accent") },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: css("--muted"), maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
        y: { grid: { color: css("--grid") }, ticks: { color: css("--muted") } },
      },
    },
    plugins: [baseYearLine],
  });

  navChart = new Chart(document.getElementById("nav-chart"), {
    type: "line",
    data: { labels, datasets: [{ data: vals, borderColor: css("--muted"), borderWidth: 1, pointRadius: 0, fill: false }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      events: [],
      layout: { padding: 0 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
    },
  });

  const pct = (i) => ((i - lo) / Math.max(1, hi - lo)) * 100;
  document.getElementById("nav-labels").innerHTML = all
    .filter((i) => monthLabel(i).m === 1 && monthLabel(i).y % 10 === 0)
    .map((i) => `<span style="left:${pct(i)}%">${monthLabel(i).y}</span>`)
    .join("");

  const buttons = [...document.querySelectorAll(".range-btn")];
  const custom = document.querySelector(".range-custom");
  const unit = document.querySelector(".range-unit");

  function apply(activeKey) {
    const [a, b] = range;
    mainChart.data.labels = labels.slice(a - lo, b - lo + 1);
    mainChart.data.datasets[0].data = vals.slice(a - lo, b - lo + 1);
    mainChart.update("none");
    const w = document.getElementById("nav-window");
    w.style.left = `${pct(a)}%`;
    w.style.width = `${pct(b) - pct(a)}%`;
    document.getElementById("shade-l").style.cssText = `left:0;width:${pct(a)}%`;
    document.getElementById("shade-r").style.cssText = `left:${pct(b)}%;right:0`;
    buttons.forEach((btn) => btn.classList.toggle("active", btn.dataset.months === activeKey));
  }

  function setLast(months, key) {
    range = months === "all" ? [lo, hi] : [Math.max(lo, hi - months + 1), hi];
    apply(key);
  }

  buttons.forEach((btn) => btn.addEventListener("click", () => {
    custom.value = "";
    setLast(btn.dataset.months === "all" ? "all" : Number(btn.dataset.months), btn.dataset.months);
  }));
  const onCustom = () => {
    const v = Math.floor(Number(custom.value));
    if (v >= 1) setLast(v * Number(unit.value), null);
  };
  custom.addEventListener("input", onCustom);
  unit.addEventListener("change", onCustom);

  // ナビゲーターのドラッグ（窓の移動・左右の端の伸縮）
  const track = document.getElementById("nav-track");
  const toIndex = (clientX) => {
    const r = track.getBoundingClientRect();
    return Math.round(lo + ((clientX - r.left) / r.width) * (hi - lo));
  };
  const MIN_SPAN = 12;
  track.addEventListener("pointerdown", (e) => {
    const edge = e.target.dataset.edge;
    const onWindow = e.target.id === "nav-window";
    const startIdx = toIndex(e.clientX);
    const [a0, b0] = range;
    if (!edge && !onWindow) {
      const span = b0 - a0;
      const mid = Math.min(Math.max(startIdx, lo + span / 2), hi - span / 2);
      range = [Math.round(mid - span / 2), Math.round(mid - span / 2) + span];
      apply(null);
    }
    track.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const d = toIndex(ev.clientX) - startIdx;
      if (edge === "l") range = [Math.min(Math.max(lo, a0 + d), b0 - MIN_SPAN), b0];
      else if (edge === "r") range = [a0, Math.max(Math.min(hi, b0 + d), a0 + MIN_SPAN)];
      else if (onWindow) {
        const span = b0 - a0;
        const a = Math.min(Math.max(lo, a0 + d), hi - span);
        range = [a, a + span];
      }
      custom.value = "";
      apply(null);
    };
    const up = () => { track.removeEventListener("pointermove", move); track.removeEventListener("pointerup", up); };
    track.addEventListener("pointermove", move);
    track.addEventListener("pointerup", up);
  });

  setLast(120, "120");
}

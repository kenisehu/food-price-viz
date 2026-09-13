const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const fmtMonth = (ym) => `${ym.slice(0, 4)}年${Number(ym.slice(4))}月`;
const signed = (v, digits = 1) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(digits)}`);
const RANK_UP = 15;
const RANK_DOWN = 10;

let data, byCode, children, state;
const charts = {};

fetch("data/cpi_food.json")
  .then((r) => r.json())
  .then((json) => {
    data = json;
    byCode = Object.fromEntries(data.nodes.map((n) => [n.code, n]));
    children = {};
    for (const n of data.nodes) (children[n.parent] ??= []).push(n);
    state = {
      month: data.meta.contrib_months.at(-1),
      rank: "contrib",
      open: new Set(),
      selected: "0002",
      query: "",
    };
    setupChartDefaults();
    renderHeader();
    renderTiles();
    setupControls();
    renderMonthViews();
    renderTrend();
    renderTable();
    renderDetail();
    renderChecks();
  });

function setupChartDefaults() {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = css("--muted");
  Chart.defaults.borderColor = css("--grid");
}

function renderHeader() {
  const m = data.meta;
  document.getElementById("asof").textContent =
    `最新：${fmtMonth(m.latest_month)}分（${m.base_year}年基準）・データ作成 ${m.built_at}`;
}

function contrib(code, month = state.month) {
  return data.contributions[month]?.[code];
}

function yoyAt(code, month) {
  const t = data.trend[code];
  if (!t?.yoy) return null;
  const i = data.meta.trend_months.indexOf(month);
  return i < 0 ? null : t.yoy[i];
}

function renderTiles() {
  const latest = data.meta.latest_month;
  const all = yoyAt("0001", latest);
  const food = yoyAt("0002", latest);
  const core = yoyAt("0172", latest);
  const foodToAll = contrib("0002", latest)?.all_pt;
  const share = all ? (foodToAll / all) * 100 : null;
  const tiles = [
    { label: "食料の前年同月比", value: `${signed(food)}%`, sub: fmtMonth(latest), hero: true },
    { label: "総合（すべての品目）", value: `${signed(all)}%`, sub: "前年同月比" },
    { label: "生鮮食品を除く食料", value: `${signed(core)}%`, sub: "天候で振れやすい生鮮品を除く" },
    {
      label: "物価上昇のうち食料の分",
      value: `${signed(foodToAll, 2)}pt`,
      sub: share != null ? `総合${signed(all)}%のうち約${Math.round(share)}%が食料` : "",
    },
  ];
  document.getElementById("tiles").innerHTML = tiles
    .map(
      (t) => `<div class="tile${t.hero ? " hero" : ""}"><div class="label">${t.label}</div>` +
        `<div class="value">${t.value}</div><div class="sub">${t.sub}</div></div>`,
    )
    .join("");
}

function setupControls() {
  const sel = document.getElementById("month");
  sel.innerHTML = data.meta.contrib_months
    .slice()
    .reverse()
    .map((m) => `<option value="${m}">${fmtMonth(m)}</option>`)
    .join("");
  sel.value = state.month;
  sel.addEventListener("change", () => {
    state.month = sel.value;
    renderMonthViews();
    renderTable();
  });
  document.querySelectorAll(".seg button").forEach((b) =>
    b.addEventListener("click", () => {
      state.rank = b.dataset.rank;
      document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      renderRanking();
    }),
  );
  document.getElementById("search").addEventListener("input", (e) => {
    state.query = e.target.value.trim();
    renderTable();
  });
}

function renderMonthViews() {
  renderMid();
  renderRanking();
}

function barColors(values) {
  return values.map((v) => (v >= 0 ? css("--up") : css("--down")));
}

function hbar(id, wrapId, labels, values, { unit, digits, tooltipExtra }) {
  document.getElementById(wrapId).style.height = `${labels.length * 26 + 40}px`;
  charts[id]?.destroy();
  const max = Math.max(...values.map((v) => Math.abs(v)), 0.01);
  charts[id] = new Chart(document.getElementById(id), {
    type: "bar",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: barColors(values), borderRadius: 4, borderSkipped: false, barThickness: 16 }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => `${signed(c.raw, digits)}${unit}`,
            afterLabel: (c) => tooltipExtra?.(c.dataIndex) ?? "",
          },
        },
      },
      scales: {
        x: {
          suggestedMin: values.some((v) => v < 0) ? -max : 0,
          suggestedMax: values.some((v) => v > 0) ? max : 0,
          grid: { color: css("--grid") },
          border: { display: false },
          ticks: { maxTicksLimit: 6, callback: (v) => signed(Number(v), max < 0.5 ? 2 : max < 5 ? 1 : 0) },
        },
        y: {
          grid: { display: false },
          border: { color: css("--axis") },
          ticks: { color: css("--ink-2"), autoSkip: false },
        },
      },
    },
  });
}

function renderMid() {
  const mids = children["0002"].filter((n) => contrib(n.code));
  const values = mids.map((n) => contrib(n.code).food_pt);
  hbar("mid-chart", "mid-wrap", mids.map((n) => n.name), values, {
    unit: "pt",
    digits: 2,
    tooltipExtra: (i) => `前年同月比 ${signed(yoyAt(mids[i].code, state.month))}%`,
  });
}

function itemRows() {
  return data.nodes
    .filter((n) => n.is_item && contrib(n.code))
    .map((n) => ({ ...n, c: contrib(n.code).food_pt, y: yoyAt(n.code, state.month) }));
}

function renderRanking() {
  const rows = itemRows();
  const key = state.rank === "contrib" ? "c" : "y";
  const valid = rows.filter((r) => r[key] != null);
  const up = valid.filter((r) => r[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, RANK_UP);
  const down = valid.filter((r) => r[key] < 0).sort((a, b) => a[key] - b[key]).slice(0, RANK_DOWN);
  const label = (r) => `${r.name}${r.approx ? "※" : ""}`;
  const opts =
    state.rank === "contrib"
      ? { unit: "pt", digits: 3, tooltipExtra: null }
      : { unit: "%", digits: 1, tooltipExtra: null };
  const extra = (list) => (i) =>
    state.rank === "contrib"
      ? `前年同月比 ${signed(list[i].y)}%`
      : `寄与度 ${signed(list[i].c, 3)}pt・食料内の重み ${list[i].weight_per_10000_food}`;
  hbar("up-chart", "up-wrap", up.map(label), up.map((r) => r[key]), { ...opts, tooltipExtra: extra(up) });
  hbar("down-chart", "down-wrap", down.map(label), down.map((r) => r[key]), { ...opts, tooltipExtra: extra(down) });

  document.getElementById("rank-note").textContent =
    state.rank === "contrib"
      ? `${fmtMonth(state.month)}の食料全体の前年同月比（${signed(yoyAt("0002", state.month))}%）への寄与度。重みの大きい品目ほど上位に来ます。`
      : `${fmtMonth(state.month)}の前年同月比。重みを無視した並びなので、家計への影響の大きさとは一致しません。寄与度の並びと見比べてください。`;

  const outliers = rows.filter((r) => r.y != null && Math.abs(r.y) >= 50);
  const box = document.getElementById("outliers");
  box.hidden = outliers.length === 0;
  box.innerHTML = outliers.length
    ? `<strong>前年から±50%以上動いた品目：</strong>${outliers
        .map((r) => `${r.name}（${signed(r.y)}%、寄与度 ${signed(r.c, 3)}pt）`)
        .join("、")}。<br>価格の変化ではなく、無償化などの制度変更で指数が動いている可能性があります。原典の注記を確認してください。`
    : "";
}

function renderTrend() {
  const months = data.meta.trend_months;
  const series = [
    { code: "0002", name: "食料", color: css("--food"), dash: [] },
    { code: "0172", name: "生鮮食品を除く食料", color: css("--core"), dash: [5, 4] },
    { code: "0001", name: "総合", color: css("--all"), dash: [] },
  ];
  document.getElementById("trend-legend").innerHTML = series
    .map((s) => `<span><i class="${s.dash.length ? "dash" : ""}" style="border-color:${s.color}"></i>${s.name}</span>`)
    .join("");
  new Chart(document.getElementById("trend-chart"), {
    type: "line",
    data: {
      labels: months,
      datasets: series.map((s) => ({
        label: s.name,
        data: data.trend[s.code].yoy,
        borderColor: s.color,
        borderDash: s.dash,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        spanGaps: true,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (c) => fmtMonth(c[0].label),
            label: (c) => `${c.dataset.label} ${signed(c.raw)}%`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: css("--axis") },
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            callback: (v, i) => (months[i].endsWith("01") ? months[i].slice(0, 4) : ""),
          },
        },
        y: {
          grid: { color: css("--grid") },
          border: { display: false },
          ticks: { callback: (v) => `${v}%` },
        },
      },
    },
  });
}

function visibleRows() {
  if (state.query) {
    return data.nodes.filter((n) => n.name.includes(state.query)).map((n) => ({ n, depth: 0 }));
  }
  const out = [];
  const walk = (parent) => {
    for (const n of children[parent] ?? []) {
      out.push({ n, depth: n.depth });
      if (!n.is_item && state.open.has(n.code)) walk(n.code);
    }
  };
  out.push({ n: byCode["0002"], depth: 0 });
  walk("0002");
  return out;
}

function renderTable() {
  const tbody = document.querySelector("#table tbody");
  tbody.innerHTML = visibleRows()
    .map(({ n, depth }) => {
      const c = contrib(n.code)?.food_pt;
      const y = yoyAt(n.code, state.month);
      const caret = n.is_item || n.code === "0002" || state.query ? "" : state.open.has(n.code) ? "▼" : "▶";
      const path = state.query && n.parent ? `<span class="approx">（${byCode[n.parent]?.name ?? ""}）</span>` : "";
      return `<tr data-code="${n.code}" class="${n.is_item ? "item" : "group"}${n.code === state.selected ? " selected" : ""}">
        <td style="padding-left:${12 + depth * 18}px"><span class="caret">${caret}</span>${n.name}${n.approx ? '<span class="approx">※</span>' : ""}${path}</td>
        <td class="num">${n.weight_per_10000_food.toLocaleString()}</td>
        <td class="num">${n.index != null ? n.index.toFixed(1) : "—"}</td>
        <td class="num ${y > 0 ? "pos" : y < 0 ? "neg" : ""}">${y != null ? signed(y) + "%" : "—"}</td>
        <td class="num ${c > 0 ? "pos" : c < 0 ? "neg" : ""}">${c != null ? signed(c, 3) : "—"}</td>
      </tr>`;
    })
    .join("");
  tbody.querySelectorAll("tr").forEach((tr) =>
    tr.addEventListener("click", (e) => {
      const code = tr.dataset.code;
      const n = byCode[code];
      if (!n.is_item && code !== "0002" && !state.query && e.target.closest(".caret, td:first-child")) {
        state.open.has(code) ? state.open.delete(code) : state.open.add(code);
      }
      state.selected = code;
      renderTable();
      renderDetail();
    }),
  );
}

function renderDetail() {
  const n = byCode[state.selected];
  const months = data.meta.trend_months;
  const idx = data.trend[n.code]?.index ?? [];
  document.getElementById("detail-title").textContent =
    `${n.name}：指数の推移（2025年=100）・最新 ${n.index?.toFixed(1) ?? "—"}、前年同月比 ${signed(yoyAt(n.code, data.meta.latest_month))}%`;
  charts.detail?.destroy();
  charts.detail = new Chart(document.getElementById("detail-chart"), {
    type: "line",
    data: {
      labels: months,
      datasets: [
        {
          data: idx,
          borderColor: css("--food"),
          backgroundColor: css("--food") + "1a",
          fill: true,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: (c) => fmtMonth(c[0].label), label: (c) => `指数 ${c.raw?.toFixed(1)}` } },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: css("--axis") },
          ticks: { autoSkip: false, maxRotation: 0, callback: (v, i) => (months[i].endsWith("01") ? months[i].slice(0, 4) : "") },
        },
        y: { grid: { color: css("--grid") }, border: { display: false } },
      },
    },
  });
}

function renderChecks() {
  document.querySelector("#checks tbody").innerHTML = data.meta.checks
    .map(
      (c) => `<tr><td>${fmtMonth(c.month)}</td><td class="num">${signed(c.food_yoy_official)}%</td>` +
        `<td class="num">${signed(c.food_yoy_calc, 3)}%</td><td class="num">${signed(c.sum_mid_contrib, 3)}pt</td>` +
        `<td class="num">${signed(c.sum_item_contrib, 3)}pt</td></tr>`,
    )
    .join("");
}

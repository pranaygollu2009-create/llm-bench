import { evaluate, SUITES } from "./tasks.js";

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

const state = { suites: [], suiteId: null, models: new Set(), sampled: new Set(), selected: new Set(), custom: [], running: false };

/* ---------- status + setup card ---------- */
async function init() {
  const status = await fetch("/api/status").then((r) => r.json());
  state.suites = status.suites;
  renderSuites();
  renderRubric();
  renderGradeTasks();

  const list = await fetch("/api/models").then((r) => r.json()).catch(() => ({ models: [], source: "none" }));
  state.models = new Set(list.models);
  state.sampled = new Set(list.sampled || []);
  const hint = $("#model-hint");
  if (hint) {
    if (list.source === "api") {
      hint.textContent = "🔑 Real-LLM mode active — benching live models (e.g. Opus, Astra) uses your API credits; the 3 sample models stay free.";
      hint.style.color = "var(--accent)";
    } else hint.textContent = "No API key — real-LLM comparison is off. The 3 sample models below are free; add a key in .env to bench live models like Opus and Astra.";
  }
  $("#run-status").textContent =
    list.source === "api" ? "Real LLM list loaded + free samples — pick any models to compare." :
    list.source === "default" ? "API unreachable — common model IDs listed; type exact IDs (e.g. Opus, Astra) below, or use the free samples." :
    list.models.length ? list.models.length + " built-in sample models ready — free, runs offline." :
    "Could not load models.";
  renderModels();

  if (!state.selected.size) {
    const defaults = list.sampled && list.sampled.length ? list.sampled : list.models.slice(0, 1);
    defaults.forEach((m) => state.selected.add(m));
    renderModels();
  }

  $("#model-select")?.addEventListener("change", onModelSelectChange);
}

/* ---------- suites ---------- */
function renderSuites() {
  $("#suite-list").innerHTML = state.suites
    .map(
      (s) => `<button class="suite-item ${s.id === state.suiteId ? "selected" : ""}" data-suite="${esc(s.id)}">
        <b>${esc(s.name)}</b><span>${esc(s.blurb)}</span></button>`
    )
    .join("");
  $("#suite-list").querySelectorAll("[data-suite]").forEach((b) =>
    b.addEventListener("click", () => {
      state.suiteId = b.dataset.suite;
      renderSuites();
      refreshRunState();
    })
  );
  if (!state.suiteId && state.suites.length) state.suiteId = state.suites[0].id;
  renderSuitesActive();
}

function renderSuitesActive() {
  $("#suite-list").querySelectorAll("[data-suite]").forEach((b) =>
    b.classList.toggle("selected", b.dataset.suite === state.suiteId));
}

/* ---------- models ---------- */
function renderModels() {
  /* dropdown: everything not already selected, grouped (free samples / live / custom) */
  const customs = state.custom.filter((m) => !state.models.has(m));
  const unselected = (m) => !state.selected.has(m);
  const opt = (m) => `<option value="${esc(m)}">${esc(m)}</option>`;
  const samples = state.sampled ? [...state.models].filter((m) => state.sampled.has(m)) : [...state.models];
  const live = state.sampled ? [...state.models].filter((m) => !state.sampled.has(m)).sort() : [];
  const groups = [];
  if (live.length && live.some(unselected)) groups.push(`<optgroup label="Live models (free tier: pick ids ending in :free)">${live.filter(unselected).map(opt).join("")}</optgroup>`);
  if (samples.some(unselected)) groups.push(`<optgroup label="Free built-in samples">${samples.filter(unselected).map(opt).join("")}</optgroup>`);
  if (customs.some(unselected)) groups.push(`<optgroup label="Custom">${customs.filter(unselected).map(opt).join("")}</optgroup>`);
  const sel = $("#model-select");
  if (sel) sel.innerHTML =
    `<option value="">— pick a model to add —</option>` + groups.join("") +
    (!groups.length ? `<option value="" disabled>all listed models are already selected</option>` : "");

  /* chips: only the picked models (click to remove) */
  const picked = [...state.selected];
  const chip = (m, custom = false) => `<button class="model-chip selected" data-model="${esc(m)}" ${custom ? "data-custom" : ""}><span class="dot"></span>${esc(m)}${custom ? " <small style='color:var(--muted)'>(custom)</small>" : ""} ✕</button>`;
  const pickedCustoms = customs.filter((m) => state.selected.has(m));
  $("#model-list").innerHTML =
    picked.filter((m) => !pickedCustoms.includes(m)).map((m) => chip(m)).join("") +
    pickedCustoms.map((m) => chip(m, true)).join("");
  $("picked-label")?.classList.toggle("show", picked.length > 0);
  $("#model-list").querySelectorAll("[data-model]").forEach((b) =>
    b.addEventListener("click", () => {
      const m = b.dataset.model;
      if (state.selected.has(m)) state.selected.delete(m); else state.selected.add(m);
      renderModels();
      refreshRunState();
    })
  );
  refreshRunState();
}

function onModelSelectChange() {
  const m = $("#model-select").value;
  if (!m) return;
  state.selected.add(m);
  renderModels();
  refreshRunState();
}

function refreshRunState() {
  $("#run-btn").disabled = !(state.suiteId && state.selected.size) || state.running;
}

/* ---------- run ---------- */
$("#add-model").addEventListener("click", () => {
  const v = $("#custom-model").value.trim();
  if (!v) return;
  if (!state.custom.includes(v)) state.custom.push(v);
  state.selected.add(v);
  $("#custom-model").value = "";
  renderModels();
});

$("#run-btn").addEventListener("click", async () => {
  state.running = true;
  refreshRunState();
  $("#run-status").textContent = "Running — same prompt to every model, then one judge script…";
  try {
    const body = { suiteId: state.suiteId, modelIds: [...state.selected] };
    const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      $("#run-status").textContent = err.error ? "Error: " + err.error : `Error ${res.status}`;
      return;
    }
    const data = await res.json();
    renderResults(data);
    $("#run-status").textContent = data.realCalls ?
      `Done — ${data.realCalls} real API call(s) billed to your key; sample models were free.` :
      "Done — free sample run.";
  } catch (e) {
    $("#run-status").textContent = "Network error: " + e.message;
  } finally {
    state.running = false;
    refreshRunState();
  }
});

const band = (p) => (p >= 80 ? "good" : p >= 50 ? "mid" : p >= 20 ? "bad" : "bad");
const bandClass = (p) => (p >= 80 ? "good" : p >= 50 ? "mid" : "bad");

const scoreChip = (pct, n) =>
  `<span class="cell-score ${bandClass(pct)}">${n}</span>`;

function renderResults({ suite, rows, summary }) {
  $("#summary-wrap").classList.remove("hidden");
  $("#task-wrap").classList.remove("hidden");

  $("#summary").innerHTML = Object.entries(summary)
    .map(([model, s]) => {
      const err = s.errors > 0;
      const sub = [
        s.tokens != null ? `~${s.tokens} tok/run · ${(s.latency / 1000).toFixed(1)}s avg` : `${(s.latency / 1000).toFixed(1)}s avg`,
        `checks ${s.critPassed}/${s.critTotal}`,
        s.errors ? `${s.errors} failed run(s)` : "all runs OK",
      ].join(" · ");
      return `<div class="model-card ${err ? "err" : ""}">
        <div class="name">${esc(model)}</div>
        <div class="score ${err ? "bad" : bandClass(s.score)}">${err ? "—" : s.score + "%"}</div>
        <div class="bar"><div class="b-${err ? "bad" : bandClass(s.score)}" style="width:${err ? 4 : s.score}%;"></div></div>
        <div class="sub">${esc(sub)}</div>
      </div>`;
    })
    .join("");

  $("#task-list").innerHTML = rows
    .map(
      (row) => `
      <details class="task">
        <summary class="task-head">
          <b>${esc(row.title)}</b>
          <span class="prompt-preview">${esc(row.prompt)}</span>
          ${scoreChip(0, row.cells.filter((c) => !c.error && c.pct === 100).length + "/" + row.cells.length + " full marks")}
        </summary>
        <div style="padding: 8px 10px;">
          ${row.cells
            .map(
              (cell) => `
              <div class="cell">
                <div class="cell-top">
                  <span class="cell-model">${esc(cell.model)}</span>
                  ${cell.error ? "" : scoreChip(cell.pct, cell.got + "/" + cell.maxW)}
                  <span class="cell-meta">${
                    cell.error
                      ? "failed"
                      : `${(cell.latencyMs / 1000).toFixed(1)}s${cell.tokens ? " · " + cell.tokens + " tok" : ""}`
                  }</span>
                </div>
                ${
                  cell.error
                    ? `<div class="cell-error">${esc(cell.error)}</div>`
                    : `<div class="output">${esc(cell.output.trim() || "(empty response)")}</div>
                      <div class="crit">${cell.criteria
                        .map(
                          (c) => `<span class="crit-chip ${c.pass ? "pass" : "fail"}">
                            <small>${c.pass ? "✓" : "✗"}</small> ${esc(c.label)}</span>`
                        )
                        .join("")}</div>`
                }
              </div>`
            )
            .join("")}
        </div>
      </details>`
    )
    .join("");
}

/* ---------- rubric ---------- */
function renderRubric() {
  $("#rubric").innerHTML = state.suites
    .map(
      (s) => `<div><b>${esc(s.name)}</b>
        <div class="ref-crit">${esc(s.blurb)}</div>
        ${s.tasks
          .map(
            (t) => `<div class="ref-task" style="margin-top:6px;">${esc(t.title)}
              <div class="ref-crit">Prompt: <em>${esc(t.prompt)}</em></div>
              ${t.criteria
                .map((c) => `<div class="ref-crit">• ${esc(c.label)} <span class="weight">+${c.weight} pts</span></div>`)
                .join("")}
            </div>`
          )
          .join("")}
      </div>`
    )
    .join("");
}

/* ---------- paste-and-grade: Opus vs anybody, free ---------- */
function renderGradeTasks() {
  $("#grade-task").innerHTML = state.suites
    .map(
      (s) => `<optgroup label="${esc(s.name)}">` +
        s.tasks.map((t) => `<option value="${esc(t.id)}">${esc(t.title)}</option>`).join("") +
        `</optgroup>`
    )
    .join("");
}

$("#grade-btn").addEventListener("click", () => {
  const task = SUITES.flatMap((s) => s.tasks).find((t) => t.id === $("#grade-task").value); // full rules, not the public /api/status copy
  if (!task) return;
  const max = task.criteria.reduce((s, c) => s + c.weight, 0);
  const sides = ["a", "b"].map((k) => {
    const name = $(`#grade-name-${k}`).value.trim() || `Answer ${k.toUpperCase()}`;
    const text = $(`#grade-in-${k}`).value;
    const crits = text.trim()
      ? evaluate(text, task.criteria)
      : task.criteria.map((c) => ({ label: c.label, weight: c.weight, pass: false, found: "", expected: "(no answer pasted)" }));
    const got = crits.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
    return { name, crits, max, got, pct: max ? Math.round((got / max) * 100) : 0 };
  });
  const hi = Math.max(sides[0].pct, sides[1].pct);
  const tie = sides[0].pct === sides[1].pct;
  $("#grade-out").classList.remove("hidden");
  $("#grade-out").innerHTML =
    sides
      .map(
        (side) => `
      <div class="grade-cell ${!tie && side.pct === hi ? "win" : ""}">
        <div class="grade-cell-head">
          <b>${esc(side.name)}</b>
          <span>${side.got}/${side.max} pts · ${side.pct}%</span>
        </div>
        ${!tie && side.pct === hi ? `<div class="grade-winner">🏆 higher score on this task</div>` : ""}
        <div class="crit">${side.crits
          .map(
            (c) => `<span class="crit-chip ${c.pass ? "pass" : "fail"}" title="${esc(c.expected || "")}">
              <small>${c.pass ? "✓" : "✗"}</small> ${esc(c.label)} <em>+${c.weight}</em></span>`
          )
          .join("")}</div>
      </div>`
      )
      .join("") + (tie ? `<div class="grade-note">Dead heat — both scored ${sides[0].pct}% on this task's checklist.</div>` : "");
});

init();

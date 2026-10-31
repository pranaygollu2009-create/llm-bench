import express from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { evaluate, SUITES } from "./tasks.js";

/* LLM Bench is free/offline by default — built-in sample models scored locally.
   Optional: with an API key in .env, real LLMs (e.g. Opus, Astra) can be benched
   alongside the samples; real calls go to the provider with your key, at your cost. */
for (const p of ["../.env", "./.env"]) {
  try {
    for (const line of readFileSync(new URL(p, import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* .env absent — free mode only */ }
}

const BASE_URL = (process.env.LLM_BASE_URL || "https://freebuff.com/api/v1/paid").replace(/\/+$/, "");
// placeholder .env values are ignored — only a real key unlocks real-LLM runs
const KEY = (process.env.OPENAI_API_KEY || "").includes("your-key-here") ? "" : process.env.OPENAI_API_KEY || "";
const DEFAULT_MODELS = [
  "gpt-4o-mini", "gpt-4o", "gpt-4.1",
  "claude-3-5-haiku-latest", "claude-sonnet-4",
  "deepseek-chat", "gemini-2.5-flash",
];

const app = express();
app.use(express.json({ limit: "64kb" }));
app.use(express.static(dirname(fileURLToPath(import.meta.url))));

app.get("/api/status", (_req, res) =>
  res.json({ suites: SUITES.map(({ id, name, blurb, tasks }) => ({
    id, name, blurb,
    tasks: tasks.map((t) => ({
      id: t.id, title: t.title, prompt: t.prompt,
      criteria: t.criteria.map(({ label, weight, expectedLabel }) => ({ label, weight })),
    })),
  })) }));

app.get("/api/models", async (_req, res) => {
  if (!KEY) return res.json({ models: SAMPLE_MODELS, source: "built-in" });
  let live = [];
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(`${BASE_URL}/models`, { headers: { Authorization: `Bearer ${KEY}` }, signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`models ${r.status}`);
    const data = await r.json();
    live = (data.data || data).map((m) => m.id || m.model || m.name).filter(Boolean);
  } catch { /* fall through to defaults */ }
  const list = live.length
    ? [...new Set([...live, ...DEFAULT_MODELS, ...SAMPLE_MODELS])]
    : [...new Set([...DEFAULT_MODELS, ...SAMPLE_MODELS])];
  res.json({ models: list, source: live.length ? "api" : "default", sampled: SAMPLE_MODELS });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callModel(model, prompt) {
  // free-tier shared pools rate-limit hard (429/503) — retry briefly before giving an honest error
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(2500 * attempt);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 90000);
    const started = Date.now();
    try {
      const r = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model, temperature: 0, max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
        signal: ctl.signal,
      });
      const latencyMs = Date.now() - started;
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        lastError = `HTTP ${r.status}: ${body.slice(0, 180)}`;
        if (r.status === 429 || r.status === 502 || r.status === 503) continue; // retryable
        throw new Error(lastError);
      }
      const data = await r.json();
      const choice = (data.choices || [])[0] || {};
      if (!choice.message?.content) {
        // some upstream 429s arrive as 200 with an error body and no choices
        const flare = data.error?.message ? `provider: ${JSON.stringify(data.error.message).slice(0, 160)}` : "empty response";
        lastError = flare;
        continue;
      }
      return { output: choice.message.content, latencyMs, tokens: data.usage?.total_tokens ?? null };
    } catch (e) {
      lastError = String(e?.cause?.message || e.message || e).slice(0, 240);
    } finally {
      clearTimeout(timer);
    }
  }
  return { error: lastError || "failed after retries" };
}

/* built-in sample models with canned answers — scored by the exact same engine */
const SAMPLE_MODELS = ["Model A (precise)", "Model B (wordy)", "Model C (careless)"];
const SAMPLE_OUTPUTS = {
  "strict-mult": {
    "Model A (precise)": "391",
    "Model B (wordy)": "Sure! 17 multiplied by 23 equals 391.",
    "Model C (careless)": "397",
  },
  "strict-batball": {
    "Model A (precise)": "0.05",
    "Model B (wordy)": "This is a classic riddle. The intuitive answer is $0.10, but the correct amount is 0.05.",
    "Model C (careless)": "0.10",
  },
  "strict-rate": {
    "Model A (precise)": "30",
    "Model B (wordy)": "The factory makes 30 cars every hour.",
    "Model C (careless)": "24",
  },
  "fmt-sentence": {
    "Model A (precise)": "Waves carve the shore beneath a silver moon.",
    "Model B (wordy)": "The ocean is vast. Salt water covers most of the world.",
    "Model C (careless)": "Waves crash loudly on rocky shores at dusk.",
  },
  "fmt-json": {
    "Model A (precise)": '{"color":"teal","number":7}',
    "Model B (wordy)": 'Here is your JSON: {"color":"teal","number":7}',
    "Model C (careless)": '{"color":"red"}',
  },
  "fmt-primes": {
    "Model A (precise)": "2, 3, 5, 7, 11",
    "Model B (wordy)": "The first five prime numbers are 2, 3, 5, 7, 11.",
    "Model C (careless)": "2, 3, 5, 7, 9",
  },
  "write-entropy": {
    "Model A (precise)": "A measure of disorder in any system",
    "Model B (wordy)": "Entropy measures disorder, randomness, and how energy spreads out.",
    "Model C (careless)": "Chaos stuff",
  },
  "write-lighthouse": {
    "Model A (precise)": "A tall man sat gloomy upon misty rock at nightfall watching six ships sail past",
    "Model B (wordy)": "A keeper climbed his tower every night, sweeping its lamp along the rocky shore.",
    "Model C (careless)": "There was a light. Boats saw it. It was very foggy out.",
  },
  "write-sky": {
    "Model A (precise)": "The air scatters sunlight. The blue light dominates our view.",
    "Model B (wordy)": "The sky looks blue because of Rayleigh scattering: short blue wavelengths scatter far more strongly than red ones, so more blue light reaches our eyes from every direction of the sky at once.",
    "Model C (careless)": "It just is blue. Air does that thing with light.",
  },
};

app.post("/api/run", async (req, res) => {
  const suite = SUITES.find((s) => s.id === req.body?.suiteId);
  let modelIds = (Array.isArray(req.body?.modelIds) ? req.body.modelIds : [])
    .map(String).map((m) => m.trim()).filter(Boolean).slice(0, 6);
  if (!suite) return res.status(400).json({ error: "bad-suite" });
  const isSample = (m) => SAMPLE_MODELS.includes(m);
  if (!KEY) {
    modelIds = modelIds.filter(isSample);
    if (!modelIds.length) modelIds = [...SAMPLE_MODELS];
  } else if (!modelIds.length) {
    return res.status(400).json({ error: "no-models" });
  }

  let realCalls = 0;
  const rows = [];
  for (const task of suite.tasks) {
    const cells = await Promise.all(modelIds.map(async (model) => {
      const src = KEY && !isSample(model)
        ? (realCalls++, await callModel(model, task.prompt))
        : {
            output: SAMPLE_OUTPUTS[task.id]?.[model] ?? "(sample output missing for this task)",
            latencyMs: 120 + (model.length * 37) % 800,
            tokens: 12 + task.id.length,
          };
      const { output = "", latencyMs = 0, tokens = null, error } = src;
      const criteria = output ? evaluate(output, task.criteria) : [];
      const maxW = task.criteria.reduce((s, c) => s + c.weight, 0);
      const got = criteria.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
      return { model, output, latencyMs, tokens: tokens ?? null, error, criteria, maxW, got,
               pct: maxW ? Math.round((got / maxW) * 100) : 0 };
    }));
    rows.push({ taskId: task.id, title: task.title, prompt: task.prompt, cells });
  }

  const summary = {};
  for (const model of modelIds) {
    const mine = rows.map((r) => r.cells.find((c) => c.model === model));
    const ok = mine.filter((c) => !c.error);
    const critAll = ok.flatMap((c) => c.criteria);
    summary[model] = {
      runs: mine.length,
      errors: mine.length - ok.length,
      score: ok.length ? Math.round(ok.reduce((s, c) => s + c.pct, 0) / ok.length) : 0,
      latency: ok.length ? Math.round(ok.reduce((s, c) => s + c.latencyMs, 0) / ok.length) : 0,
      tokens: ok.length ? Math.round(ok.reduce((s, c) => s + (c.tokens || 0), 0) / ok.length) : null,
      critPassed: critAll.filter((c) => c.pass).length,
      critTotal: critAll.length,
      tasksPassed: ok.filter((c) => c.pct === 100).length,
    };
  }

  res.json({ suite: { id: suite.id, name: suite.name }, rows, summary, realCalls: realCalls || 0 });
});

const PORT = parseInt(process.env.PORT, 10) || 4175; // ignore port 0 and other placeholder values
app.listen(PORT, () => console.log(`LLM Bench on http://localhost:${PORT}`));

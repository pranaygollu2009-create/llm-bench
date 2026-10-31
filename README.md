# 🔬 LLM Bench

An LLM benchmarking tool with a principle most tools skip: **every model is graded by the identical, deterministic checklist — no LLM judge, no vibes.**

Run any models you like on the same tasks. Each response goes through a fixed, hand-weighted rubric that produces a mechanical pass/fail per criterion, so comparisons are apples-to-apples and every score is explainable down to the exact missing word.

## Three ways to use it — all free options included

| Mode | What it does | Cost |
|---|---|---|
| **Built-in samples** | Three canned sample models (precise / wordy / careless) run through the whole engine with zero setup | Free forever, offline |
| **Paste-and-grade** | Copy any two models' replies (Opus vs Astra, ChatGPT vs Gemini — anything you can access) into two boxes; the identical rubric grades both side by side with pass/fail chips and a winner badge | Free forever, no API |
| **Real-LLM mode (optional)** | Add any OpenAI-compatible key (OpenRouter gives one free, no credit card) and the live model list flows in — pick real models, they get the identical prompts, the identical scoring | Free-tier models cost $0; your key, your rate limits |

## How scoring works

1. Every task has a fixed checklist (`tasks.js`) — e.g. Arithmetic: *exact answer `391`*; Bat-and-ball: *gives `0.05`, doesn't repeat the $0.10 intuition trap*; Writing: *exactly N words*, *no letter e*, *a certain regex shape*.
2. Each criterion has a weight. A response's score = the weight of the criteria it passed, as a percent of the total.
3. Nothing is subjective: no second LLM judging the first. Misses are shown as red chips with the exact expected value.
4. Errors are honest — a failed/rate-limited API call shows as an explicit red error cell, never silently as a zero.

## Run it

```bash
node server.js          # plain Node, no dependencies
# → http://localhost:4175
```

## Optional: real-LLM mode

Create `.env` in the project folder:

```
OPENAI_API_KEY=sk-your-key-here
LLM_BASE_URL=https://openrouter.ai/api/v1
```

- Any OpenAI-compatible provider works (OpenRouter, OpenAI, Groq, …).
- No key? The app stays fully usable in free mode and never nags with a setup screen.
- The key is read by the server only; the browser never sees it.

## Files

| File | Role |
|---|---|
| `server.js` | Plain-Node HTTP server: serves the page, runs the benchmark, calls real LLMs only when a key exists, retries rate-limited calls, reports honest error cells |
| `tasks.js` | The three suites (Strict answers · Format discipline · Writing constraints) — prompts, criteria, weights, and the deterministic evaluator |
| `app.js` | Client: suite picker, model dropdown + selected-chips, head-to-head paste-and-grade grader, results rendering |
| `index.html` | Single-page UI, all styles inline — no build step |

Criteria definitions are shared by server and client by importing the same `tasks.js` module, so local grading and server scoring can't drift apart.

*Honest demo, not a certified benchmark: checklists measure what they measure — but they do it identically for every model.*

const norm = (s) =>
  s.toLowerCase().replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");

const wordCount = (s) => norm(s).split(/\s+/).filter(Boolean).length;

const sentenceCount = (s) => (s.match(/[^.!?]+[.!?]/g) || []).length;

/* Deterministic criteria — the exact same rules for every model. */
export function evaluate(output, criteria) {
  const n = norm(output);
  return criteria.map((c) => {
    let pass = false, found = "", expected = "";
    switch (c.type) {
      case "exact":
        pass = n === c.value; expected = String(c.value);
        break;
      case "containsAll": {
        const vals = c.value.split("|").map((v) => v.trim());
        pass = vals.every((v) => n.includes(v));
        found = vals.filter((v) => n.includes(v)).join(", ");
        expected = c.value.replace(/\|/g, " + ");
        break;
      }
      case "containsAny": {
        const vals = c.value.split("|").map((v) => v.trim());
        const hit = vals.find((v) => n.includes(v));
        pass = !!hit; found = hit || ""; expected = c.value.replace(/\|/g, " or ");
        break;
      }
      case "regex":
        pass = new RegExp(c.value, "i").test(n); expected = "matches " + c.value;
        break;
      case "absent":
        pass = !new RegExp(c.value, "i").test(n); expected = "must not contain " + c.value;
        break;
      case "minWords":
        pass = wordCount(output) >= Number(c.value); found = String(wordCount(output)) + " words";
        expected = "≥ " + c.value + " words";
        break;
      case "maxWords":
        pass = wordCount(output) <= Number(c.value); found = String(wordCount(output)) + " words";
        expected = "≤ " + c.value + " words";
        break;
      case "json": {
        const keys = (c.value || "").split("|").filter(Boolean);
        try {
          const obj = JSON.parse(output.trim());
          const got = Object.keys(obj).map((k) => k.toLowerCase());
          pass = keys.every((k) => got.includes(k.toLowerCase()));
          found = keys.filter((k) => got.map((g) => g.toLowerCase()).includes(k.toLowerCase())).join(", ");
          expected = "valid JSON" + (keys.length ? " with keys " + keys.join(", ") : "");
        } catch { pass = false; expected = "valid JSON"; }
        break;
      }
      default:
        pass = false;
    }
    return { label: c.label, weight: c.weight, pass, found, expected };
  });
}

export const SUITES = [
  {
    id: "strict",
    name: "Strict answers",
    blurb: "One unambiguous right answer each — checked by exact match.",
    tasks: [
      {
        id: "strict-mult",
        title: "Arithmetic",
        prompt: "What is 17 × 23? Reply with only the number.",
        criteria: [
          { label: "Exact answer 391", type: "exact", value: "391", weight: 10 },
        ],
      },
      {
        id: "strict-batball",
        title: "Classic riddle (resists the intuitive wrong answer)",
        prompt: "A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Reply with only the amount in dollars (like 0.10).",
        criteria: [
          { label: "Gives 0.05", type: "containsAny", value: "0.05|$.05|5 cents", weight: 10 },
          { label: "Doesn't give 0.10", type: "absent", value: "0\\.10|10 cents", weight: 6 },
        ],
      },
      {
        id: "strict-rate",
        title: "Unit rate",
        prompt: "A factory makes 240 cars in 8 hours. How many cars per hour? Reply with only the number.",
        criteria: [
          { label: "Exact answer 30", type: "exact", value: "30", weight: 10 },
        ],
      },
    ],
  },
  {
    id: "format",
    name: "Format discipline",
    blurb: "Does the model follow the shape of the instruction, not just the content?",
    tasks: [
      {
        id: "fmt-sentence",
        title: "Exactly one sentence, exactly eight words",
        prompt: "Write exactly one sentence about the ocean, exactly eight words long. Output only that sentence.",
        criteria: [
          { label: "Eight words", type: "minWords", value: "8", weight: 8 },
          { label: "At most eight words", type: "maxWords", value: "8", weight: 8 },
          { label: "Exactly one sentence", type: "regex", value: "^[^.!?]+[.!?]?$", weight: 8 },
        ],
      },
      {
        id: "fmt-json",
        title: "Emit valid JSON only",
        prompt: 'Reply with only a JSON object with the keys "color" (any string) and "number" (any integer 1-10).',
        criteria: [
          { label: "Parses as JSON with both keys", type: "json", value: "color|number", weight: 14 },
        ],
      },
      {
        id: "fmt-primes",
        title: "Ordered list, nothing else",
        prompt: "List the first five prime numbers, comma-separated, in order. Reply with only the list.",
        criteria: [
          { label: "Contains all of 2, 3, 5, 7, 11", type: "containsAll", value: "2|3|5|7|11", weight: 8 },
          { label: "In ascending order", type: "regex", value: "\\b2.*\\b3.*\\b5.*\\b7.*\\b11", weight: 8 },
          { label: "Nothing but the list (no extra words)", type: "regex", value: "^\\s*2\\s*,\\s*3\\s*,\\s*5\\s*,\\s*7\\s*,\\s*11\\s*\\.?\\s*$", weight: 8 },
        ],
      },
    ],
  },
  {
    id: "writing",
    name: "Writing constraints",
    blurb: "Harder to fake: length caps and constraint letters, judged mechanically.",
    tasks: [
      {
        id: "write-entropy",
        title: "Definition with a word cap",
        prompt: "Define entropy in at most 20 words, without using any commas. Output only the definition.",
        criteria: [
          { label: "At most 20 words", type: "maxWords", value: "20", weight: 8 },
          { label: "At least 8 words", type: "minWords", value: "8", weight: 4 },
          { label: "No commas", type: "absent", value: ",", weight: 8 },
        ],
      },
      {
        id: "write-lighthouse",
        title: "Lipogram — story with no letter 'e'",
        prompt: "Write a short story (at least 12 words) about a lighthouse keeper without using the letter 'e'. Output only the story.",
        criteria: [
          { label: "No letter e anywhere", type: "absent", value: "e", weight: 12 },
          { label: "At least 12 words", type: "minWords", value: "12", weight: 8 },
        ],
      },
      {
        id: "write-sky",
        title: "Two sentences, both starting with 'The'",
        prompt: "Explain in exactly two sentences why the sky is blue. Begin each sentence with the word The.",
        criteria: [
          { label: "Two sentences", type: "regex", value: "^[^.!?]+[.!?][^.!?]+[.!?]?$", weight: 8 },
          { label: "Each begins with The", type: "regex", value: "^\\s*the\\b[^.!?]*[.!?]\\s*the\\b", weight: 10 },
          { label: "At most 60 words", type: "maxWords", value: "60", weight: 4 },
        ],
      },
    ],
  },
];

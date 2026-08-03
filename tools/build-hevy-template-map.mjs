import { readFile, writeFile } from "node:fs/promises";

const apiKey = process.env.HEVY_API_KEY;
const baseUrl = "https://api.hevyapp.com";
const outputFile = "hevy-template-review.json";

if (!apiKey) {
  console.error("HEVY_API_KEY is required");
  process.exit(1);
}

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { "api-key": apiKey } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Hevy request failed (${response.status})`);
  return payload;
}

async function listTemplates() {
  const templates = [];
  let page = 1;
  let pageCount = 1;
  do {
    const response = await request(`/v1/exercise_templates?page=${page}&pageSize=100`);
    templates.push(...(response.exercise_templates || []));
    pageCount = Number(response.page_count) || page;
    page += 1;
  } while (page <= pageCount);
  return templates;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const { exercises } = JSON.parse(await readFile("exercises.json", "utf8"));
const templates = await listTemplates();
const byTitle = new Map();
templates.forEach((template) => {
  const title = normalize(template.title || template.name);
  const matches = byTitle.get(title) || [];
  matches.push(template);
  byTitle.set(title, matches);
});

const review = { version: 1, generatedAt: new Date().toISOString(), templates: {}, ambiguous: [], unmatched: [] };
exercises.filter((exercise) => exercise.type === "strength" || exercise.type === "cardio").forEach((exercise) => {
  const matches = byTitle.get(normalize(exercise.hevyName || exercise.name)) || [];
  if (matches.length === 1) {
    review.templates[exercise.id] = {
      hevyExerciseTemplateId: matches[0].id,
      verified: false,
      candidateTitle: matches[0].title || matches[0].name,
    };
  } else if (matches.length > 1) {
    review.ambiguous.push({ exerciseId: exercise.id, candidates: matches.map((match) => ({ id: match.id, title: match.title || match.name })) });
  } else {
    review.unmatched.push({ exerciseId: exercise.id, name: exercise.name });
  }
});

await writeFile(outputFile, `${JSON.stringify(review, null, 2)}\n`);
console.log(`Wrote ${outputFile}: ${Object.keys(review.templates).length} exact candidates, ${review.ambiguous.length} ambiguous, ${review.unmatched.length} unmatched.`);

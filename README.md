# 2–5–15–30

A deterministic, equipment-aware workout-plan generator implemented as a dependency-free static web application.

The project intentionally has no backend, build system, framework, account model, database, or analytics layer. The browser loads the workout catalogs, generates a plan locally, renders it, and serializes the relevant state into the URL.

## Engineering goals

- Keep the application deployable as static files.
- Keep workout content separate from generation logic.
- Produce deterministic plans from shareable URLs.
- Enforce equipment and routine constraints during generation.
- Estimate routine duration from exercise metadata.
- Avoid collecting or storing user data.
- Prefer a small, understandable codebase over framework machinery.

## Runtime model

At startup, `app.js` loads the catalogs and Hevy mapping file in parallel, then wires the planner, renderer, and UI modules:

```text
exercises.json
data.json
equipment.json
hevy-mappings.json
```

`exercises.json` is the exercise source of truth. Each record includes its required `equipment`, optional selector dependencies in `requires`, primary muscle, rep range, set time, setup time, rest period, warm-up protocol, and exercise-detail content. Exercises that compete for the same station or loaded implement declare those constraints in `supersetConflicts`; these values are planner-only resources and are not equipment-selector keys. `equipment.json` controls equipment labels, groups, defaults, and selector dependencies. `data.json` contains the four-routine coverage cycle used to work each tracked muscle twice per cycle.

For example, a barbell bench press can require the Olympic bar and plates through `equipment`, require an adjustable bench and rack through `requires`, and declare `loaded-olympic-bar`, `bench-flat`, and `rack` in `supersetConflicts`. The planner uses the first two fields for availability and the last field for superset pairing. Loaded Olympic bar, EZ-bar, trap-bar, and landmine conflicts are mutually exclusive within a superset; bench configurations and shared stations are also protected.

## Local development

Run the site from the repository root with any static server. For the simplest option:

```sh
python3 -m http.server 8080
```

Open <http://localhost:8080>.

Before committing, run:

```sh
node --check app.js
npm test
node --input-type=module -e "import fs from 'node:fs'; for (const file of ['exercises.json','data.json','equipment.json','hevy-mappings.json']) JSON.parse(fs.readFileSync(file)); console.log('JSON ok')"
```

## Shareable plans

The URL seed stores the random seed, routine count, selected equipment, theme, dynamic warm-ups, and dynamic rest settings. Exercise exclusions use stable exercise IDs in the `exclude` query parameter, so catalog ordering does not change their meaning.

The plan actions menu can copy the current URL or send the generated routines directly to Hevy. The Hevy API key is held in memory only and is never included in the plan URL. Export is blocked until every strength and cardio exercise has a verified entry in `hevy-mappings.json`.

To review candidates from a Hevy Pro account without exposing the key in source or logs:

```sh
HEVY_API_KEY="..." node tools/build-hevy-template-map.mjs
```

The script writes the ignored `hevy-template-review.json`; review candidates manually before marking mappings as verified.

## Contribution notes

This project uses [Conventional Commits](AGENTS.md). Keep catalog content in the JSON files, planner behavior in `planner.js`, state and URL behavior in `plan-state.js`, and presentation rules in the CSS files. Do not add a database, server-side state, or build step without an explicit product decision.

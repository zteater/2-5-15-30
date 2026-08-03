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

## Repository structure

| File | Responsibility |
|---|---|
| `index.html` | Application shell, configuration UI, dialogs, and static content |
| `app.js` | State management, seeded randomization, plan generation, timing, and rendering |
| `data.json` | Four-routine muscle coverage cycle |
| `exercises.json` | Strength, warm-up, conditioning, and cardio catalog |
| `equipment.json` | Equipment catalog, grouping, aliases, and dependencies |
| `styles.css` | Global layout, components, themes, and responsive behavior |
| `supersets.css` | Routine-card and superset presentation |
| `README.md` | Engineering documentation |

There are no generated assets and no build output directory.

## Runtime model

At startup, `app.js` loads the three JSON catalogs in parallel:

```text
exercises.json
data.json
equipment.json
```

`exercises.json` is the exercise source of truth. Each record includes its equipment, primary muscle, rep range, set time, setup time, rest period, warm-up protocol, and exercise-detail content. `equipment.json` controls equipment labels, groups, defaults, and dependencies. `data.json` contains the four-routine coverage cycle used to work each tracked muscle twice per cycle.

## Local development

Run the site from the repository root with any static server. For the simplest option:

```sh
python3 -m http.server 8080
```

Open <http://localhost:8080>.

Before committing, run:

```sh
node --check app.js
node -e "for (const file of ['exercises.json','data.json','equipment.json']) JSON.parse(require('fs').readFileSync(file)); console.log('JSON ok')"
```

## Shareable plans

The URL seed stores the random seed, routine count, selected equipment, theme, dynamic warm-ups, and dynamic rest settings. Exercise exclusions use stable exercise IDs in the `exclude` query parameter, so catalog ordering does not change their meaning.

The plan actions menu can copy the current URL or download the generated routines as a CSV formatted for workout-log imports.

## Contribution notes

This project uses [Conventional Commits](AGENTS.md). Keep catalog content in the JSON files, planner behavior in `app.js`, and presentation rules in the CSS files. Do not add a database, server-side state, or build step without an explicit product decision.

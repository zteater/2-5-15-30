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
| `data.json` | Routine blueprint data |
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

# 2–5–15–30 Fit

A static, no-database workout planner built for GitHub Pages. It generates 4–16 seeded routines in a flexible sequence based on the equipment selected by the user. Each routine includes a primary Exercise 01 with two specific ramp-up sets, three session-agnostic mobility warmups plus an optional fourth on 5-exercise sessions, visible 2/3-exercise superset blocks, calves in the lower-body compound slot, and optional 30-minute cardio finishers on the 4-exercise sessions. Complete sessions in order and take as much rest between them as you need. The session count is stored with the URL seed so reloading a seeded plan reproduces it.

The workout catalog and plan configuration live in [`data.js`](data.js); [`app.js`](app.js) contains the planner logic and UI behavior.

## Run locally

Open `index.html` directly, or serve the folder with any static file server:

```sh
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Deploy to GitHub Pages

Push the repository to GitHub, then choose **Settings → Pages → Deploy from a branch**, select the default branch and `/ (root)`. No build command or environment variables are required.

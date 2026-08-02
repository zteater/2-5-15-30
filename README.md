# 2–5–15–30

**2–5–15–30** is a free, no-database workout planner by Zak Studios. It creates flexible strength-training routines for home equipment and gives you a sequence to complete in order—not a rigid Monday-through-Friday schedule.

## The idea

- **2×** — train each major muscle group twice across a four-routine cycle
- **5** — no more than five lifting exercises in a routine
- **15** — no more than fifteen total lifting sets
- **30′** — aim to finish the lifting routine in about thirty minutes

You can take rest days whenever you need them. Once you finish the last routine, start again at the beginning of the sequence.

## What it generates

Each routine is built around mixed muscle groups and includes:

- A high-impact first lift with specific ramp-up sets
- Three mostly static, routine-agnostic warmups
- A fourth warmup when the routine has five lifting exercises
- Superset A and Superset B with three working sets per exercise
- Core work reserved for the final lifting slot when included
- Calves included with lower-body work
- Optional cardio finishers on four-exercise routines
- Rep ranges selected from 6–10, 10–15, and 12–20 based on the exercise

The generator also avoids repeating an exercise in adjacent routines when a compatible alternative is available.

## Configure a plan

Choose a routine sequence of **4, 8, 12, or 16 routines** and select the equipment you have. Bodyweight is always available for warmups and appropriate accessory work.

Available equipment includes:

- Dumbbells and adjustable bench
- Kettlebells
- Tube bands
- Pull-up bar
- Olympic bar and plates
- EZ-bar
- Adjustable rack
- Landmine extension
- Slam ball and medicine ball
- Jump rope
- Treadmill, rowing machine, and stationary bike

Landmine exercises require an Olympic bar to be selected.

## Seeded plans

Every generated plan has a compact seed in the URL. The seed captures the generation state, routine count, cardio setting, and equipment selection. Reloading a seeded URL reproduces the same routines; **Regenerate** creates a new seed and a new sequence.

## Run locally

This is a dependency-free static site. From the project directory, start a local server:

```sh
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080). A static server is recommended because it matches how the app runs on GitHub Pages.

There is no build step and no database. The basic syntax checks are:

```sh
node --check app.js
node -e "for (const file of ['data.json', 'equipment.json', 'exercises.json']) JSON.parse(require('fs').readFileSync(file, 'utf8'))"
```

## Privacy and safety

2-5-15-30 is free to use and does not collect or store personal data in the app. There are no accounts, user database, workout tracking database, analytics, ads, or data sales.

The site is hosted on GitHub Pages. GitHub may process limited technical data, such as IP addresses, for hosting, security, and service operations under GitHub’s own privacy practices.

We do not want your personal information. The app provides general fitness information only. Train within your abilities and consult a qualified professional if you have health concerns.

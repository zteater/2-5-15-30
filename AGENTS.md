# Contributing to 2–5–15–30

## Conventional commits

Use Conventional Commits for every commit:

```text
<type>(<scope>): <short imperative description>
```

Common types:

- `feat`: a user-facing feature
- `fix`: a bug fix
- `docs`: documentation-only changes
- `refactor`: code restructuring without a behavior change
- `style`: formatting or visual-only changes
- `test`: tests or test infrastructure
- `chore`: maintenance, tooling, or repository changes

Scopes are optional, but useful examples include `ui`, `planner`, `data`, `seed`, and `docs`.

Good examples:

```text
feat(planner): randomize routine order
fix(ui): stack routine cards on mobile
docs: explain GitHub Pages deployment
refactor(data): move warmups into the catalog
```

Keep commit subjects concise, written in the imperative mood, and without a trailing period. Use the commit body when the reason or tradeoff needs explanation.

## Before committing

1. Review `git diff` and `git status`.
2. Keep unrelated changes out of the commit.
3. Run the available syntax checks:

   ```sh
   node --check app.js
   node --check data.js
   ```

4. Confirm the app still runs from a static server.

This is a dependency-free static site. Keep workout catalog content in `data.js`, planner and interaction logic in `app.js`, and presentation rules in `styles.css` or `supersets.css`. Do not add a database, server-side state, or a build step without an explicit product decision.

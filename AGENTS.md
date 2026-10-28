# Agent notes

localreview is a Bun CLI + local web server for reviewing a git diff in the browser and copying
comments as Markdown for an AI agent. Read [`ARCHITECTURE.md`](ARCHITECTURE.md) before making
non-trivial changes and keep it up to date when behaviour or structure changes.

## Layout

- `src/`: Bun CLI and API server. Uses Bun APIs; tested with `bun test ./src`.
- `shared/`: types shared by server and UI.
- `web/`: the React UI (Vite root). Tested with Vitest + happy-dom.
- `e2e/`: Playwright tests (run under Node, so no Bun APIs there).

## Commands

- `bun run check`: format check, lint, typecheck, server tests, UI tests. Must pass before
  committing (the pre-commit hook runs it).
- `bun run test:e2e`: build + Playwright. Run it for UI or server changes.
- `bun run format`: apply formatting.
- In environments with a preinstalled Chromium, point Playwright at it with
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome`.

## Conventions

- Always install the latest dependency versions.
- Comments only where they add a non-obvious _why_.
- Conventional Commits for commit messages and PR titles (enforced by `.githooks/commit-msg` and CI).
- Lint exceptions live in `.oxlintrc.json`, never inline.
- Styling: CSS Modules plus the design tokens in `web/src/styles/global.css`. No Tailwind or
  component libraries; primitives live in `web/src/components/ui/`.
- Accessibility names are part of the contract: tests query by role and label.

## Testing

- Pick the cheapest layer that can catch the bug: pure logic → unit test; one component →
  component test next to it; cross-component wiring → `App.test.tsx`; real browser/layout/clipboard
  → Playwright.
- Tests are named "does X when Y".
- Component tests use a `defaultProps` object with `vi.fn()` callbacks and assert the exact data
  passed to callbacks. Vary mock data with object spread.
- UI fixtures are a readable unified diff parsed with the real `parseDiff`
  (`web/src/test/fixtures.ts`).

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`: the `bun run check` steps
plus a build, and the Playwright suite. `.github/workflows/preview.yml` deploys each PR, and `main`
to `localreview.pages.dev`, to Cloudflare Pages with a static snapshot of a fixed demo diff
(`scripts/preview-snapshot.ts`). `.github/workflows/pr-title.yml` checks that PR titles follow
Conventional Commits.

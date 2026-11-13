# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in the **Deco_agent** project.

## Project Overview

**Deco_agent** is a technical diving gas management and decompression planning utility. It implements the industry-standard **Bühlmann ZHL-16** decompression model (both the **B** and **C** coefficient sets) with **Gradient Factors**.

### Unified Architecture (v3.0)
The project has been refactored from a Python/TypeScript hybrid into a **unified TypeScript codebase**.

-   **Engine (`shared/engine/`)**: Single source of truth for ZHL-16B/C math and planning logic.
-   **CLI (`bin/deco-agent.ts`)**: Node.js command-line interface for planning and gas info.
-   **Web App (`frontend/`)**: React/Vite dashboard using the same shared engine (Offline-capable).
-   **Data (`shared/config.ts`)**: Shared `GASES` and `CYLINDERS` definitions.
-   **CI (`.github/workflows/`)**: `ci.yml` runs engine tests and the frontend build on
    every push to `main` and every PR; `deploy.yml` publishes the frontend to GitHub Pages.

## Key Technologies
- **TypeScript**: 100% of core logic and UI.
- **Node.js / tsx**: CLI runtime.
- **Vite + React (TS)**: Frontend with interactive charts (Recharts).
- **ZHL-16B/C**: 16-compartment inert gas tracking.

## Building and Running

### Run the CLI
```bash
npm run cli -- plan --depth 50 --time 20 --gas Air --mode oc
```

### Run the Web App
```bash
npm run web
```

Serves on port 5173. `.claude/launch.json` declares this same command as the `web`
dev-server configuration for Claude Code's preview pane; it is tooling metadata and
not required to run the project manually.

### Run the Tests
```bash
npm run test -- run
```

`npm run test` alone starts Vitest in watch mode. Always append `run` for a
single non-interactive pass — this is what CI executes.

### Typecheck and Lint
```bash
npm run typecheck              # bin/ and shared/, strict
cd frontend && npm run lint    # ESLint for the web app
```

Requires Node.js 20 or higher.

## Development Conventions

1.  **Shared Logic**: Never duplicate decompression math. All changes to ZHL-16B/C or the Schreiner equation MUST happen in `shared/engine/`.
2.  **Type Safety**: Use types from `shared/types.ts` for consistency across CLI and Web. `planDive()` takes one request object (`DivePlanInput`), with gradient factors as percentages (50 / 80); only `depth`, `bottom_time` and `bottom_gas` are required.
3.  **Accuracy**: All pressure-to-depth conversions assume meters of salt water (MSW) using the `(Pressure - SurfacePressure) * 10` formula.
4.  **Offline-First**: The web app is designed to run the engine entirely in the browser. Do not introduce server-side dependencies for core planning.
5.  **Keep CI Green**: Any engine or CLI change must pass `npm run typecheck` and `npm run test -- run`, and any frontend change must pass `npm run lint` and `npm run build` in `frontend/`. CI runs all four on every PR.
6.  **Single Version Source**: The app version comes from the root `package.json`: the web app reads it via the `__APP_VERSION__` define in `frontend/vite.config.ts`, the CLI reads the file at startup. Do not hardcode version strings.
7.  **Single Agent Instructions File**: `CLAUDE.md` is the only agent instructions file for this repo. Keep it current when structure or conventions change, and do not add parallel files such as `GEMINI.md` or `AGENTS.md`.
8.  **Single Defaults Source**: Plan defaults (GFs, setpoints, rates, model, 6 m floor) live in `PLAN_DEFAULTS` in `shared/config.ts`. The engine, CLI and web form all read them from there; do not restate default values elsewhere.

## Key Files

**Engine & data (shared):**
- `shared/engine/deco_engine.ts`: Physiological core (ZHL-16B/C, CNS, OTU).
- `shared/engine/planner.ts`: Planning orchestrator (`planDive`), CCR bailout re-plan (`planBailout`) and gas requirements (`calculateGasRequirements`). Every tissue update goes through `DivePlanner.breathe()`, which also records open-circuit gas use; keep it that way so gas accounting matches the model.
- `shared/engine/*.test.ts`: Vitest suites for the engine and planner.
- `shared/config.ts`: `GASES` (standard diving gas database), `CYLINDERS` and `PLAN_DEFAULTS`.
- `shared/types.ts`: Shared interfaces for CLI and Frontend.

**Entry points:**
- `bin/deco-agent.ts`: Node CLI entry point.
- `frontend/src/App.tsx`: Main React application.
- `frontend/src/components/InfoModal.tsx`: About panel (feature summary, version, disclaimer).

**Config & tooling:**
- `frontend/vite.config.ts`: `@shared/*` alias for the dev server, plus the `__APP_VERSION__` (from the root `package.json`) and `__BUILD_TIME__` (build timestamp) defines that `InfoModal` renders.
- `tsconfig.json`: Strict typecheck settings for `bin/` and `shared/`.
- `.github/workflows/ci.yml`: Typecheck, engine tests, frontend lint and build.
- `.github/workflows/deploy.yml`: GitHub Pages deployment.
- `.claude/launch.json`: Dev-server config for Claude Code's preview pane.
- `CLAUDE.md`: Agent instructions (this file).

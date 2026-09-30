# GEMINI.md

This file serves as the foundational instructional context for Gemini CLI when interacting with the **Deco_agent** project.

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

## Development Conventions

1.  **Shared Logic**: Never duplicate decompression math. All changes to ZHL-16B/C or the Schreiner equation MUST happen in `shared/engine/`.
2.  **Type Safety**: Use types from `shared/types.ts` for consistency across CLI and Web.
3.  **Accuracy**: All pressure-to-depth conversions assume meters of salt water (MSW) using the `(Pressure - SurfacePressure) * 10` formula.
4.  **Offline-First**: The web app is designed to run the engine entirely in the browser. Do not introduce server-side dependencies for core planning.
5.  **Keep CI Green**: Any engine change must pass `npm run test -- run`, and any frontend change must pass `npm run build` in `frontend/`. CI runs both on every PR.
6.  **Single Version Source**: The app version comes from the root `package.json` via the `__APP_VERSION__` define in `frontend/vite.config.ts`. Do not hardcode version strings in components.

## Key Files

**Engine & data (shared):**
- `shared/engine/deco_engine.ts`: Physiological core (ZHL-16B/C, CNS, OTU).
- `shared/engine/planner.ts`: Planning orchestrator and gas consumption.
- `shared/engine/*.test.ts`: Vitest suites for the engine and planner.
- `shared/config.ts`: `GASES` (standard diving gas database) and `CYLINDERS`.
- `shared/types.ts`: Shared interfaces for CLI and Frontend.

**Entry points:**
- `bin/deco-agent.ts`: Node CLI entry point.
- `frontend/src/App.tsx`: Main React application.
- `frontend/src/components/InfoModal.tsx`: About panel (feature summary, version, disclaimer).

**Config & tooling:**
- `frontend/vite.config.ts`: `@shared/*` alias for the dev server, plus the `__APP_VERSION__` / `__BUILD_TIME__` defines.
- `.github/workflows/ci.yml`: Engine tests and frontend build.
- `.github/workflows/deploy.yml`: GitHub Pages deployment.
- `.claude/launch.json`: Dev-server config for Claude Code's preview pane.
- `GEMINI.md`: Project instructions (this file).

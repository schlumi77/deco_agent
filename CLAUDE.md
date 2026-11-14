# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in the **Deco_agent** project.

## Project Overview

**Deco_agent** is a technical diving gas management and decompression planning utility. It implements the industry-standard **Bühlmann ZHL-16** decompression model (both the **B** and **C** coefficient sets) with **Gradient Factors**.

### Unified Architecture (v3.0)
The project has been refactored from a Python/TypeScript hybrid into a **unified TypeScript codebase**.

-   **Engine (`shared/engine/`)**: Single source of truth for ZHL-16B/C math and planning logic.
-   **CLI (`bin/deco-agent.ts`)**: Node.js command-line interface for planning and gas info.
-   **Web App (`frontend/`)**: React/Vite dashboard using the same shared engine (Offline-capable).
-   **Data (`shared/config.ts`)**: Shared `GASES`, the default cylinder kit (`CYLINDERS`) and `PLAN_DEFAULTS`.
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

### Compare with a Reference Planner
```bash
npm run reference
```

Prints the reference dives in `shared/engine/reference/` with this planner's result. Once external results (Subsurface, MultiDeco) are pasted into `dives.ts`, `npm run test -- run` fails when a plan drifts outside tolerance. See `shared/engine/reference/README.md` for the settings to match.

### Typecheck and Lint
```bash
npm run typecheck              # bin/ and shared/, strict
cd frontend && npm run lint    # ESLint for the web app
```

Requires Node.js 20 or higher.

## Development Conventions

1.  **Shared Logic**: Never duplicate decompression math. All changes to ZHL-16B/C or the Schreiner equation MUST happen in `shared/engine/`.
2.  **Type Safety**: Use types from `shared/types.ts` for consistency across CLI and Web. `planDive()` takes one request object (`DivePlanInput`), with gradient factors as percentages (50 / 80); only `depth`, `bottom_time` and `bottom_gas` are required.
3.  **Accuracy**: Depth is in meters of salt water (MSW), 10 msw = 1 bar. Physics (tissue loading, CNS/OTU, CCR loop mix, END, density, gas consumption) uses the real surface pressure `SURFACE_PRESSURE` (1.013 bar). Gas limits (MOD, MinOD, the deco gas switch, the bottom-gas pO2 warning) use the diving convention `GAS_LIMIT_SURFACE_PRESSURE` (1 bar), so oxygen is used at 6 m; route them through `gasLimitPo2()` or `calculateMod()`/`calculateMinOd()` so they cannot drift apart.
4.  **Offline-First**: The web app is designed to run the engine entirely in the browser. Do not introduce server-side dependencies for core planning.
5.  **Keep CI Green**: Any engine or CLI change must pass `npm run typecheck` and `npm run test -- run`, and any frontend change must pass `npm run lint` and `npm run build` in `frontend/`. CI runs all four on every PR.
6.  **Single Version Source**: The app version comes from the root `package.json`: the web app reads it via the `__APP_VERSION__` define in `frontend/vite.config.ts`, the CLI reads the file at startup. Do not hardcode version strings.
7.  **Single Agent Instructions File**: `CLAUDE.md` is the only agent instructions file for this repo. Keep it current when structure or conventions change, and do not add parallel files such as `GEMINI.md` or `AGENTS.md`.
8.  **Single Defaults Source**: Plan defaults (deco gases, GFs, setpoints, descent and ascent rates including the final ascent rate over the last 10 m, model, 6 m floor, SAC, CCR oxygen use, cylinder sizes) live in `PLAN_DEFAULTS` in `shared/config.ts`. The engine, CLI and web form all read them from there; do not restate default values elsewhere.
9.  **Version Every PR**: Every PR bumps the version in the root `package.json` following Semantic Versioning. See [Versioning](#versioning) for which level to pick and how.

## Versioning

Every PR bumps the version in the root `package.json`, the single version source (convention 6), following [Semantic Versioning](https://semver.org/) `MAJOR.MINOR.PATCH`. Bump once per PR, at the level of its most significant change:

-   **MAJOR**: breaks how someone already uses the planner. For example: a CLI command or option is removed or renamed, an option's meaning or unit changes, a web app feature is removed, or the minimum Node.js version is raised.
-   **MINOR**: adds user-facing capability without breaking existing use. For example: a new CLI command, option or output section, a new web app feature, or a new gas in `GASES`.
-   **PATCH**: everything else, including bug fixes, docs, tests, CI, refactors and dependency updates.

The public interface is the CLI and the web app. `shared/` is not published as a package, so changing its exports (such as the `planDive()` signature) is not a breaking change by itself; judge it by its effect on the CLI and the web app.

A change that alters computed plans for the same input (stops, run times, gas requirements, CNS/OTU) must say so in the commit message and the PR description, whatever the bump level. A bug fix that changes plans is still a PATCH unless it also adds or breaks something.

To bump, run from the repository root:

```bash
npm version patch --no-git-tag-version   # or minor / major
```

This updates `package.json` and `package-lock.json` together; commit both. Leave `frontend/package.json` at `0.0.0`: it is private and not used for display.

-   Bump on the PR's own branch, as part of the PR.
-   If more commits land on the PR, bump again only if the level goes up (a PATCH PR that gains a new CLI option becomes MINOR).
-   If another PR with a bump merges first, rebase and re-apply the bump on top of the new version.
-   State the bump and the reason in the PR description, e.g. `Version: 3.1.0 → 3.1.1 (patch: bug fix)`.
-   Do not write the current version into docs or code; the CLI and the web app read it from `package.json`.

## Key Files

**Engine & data (shared):**
- `shared/engine/deco_engine.ts`: Physiological core (ZHL-16B/C, CNS, OTU).
- `shared/engine/planner.ts`: Planning orchestrator (`planDive`), gas switch stops on open circuit (`GAS_SWITCH_STOP_TIME`, GF Low stays anchored at the first required stop), CCR bailout re-plan (`planBailout`) and gas requirements checked against the cylinder kit (`calculateGasRequirements`). Every tissue update goes through `DivePlanner.breathe()`, which also records open-circuit gas use; keep it that way so gas accounting matches the model.
- `shared/engine/*.test.ts`: Vitest suites for the engine and planner.
- `shared/engine/reference/`: Reference dives compared with an external planner (`dives.ts`), the comparison and tolerances (`compare.ts`), `npm run reference` (`report.ts`) and the settings to match (`README.md`). A failing reference dive means a defect or an unshared convention; find out which before widening a tolerance.
- `shared/config.ts`: `GASES` (standard diving gas database), `CYLINDERS` (the default kit: bottom or diluent/bailout, stage, CCR onboard oxygen) and `PLAN_DEFAULTS`.
- `shared/types.ts`: Shared interfaces for CLI and Frontend.

**Entry points:**
- `bin/deco-agent.ts`: Node CLI entry point.
- `frontend/src/App.tsx`: Main React application.
- `frontend/src/components/InfoModal.tsx`: About panel (feature summary, version, disclaimer).

**Config & tooling:**
- `package.json`: The version, the single source for the CLI and the web app; bumped in every PR (see [Versioning](#versioning)).
- `frontend/vite.config.ts`: `@shared/*` alias for the dev server, plus the `__APP_VERSION__` (from the root `package.json`) and `__BUILD_TIME__` (build timestamp) defines that `InfoModal` renders.
- `tsconfig.json`: Strict typecheck settings for `bin/` and `shared/`.
- `.github/workflows/ci.yml`: Typecheck, engine tests, frontend lint and build.
- `.github/workflows/deploy.yml`: GitHub Pages deployment.
- `.claude/launch.json`: Dev-server config for Claude Code's preview pane.
- `CLAUDE.md`: Agent instructions (this file).

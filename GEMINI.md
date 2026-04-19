# GEMINI.md

This file serves as the foundational instructional context for Gemini CLI when interacting with the **Deco_agent** project.

## Project Overview

**Deco_agent** is a technical diving gas management and decompression planning utility. It implements the industry-standard **Bühlmann ZHL-16C** decompression model with **Gradient Factors**.

### Unified Architecture (v3.0)
The project has been refactored from a Python/TypeScript hybrid into a **unified TypeScript codebase**.

-   **Engine (`shared/engine/`)**: Single source of truth for ZHL-16C math and planning logic.
-   **CLI (`bin/deco-agent.ts`)**: Node.js command-line interface for planning and gas info.
-   **Web App (`frontend/`)**: React/Vite dashboard using the same shared engine (Offline-capable).
-   **Data (`shared/`)**: Shared JSON configuration for gases and cylinders.

## Key Technologies
- **TypeScript**: 100% of core logic and UI.
- **Node.js / tsx**: CLI runtime.
- **Vite + React (TS)**: Frontend with interactive charts (Recharts).
- **ZHL-16C**: 16-compartment inert gas tracking.

## Building and Running

### Run the CLI
```bash
npm run cli -- plan --depth 50 --time 20 --gas Air --mode oc
```

### Run the Web App
```bash
npm run web
```

## Development Conventions

1.  **Shared Logic**: Never duplicate decompression math. All changes to ZHL-16C or the Schreiner equation MUST happen in `shared/engine/`.
2.  **Type Safety**: Use types from `shared/types.ts` for consistency across CLI and Web.
3.  **Accuracy**: All pressure-to-depth conversions assume meters of salt water (MSW) using the `(Pressure - SurfacePressure) * 10` formula.
4.  **Offline-First**: The web app is designed to run the engine entirely in the browser. Do not introduce server-side dependencies for core planning.

## Key Files

- `bin/deco-agent.ts`: Node CLI entry point.
- `shared/engine/deco_engine.ts`: Physiological core (ZHL-16C, CNS, OTU).
- `shared/engine/planner.ts`: Planning orchestrator and gas consumption.
- `frontend/src/App.tsx`: Main React application.
- `shared/gas_config.json`: Database of standard diving gases.
- `GEMINI.md`: Project instructions (this file).

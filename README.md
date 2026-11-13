# 🤿 Deco_agent

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js->=20.0.0-green.svg)](https://nodejs.org/)
[![React 19](https://img.shields.io/badge/frontend-React%2019%20%2B%20TS-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/build-Vite-646CFF.svg)](https://vitejs.dev/)

**Deco Agent** is a high-precision technical diving gas management and decompression planning utility. Now refactored into a **unified TypeScript codebase**, it provides a single source of truth for decompression math across both CLI and Web platforms. It implements the industry-standard **Bühlmann ZHL-16** decompression model (both the **B** and **C** coefficient sets, selectable at runtime) with user-definable **Gradient Factors**.

---

## 🚀 Key Features

-   **Unified ZHL-16 Engine**: Single TypeScript implementation for 16-compartment inert gas tracking (Nitrogen & Helium) using the **Schreiner Equation**. Both the **ZHL-16B** and **ZHL-16C** coefficient sets are supported (select with `--model B|C` on the CLI or the model toggle in the web UI).
-   **Gradient Factors (GF)**: Full control over conservatism (e.g., 50/80) to manage deep stops and surfacing safety.
-   **Oxygen Toxicity Tracking**: Real-time calculation of **CNS%** (NOAA limits) and **OTUs** (pulmonary toxicity).
-   **Gas Management & Physics**:
    -   Calculates **MOD**, **MinOD**, **END**, and **Gas Density**.
    -   Supports **mCCR (Constant Setpoint)** and **Open Circuit** planning.
    -   Automated **Bailout Schedule** for CCR dives: the ascent is re-planned on open circuit from the end of bottom time (the worst case), and bailout gas is sized from that ascent.
    -   **Gas requirements** from the gas actually breathed in each segment, at an adjustable SAC (default 15 L/min) with a 1.5x reserve.
    -   **Cylinder checks**: requirements are compared with the cylinder kit (bottom or diluent/bailout cylinder, one stage per deco gas, CCR onboard oxygen), and any cylinder that holds too little raises a warning. Sizes are set with `--bottom-cyl`, `--stage-cyl` and `--o2-cyl` (`<litres>@<bar>`) on the CLI, or in the web form.
-   **Safety First**:
    -   Integrated warnings for high CNS (>80%), excessive OTUs (>300), and gas volume violations.
    -   **6-meter Decompression Floor**: Enforces a minimum stop depth of 6m for technical safety.
-   **Modern Web Dashboard**:
    -   **Offline-capable** React 19 application running the engine directly in the browser.
    -   Interactive **Tissue Saturation Charts** and **Dive Profile Charts** (using Recharts).
    -   Built-in **About panel** (the ℹ button in the header) summarising the engine's capabilities, the reported app version, and the safety disclaimer.
-   **Node.js CLI**: A powerful terminal-based agent for rapid planning and gas checks.

---

## 🛠 Tech Stack

-   **Language**: 100% TypeScript.
-   **Runtime**: Node.js (CLI) & Browser (Web).
-   **Frontend**: React 19, Vite, Recharts, Lucide React.
-   **Physiological Core**: Custom ZHL-16B/C implementation in `shared/engine/`.
-   **Testing**: Vitest for unit and integration testing.

---

## 📦 Getting Started

### Prerequisites

-   **Node.js**: version 20.0.0 or higher.
-   **npm**: version 9.0.0 or higher.

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/<your-org-or-user>/Deco_agent.git
    cd Deco_agent
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    # Also install frontend dependencies
    cd frontend && npm install && cd ..
    ```

---

## 🎮 Running the Application

### 1. Web Dashboard
Launch the interactive web application:
```bash
npm run web
```
The app will be available at `http://localhost:5173`. It runs the decompression engine locally in your browser, making it fully offline-capable once loaded.

### 2. CLI Agent
Access the planner directly in your terminal:
```bash
# General planning
npm run cli -- plan --depth 50 --time 20 --gas Air --mode oc

# See all options
npm run cli -- --help
```

---

## ✨ Recent Improvements (v3.0)

-   **Unified Architecture**: Removed Python/FastAPI backend in favor of a shared TypeScript engine. This ensures identical calculation results between the CLI and the Web UI.
-   **React 19 Upgrade**: Leverages the latest React features for a smoother, more responsive dashboard experience.
-   **Offline-First**: The web application no longer requires a backend server for calculations, allowing for use in remote dive locations.
-   **Improved Type Safety**: Shared types across the entire stack prevent data inconsistency and improve developer experience.

---

## 🧪 Testing

The project uses **Vitest** for comprehensive testing of the physiological engine and planning logic.

### Running Tests
```bash
npm run test
```

`npm run test` starts Vitest in **watch mode**. For a single non-interactive run
(what CI does), append `run`:

```bash
npm run test -- run
```

The test suite covers:
-   **ZHL-16B/C Math**: Validation of tissue loading and M-values.
-   **Schreiner Equation**: Accuracy of gas uptake and elimination during depth changes.
-   **Planner Logic**: Verification of decompression stop generation and gas consumption.
-   **Oxygen Toxicity**: CNS/OTU accumulation, including per-segment reporting in the schedule.

### Continuous Integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `main`
and on every pull request, in two independent jobs:

-   **Engine tests & typecheck**: `npm ci`, then `npm run typecheck` and `npm run test -- run`.
-   **Frontend lint, typecheck & build**: `npm ci`, then `npm run lint` and `npm run build` in `frontend/`.

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) publishes the built
frontend to GitHub Pages on pushes to `main` that touch `frontend/**`, `shared/**`,
the root `package.json` (which carries the version shown in the app), or the workflow
itself.

---

## 🏗 Project Structure

-   `shared/engine/`: The physiological core and planning orchestrator.
    -   `deco_engine.ts`: ZHL-16B/C math, CNS/OTU tracking, Schreiner logic.
    -   `planner.ts`: Stop-by-stop planning, the open-circuit bailout re-plan (`planBailout`) and gas requirements.
    -   `deco_engine.test.ts` / `planner.test.ts`: Vitest suites for the engine and planner.
-   `shared/`: Shared configuration and types.
    -   `types.ts`: TypeScript interfaces used by CLI and Frontend.
    -   `config.ts`: `GASES` (standard diving gas database), `CYLINDERS` (the default cylinder kit) and
        `PLAN_DEFAULTS` (the defaults shared by the engine, CLI and web form).
-   `bin/deco-agent.ts`: Node.js CLI entry point.
-   `frontend/src/`: React source code, utilizing the shared engine.
    -   `components/`: Reusable UI elements.
        -   `DiveForm.tsx`: Dive parameter input.
        -   `DiveProfileChart.tsx` / `TissueChart.tsx`: Recharts visualisations.
        -   `InfoModal.tsx`: The About panel (features, version, disclaimer).
-   `frontend/vite.config.ts`: Vite setup. Mirrors the `@shared/*` alias from
    `tsconfig.app.json` so the dev server resolves it like the production build, and
    injects two build-time constants consumed by the About panel: `__APP_VERSION__`
    (read from the root `package.json`) and `__BUILD_TIME__` (the build timestamp).
-   `tsconfig.json`: Typecheck settings for `bin/` and `shared/` (`npm run typecheck`).
-   `.github/workflows/`: `ci.yml` (typecheck, tests, lint and builds) and `deploy.yml` (GitHub Pages).
-   `.claude/launch.json`: Dev-server definition (`web` → `npm run web` on port 5173)
    used by Claude Code's preview tooling. Not required to run the project by hand.
-   `CLAUDE.md`: Instructions for AI coding agents (architecture, conventions, key files).
    The single agent instructions file for this repo.

---

## ⚖️ Disclaimer

**WARNING**: This software is for **planning purposes only**. Scuba diving, especially technical diving involving decompression and mixed gases, carries inherent risks including serious injury or death. **Always verify your dive plans with secondary software and a physical dive computer.** Do not dive beyond your training and certification level.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

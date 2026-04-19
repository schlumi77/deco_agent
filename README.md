# 🤿 Deco_agent v3.0

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js->=18.0.0-green.svg)](https://nodejs.org/)
[![React 19](https://img.shields.io/badge/frontend-React%2019%20%2B%20TS-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/build-Vite-646CFF.svg)](https://vitejs.dev/)

**Deco Agent** is a high-precision technical diving gas management and decompression planning utility. Now refactored into a **unified TypeScript codebase**, it provides a single source of truth for decompression math across both CLI and Web platforms. It implements the industry-standard **Bühlmann ZHL-16C** decompression model with user-definable **Gradient Factors**.

---

## 🚀 Key Features

-   **Unified ZHL-16C Engine**: Single TypeScript implementation for 16-compartment inert gas tracking (Nitrogen & Helium) using the **Schreiner Equation**.
-   **Gradient Factors (GF)**: Full control over conservatism (e.g., 50/80) to manage deep stops and surfacing safety.
-   **Oxygen Toxicity Tracking**: Real-time calculation of **CNS%** (NOAA limits) and **OTUs** (pulmonary toxicity).
-   **Gas Management & Physics**:
    -   Calculates **MOD**, **MinOD**, **END**, and **Gas Density**.
    -   Supports **mCCR (Constant Setpoint)** and **Open Circuit** planning.
    -   Automated **Bailout Schedule** generation with gas consumption analysis.
-   **Safety First**:
    -   Integrated warnings for high CNS (>80%), excessive OTUs (>300), and gas volume violations.
    -   **6-meter Decompression Floor**: Enforces a minimum stop depth of 6m for technical safety.
-   **Modern Web Dashboard**:
    -   **Offline-capable** React 19 application running the engine directly in the browser.
    -   Interactive **Tissue Saturation Charts** and **Dive Profile Charts** (using Recharts).
-   **Node.js CLI**: A powerful terminal-based agent for rapid planning and gas checks.

---

## 🛠 Tech Stack

-   **Language**: 100% TypeScript.
-   **Runtime**: Node.js (CLI) & Browser (Web).
-   **Frontend**: React 19, Vite, Recharts, Lucide React.
-   **Physiological Core**: Custom ZHL-16C implementation in `shared/engine/`.
-   **Testing**: Vitest for unit and integration testing.

---

## 📦 Getting Started

### Prerequisites

-   **Node.js**: version 18.0.0 or higher.
-   **npm**: version 9.0.0 or higher.

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/yourusername/Deco_agent.git
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

The test suite covers:
-   **ZHL-16C Math**: Validation of tissue loading and M-values.
-   **Schreiner Equation**: Accuracy of gas uptake and elimination during depth changes.
-   **Planner Logic**: Verification of decompression stop generation and gas consumption.

---

## 🏗 Project Structure

-   `shared/engine/`: The physiological core and planning orchestrator.
    -   `deco_engine.ts`: ZHL-16C math, CNS/OTU tracking, Schreiner logic.
    -   `planner.ts`: Stop-by-stop planning logic.
-   `shared/`: Shared configurations and types.
    -   `types.ts`: TypeScript interfaces used by CLI and Frontend.
    -   `gas_config.json`: Database of standard diving gases.
    -   `cylinders.json`: Configuration for common cylinder sizes.
-   `bin/deco-agent.ts`: Node.js CLI entry point.
-   `frontend/src/`: React source code, utilizing the shared engine.
    -   `components/`: Reusable UI elements (Charts, Forms).

---

## ⚖️ Disclaimer

**WARNING**: This software is for **planning purposes only**. Scuba diving, especially technical diving involving decompression and mixed gases, carries inherent risks including serious injury or death. **Always verify your dive plans with secondary software and a physical dive computer.** Do not dive beyond your training and certification level.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

# GEMINI.md

This file serves as the foundational instructional context for Gemini CLI when interacting with the **Deco_agent** project.

## Project Overview

**Deco_agent** is a technical diving gas management and decompression planning utility designed for mCCR (mechanical Closed Circuit Rebreather) and Open Circuit diving. It implements the industry-standard **Bühlmann ZHL-16C** decompression model with **Gradient Factors**.

### Key Technologies
- **Python**: Core logic and FastAPI Backend.
- **Vite + React (TS)**: Modern, responsive frontend with interactive charts (Recharts).
- **ZHL-16C**: 16-compartment inert gas tracking (Nitrogen & Helium).
- **JSON**: Configuration for standard gases (`gas_config.json`) and cylinders (`cylinders.json`).

## Architecture & Logic

- **Decompression Engine (`deco_engine.py`)**:
    - Synchronized with **Subsurface** core logic.
    - Uses the **Schreiner Equation** for high-precision gas uptake/elimination.
    - Accounts for **Water Vapor Pressure** (0.0627 bar) and Standard Atmosphere (1.013 bar).
    - Tracks **CNS%** (NOAA limits) and **OTUs** (pulmonary toxicity).
- **Planning Strategy**:
    - Supports **CCR** (constant setpoint) and **Open Circuit**.
    - Calculates **MOD**, **MinOD**, and **END**.
    - Enforces a **6-meter minimum decompression floor** (skips 3m stops).
    - Uses **Gradient Factors** (default 50/80) for conservatism control.

## Building and Running

### Run the Unified CLI Agent
To access gas info or the dive planner in the terminal:
```bash
python3 deko_agent.py
```

### Run the Reactive Web App
To launch both the FastAPI backend and the Vite frontend:
```bash
./run_web.sh
```
The script will display the local and network URLs. The frontend is optimized for both desktop and mobile (iOS/iPhone) browsers.

## Recent Improvements (v2.1)

- **Mobile Accessibility**:
    - Enabled horizontal scrolling for the settings toolbar on mobile devices.
    - Implemented media queries for a responsive dashboard layout (panels stack on narrow screens).
    - Redirected server logs to `backend.log` and `frontend.log` for better stability in background modes.
- **Engine & API Enhancements**:
    - Added **Air (21/0)** as a standard gas in `gas_config.json`.
    - Improved gas consumption logic to include final ascent from the last stop/bottom.
    - Added strict finite-number validation and detailed error reporting in the API.

## Development Conventions

1.  **Engine Integrity**: The `DecoEngine` class should remain synchronized with ZHL-16C specifications. Do not modify coefficients without validation.
2.  **Safety First**: The planner automatically generates warnings if CNS > 80%, OTUs > 300, or if calculated bailout volumes exceed cylinder capacity.
3.  **Accuracy**: All pressure-to-depth conversions assume meters of salt water (MSW) using the `(Pressure - SurfacePressure) * 10` formula.

## Key Files

- `deko_agent.py`: Unified CLI entry point and planning orchestrator.
- `deco_engine.py`: Physiological core (ZHL-16C, CNS, OTU, Schreiner logic).
- `api/main.py`: FastAPI server handling plan requests.
- `frontend/src/App.tsx`: Main React application logic.
- `run_web.sh`: Orchestration script for the web stack.
- `gas_config.json`: Database of standard diving gases.
- `GEMINI.md`: Project instructions (this file).

# 🤿 Deco_agent v2.1

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![React 18+](https://img.shields.io/badge/frontend-React%2018%20%2B%20TS-61dafb.svg)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/api-FastAPI-009688.svg)](https://fastapi.tiangolo.com/)
[![Vite](https://img.shields.io/badge/build-Vite-646CFF.svg)](https://vitejs.dev/)

**Deco Agent** is a high-precision technical diving gas management and decompression planning utility. Designed for both **mCCR (mechanical Closed Circuit Rebreather)** and **Open Circuit** diving, it implements the industry-standard **Bühlmann ZHL-16C** decompression model with user-definable **Gradient Factors**.

---

## 🚀 Key Features

-   **Bühlmann ZHL-16C Engine**: 16-compartment inert gas tracking (Nitrogen & Helium) using the **Schreiner Equation**.
-   **Gradient Factors (GF)**: Full control over conservatism (e.g., 50/80) to manage deep stops and surfacing safety.
-   **Oxygen Toxicity Tracking**: Real-time calculation of **CNS%** (NOAA limits) and **OTUs** (pulmonary toxicity).
-   **Gas Management & Physics**:
    -   Calculates **MOD**, **MinOD**, **END**, and **Gas Density**.
    -   Supports **CCR (Constant Setpoint)** and **Open Circuit** planning.
    -   Automated **Bailout Schedule** generation with gas consumption analysis.
-   **Safety First**:
    -   Integrated warnings for high CNS (>80%), excessive OTUs (>300), and gas volume violations.
    -   **6-meter Decompression Floor**: Enforces a minimum stop depth of 6m for technical safety.
-   **Modern Web Dashboard**:
    -   Responsive, mobile-friendly interface (optimized for iOS/Android).
    -   Interactive **Tissue Saturation Charts** visualizing all 16 compartments.
    -   Dynamic **Dive Profile Charts** with stop-by-stop gas and CNS tracking.
-   **Unified CLI**: A powerful terminal-based agent for rapid planning and gas checks.

---

## 🛠 Tech Stack

-   **Backend**: Python 3.9+, FastAPI, Pydantic (Strongly typed API).
-   **Frontend**: React 18, TypeScript, Vite, Recharts (Data Visualization).
-   **Physiological Core**: Custom implementation of ZHL-16C, synchronized with **Subsurface** core logic for maximum reliability.

---

## 📦 Getting Started

### Prerequisites

-   Python 3.9 or higher
-   Node.js & npm (for the frontend)
-   Virtual environment (recommended)

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/yourusername/Deco_agent.git
    cd Deco_agent
    ```

2.  **Set up the Backend**:
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ```

3.  **Set up the Frontend**:
    ```bash
    cd frontend
    npm install
    cd ..
    ```

---

## 🎮 Running the Application

### 1. Unified Web Stack (Recommended)
Launch the FastAPI backend and Vite frontend simultaneously using the provided orchestration script:
```bash
chmod +x run_web.sh
./run_web.sh
```
- **Frontend**: `http://localhost:5173`
- **Backend API**: `http://localhost:8000`

### 2. CLI Agent
Access the planner directly in your terminal for quick calculations:
```bash
python3 deko_agent.py
```

---

## ✨ Recent Improvements (v2.1)

-   **Enhanced Input Stability**: Fixed a critical bug where empty numeric inputs (like depth or time) could cause the calculation engine to hang. Inputs now default to safe values or skip calculation until valid.
-   **Mobile Accessibility**:
    -   Implemented horizontal scrolling for the settings toolbar on mobile devices.
    -   Responsive dashboard layout where panels stack on narrow screens.
-   **Engine & API Enhancements**:
    -   Added **Air (21/0)** as a standard gas.
    -   Improved gas consumption logic to include final ascent segments.
    -   Added strict finite-number validation in the API.

---

## 🧪 Testing

The project includes a comprehensive test suite covering the physiological engine, the dive planner, and the FastAPI endpoints.

### Running Tests
Ensure you have the development dependencies installed:
```bash
pip install pytest httpx
```

Run all tests:
```bash
pytest
```

The test suite includes:
-   `test_deco_engine.py`: Unit tests for ZHL-16 math, Schreiner equation, and toxicity tracking.
-   `test_deko_agent.py`: Integration tests for the dive planning logic and data loading.
-   `test_api.py`: Functional tests for the FastAPI REST endpoints.

---

## 🏗 Project Structure

-   `deco_engine.py`: The physiological core (ZHL-16C math, CNS/OTU tracking, Schreiner logic).
-   `deko_agent.py`: Unified CLI entry point and planning orchestrator.
-   `api/`: FastAPI server implementation.
    -   `main.py`: Endpoint definitions and request handling.
    -   `models.py`: Pydantic schemas for dive plans and results.
-   `frontend/src/`: React source code.
    -   `engine/`: TypeScript implementation of the deco engine for client-side previews.
    -   `components/`: Reusable UI elements (Charts, Forms).
-   `gas_config.json`: Database of standard diving gases (Air, Nitrox, Trimix).
-   `cylinders.json`: Configuration for common cylinder sizes and volumes.
-   `calculate_all_scenarios.py`: Batch utility for generating multiple dive scenarios.

---

## ⚖️ Disclaimer

**WARNING**: This software is for **planning purposes only**. Scuba diving, especially technical diving involving decompression and mixed gases, carries inherent risks including serious injury or death. **Always verify your dive plans with secondary software and a physical dive computer.** Do not dive beyond your training and certification level.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

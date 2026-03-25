# Deco_agent

**Deco_agent** is a high-precision technical diving gas management and decompression planning utility. Designed for both **mCCR (mechanical Closed Circuit Rebreather)** and **Open Circuit** diving, it implements the industry-standard **Bühlmann ZHL-16C** decompression model with user-definable **Gradient Factors**.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.9+-blue.svg)
![React](https://img.shields.io/badge/frontend-React%20%2B%20TS-61dafb.svg)

## 🚀 Overview

Deco_agent provides a robust suite of tools for the modern technical diver. Whether you are planning a deep trimix dive or managing complex bailout scenarios, the engine delivers physiological data synchronized with core logic used in professional tools like **Subsurface**.

### Key Features

-   **Bühlmann ZHL-16C Engine**: 16-compartment inert gas tracking (Nitrogen & Helium) using the **Schreiner Equation**.
-   **Gradient Factors (GF)**: Full control over conservatism (e.g., 50/80) to manage deep stops and surfacing safety.
-   **Oxygen Toxicity Tracking**: Real-time calculation of **CNS%** (NOAA limits) and **OTUs** (pulmonary toxicity).
-   **Gas Management**:
    -   Calculates **MOD**, **MinOD**, **END**, and **Gas Density**.
    -   Supports **CCR (Constant Setpoint)** and **Open Circuit** planning.
    -   Automated **Bailout Schedule** generation with gas consumption analysis.
-   **Safety Alerts**: Integrated warnings for high CNS (>80%), excessive OTUs, and gas volume violations.
-   **Responsive Web Dashboard**: A modern, mobile-friendly interface with interactive tissue load charts and dive profile visualizations.
-   **Unified CLI**: A powerful terminal interface for quick gas checks and planning.

---

## 🛠 Tech Stack

-   **Backend**: Python 3.9+, FastAPI, Pydantic.
-   **Frontend**: Vite, React, TypeScript, Recharts (for interactive data visualization).
-   **Engine**: Custom implementation of ZHL-16C, synchronized with Subsurface core logic.
-   **Deployment**: Unified shell script for orchestrated backend/frontend startup.

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
    pip install -r requirements.txt  # Ensure you create this or install fastapi uvicorn
    ```

3.  **Set up the Frontend**:
    ```bash
    cd frontend
    npm install
    cd ..
    ```

### Running the Application

#### Unified Web Stack
Launch the FastAPI backend and Vite frontend simultaneously using the provided script:
```bash
chmod +x run_web.sh
./run_web.sh
```
The application will be available at the URL displayed in the terminal (typically `http://localhost:5173`).

#### CLI Agent
Access the planner directly in your terminal:
```bash
python3 deko_agent.py
```

---

## 🏗 Architecture

-   `deco_engine.py`: The physiological core. Handles ZHL-16C math, CNS/OTU tracking, and Schreiner logic.
-   `api/`: FastAPI server implementation.
    -   `main.py`: Endpoint definitions and request handling.
    -   `models.py`: Pydantic schemas for dive plans and results.
-   `frontend/src/`: React source code.
    -   `App.tsx`: Main dashboard logic.
    -   `components/`: Reusable UI elements (Charts, Forms).
-   `gas_config.json`: Database of standard diving gases (Air, Nitrox, Trimix).
-   `cylinders.json`: Configuration for common cylinder sizes and volumes.

---

## ⚖️ Disclaimer

**WARNING**: This software is for **planning purposes only**. Scuba diving, especially technical diving involving decompression and mixed gases, carries inherent risks including serious injury or death. **Always verify your dive plans with secondary software and a physical dive computer.** Do not dive beyond your training and certification level.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

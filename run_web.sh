#!/bin/bash

# Function to kill background processes on exit
cleanup() {
    echo "Shutting down..."
    kill $BACKEND_PID
    kill $FRONTEND_PID
    exit
}

trap cleanup SIGINT SIGTERM

echo "Starting Deko Agent Reactive Web App..."

# Start Backend
echo "Launching FastAPI Backend..."
source venv/bin/activate
python3 -m uvicorn api.main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &
BACKEND_PID=$!

# Start Frontend
echo "Launching Vite Frontend..."
cd frontend
npm run dev -- --host > ../frontend.log 2>&1 &
FRONTEND_PID=$!

IP_ADDR=$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || hostname -I | awk '{print $1}')

echo "------------------------------------------------"
echo "Backend: http://$IP_ADDR:8000"
echo "Frontend: http://$IP_ADDR:5173"
echo "------------------------------------------------"
echo "Press Ctrl+C to stop both servers."

# Wait for background processes
wait

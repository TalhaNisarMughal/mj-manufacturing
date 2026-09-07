#!/usr/bin/env bash
# ============================================================
# MJ Manufacturing — start the app (Linux / macOS)
# Runs the FastAPI backend (port 8000) and the React
# frontend (port 5173) together. Ctrl+C stops both.
# ============================================================
set -e
cd "$(dirname "$0")"

if [ ! -d "backend/venv" ]; then
  echo "Backend is not set up yet. Run ./setup.sh first."
  exit 1
fi
if [ ! -d "frontend/node_modules" ]; then
  echo "Frontend is not set up yet. Run ./setup.sh first."
  exit 1
fi

cleanup() {
  echo ""
  echo "Stopping MJ Manufacturing…"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "==> Starting backend on http://localhost:8000 …"
(cd backend && ./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000) &
BACKEND_PID=$!

sleep 2

echo "==> Starting frontend on http://localhost:5173 …"
(cd frontend && npm run dev) &
FRONTEND_PID=$!

echo ""
echo "============================================================"
echo "  MJ Manufacturing is running"
echo "  App:      http://localhost:5173"
echo "  API docs: http://localhost:8000/docs"
echo "  Press Ctrl+C to stop."
echo "============================================================"

wait

#!/usr/bin/env bash
# ============================================================
# MJ Manufacturing — one-time setup (Linux / macOS)
# Creates the Python venv, installs everything, and
# initializes the Neon database with tables + login accounts.
# ============================================================
set -e
cd "$(dirname "$0")"

echo "==> [1/4] Checking prerequisites…"
command -v python3 >/dev/null 2>&1 || { echo "python3 is required but not found. Install Python 3.10+ first."; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node is required but not found. Install Node.js 18+ first."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required but not found. Install Node.js 18+ first."; exit 1; }

echo "==> [2/4] Setting up the Python backend…"
cd backend
if [ ! -d "venv" ]; then
  python3 -m venv venv
fi
./venv/bin/pip install --upgrade pip -q
./venv/bin/pip install -r requirements.txt -q
echo "    Backend dependencies installed."

echo "==> [3/4] Initializing the database (tables + admin/user accounts)…"
./venv/bin/python init_db.py
cd ..

echo "==> [4/4] Installing frontend dependencies…"
cd frontend
npm install --no-audit --no-fund
cd ..

echo ""
echo "============================================================"
echo " Setup complete. Start the app with:  ./run.sh"
echo " Then open http://localhost:5173"
echo "============================================================"

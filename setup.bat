@echo off
REM ============================================================
REM MJ Manufacturing - one-time setup (Windows)
REM ============================================================
cd /d "%~dp0"

echo ==^> [1/4] Checking prerequisites...
where python >nul 2>nul || (echo Python is required. Install Python 3.10+ and re-run. & exit /b 1)
where node >nul 2>nul || (echo Node.js is required. Install Node.js 18+ and re-run. & exit /b 1)

echo ==^> [2/4] Setting up the Python backend...
cd backend
if not exist venv (python -m venv venv)
call venv\Scripts\pip install --upgrade pip -q
call venv\Scripts\pip install -r requirements.txt -q
if errorlevel 1 (echo Failed to install backend dependencies. & exit /b 1)

echo ==^> [3/4] Initializing the database (tables + admin/user accounts)...
call venv\Scripts\python init_db.py
if errorlevel 1 (echo Database initialization failed - check DATABASE_URL in backend\.env & exit /b 1)
cd ..

echo ==^> [4/4] Installing frontend dependencies...
cd frontend
call npm install --no-audit --no-fund
cd ..

echo.
echo ============================================================
echo  Setup complete. Start the app with:  run.bat
echo  Then open http://localhost:5173
echo ============================================================

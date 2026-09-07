@echo off
REM ============================================================
REM MJ Manufacturing - start the app (Windows)
REM Opens the backend and frontend in two windows.
REM ============================================================
cd /d "%~dp0"

if not exist backend\venv (echo Backend not set up yet. Run setup.bat first. & exit /b 1)
if not exist frontend\node_modules (echo Frontend not set up yet. Run setup.bat first. & exit /b 1)

echo ==^> Starting backend on http://localhost:8000 ...
start "MJ Backend" cmd /k "cd backend && venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000"

timeout /t 3 /nobreak >nul

echo ==^> Starting frontend on http://localhost:5173 ...
start "MJ Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ============================================================
echo   MJ Manufacturing is running
echo   App:      http://localhost:5173
echo   API docs: http://localhost:8000/docs
echo   Close both terminal windows to stop.
echo ============================================================

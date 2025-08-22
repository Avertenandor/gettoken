@echo off
cd /d "C:\Users\konfu\Desktop\Sites\Experiment\Experiment1\Печать монет веб версия"
echo Starting local server with proper CSP headers for solc compilation...
echo Server will run at http://localhost:8080
echo Press Ctrl+C to stop

where node >nul 2>nul
if %errorlevel% == 0 (
    echo Using Node.js server with CSP headers...
    node server.js
) else (
    echo Node.js not found, falling back to Python...
    echo WARNING: Python server won't set proper CSP headers via HTTP
    echo The site will rely on meta CSP tag which should work now
    python -m http.server 8080
)
pause

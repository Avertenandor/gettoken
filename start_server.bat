@echo off
cd /d "C:\Users\konfu\Desktop\Sites\Experiment\Experiment1\Печать монет веб версия"
echo Starting local server at http://localhost:8080
echo Press Ctrl+C to stop
python -m http.server 8080
pause

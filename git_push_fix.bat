@echo off
cd /d "C:\Users\konfu\Desktop\Sites\Experiment\Experiment1\Печать монет веб версия"
echo Adding files...
git add -A
echo Committing...
git commit -m "Fix: Added unsafe-eval to CSP for solc.js compilation support"
echo Pushing to GitHub...
git push origin main
echo Done!
pause

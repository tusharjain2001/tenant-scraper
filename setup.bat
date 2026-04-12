@echo off
echo Installing dependencies...
pip install -r requirements.txt
echo Installing Playwright browsers...
playwright install chromium
echo.
echo Setup complete! Run: python main.py
pause

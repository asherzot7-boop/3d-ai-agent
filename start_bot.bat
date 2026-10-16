@echo off
cd /d "%~dp0"
if not exist .env (
  copy .env.example .env >nul
  echo .env fayli yaratildi. Uni Notepad bilan ochib, kalitlarni yozing va qayta ishga tushiring.
  notepad .env
  pause
  exit /b
)
python -m pip install -q -r requirements.txt
python telegram_bot.py
pause

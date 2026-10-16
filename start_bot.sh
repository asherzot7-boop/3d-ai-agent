#!/usr/bin/env bash
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  cp .env.example .env
  echo ".env fayli yaratildi. Uni ochib, kalitlarni yozing va qayta ishga tushiring."
  exit 1
fi
python3 -m pip install -q -r requirements.txt
python3 telegram_bot.py

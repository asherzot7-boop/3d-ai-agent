"""Claude agentni Telegram botga ulash.

Ishga tushirish:
    pip install -r requirements.txt
    export ANTHROPIC_API_KEY="sk-ant-..."
    export TELEGRAM_BOT_TOKEN="123456:ABC..."      # @BotFather dan
    export TELEGRAM_ALLOWED_USERS="123456789"      # ixtiyoriy, vergul bilan
    python telegram_bot.py
"""

import asyncio
import logging
import os
from collections import defaultdict

import anthropic
from telegram import Update
from telegram.constants import ChatAction
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from agent import ask, error_text

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)

TELEGRAM_LIMIT = 4096  # Telegram bitta xabar uchun maksimal belgi soni
MAX_HISTORY = 40  # har bir chat uchun saqlanadigan xabarlar soni

client = anthropic.Anthropic()
histories: dict[int, list] = defaultdict(list)  # chat_id -> suhbat tarixi
locks: dict[int, asyncio.Lock] = defaultdict(asyncio.Lock)

# Bo'sh bo'lsa — hamma foydalana oladi (API hisobingizdan pul ketadi!)
ALLOWED_USERS = {
    int(x) for x in os.environ.get("TELEGRAM_ALLOWED_USERS", "").split(",") if x.strip()
}


def allowed(update: Update) -> bool:
    return not ALLOWED_USERS or update.effective_user.id in ALLOWED_USERS


def trim(messages: list) -> None:
    """Tarixni qisqartiradi; har doim oddiy user xabaridan boshlanadi."""
    if len(messages) <= MAX_HISTORY:
        return
    for i in range(len(messages) - MAX_HISTORY, len(messages)):
        m = messages[i]
        if m["role"] == "user" and isinstance(m["content"], str):
            del messages[:i]
            return


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Salom! Men Claude asosidagi AI agentman. Savolingizni yozing.\n"
        "/reset — suhbatni yangidan boshlash\n"
        f"Sizning ID: {update.effective_user.id}"
    )


async def reset(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    histories.pop(update.effective_chat.id, None)
    await update.message.reply_text("Suhbat tozalandi ✨")


async def on_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not allowed(update):
        await update.message.reply_text(
            f"Kechirasiz, ruxsat yo'q. Sizning ID: {update.effective_user.id}"
        )
        return

    chat_id = update.effective_chat.id
    async with locks[chat_id]:  # bitta chatda savollar navbat bilan
        messages = histories[chat_id]
        start_len = len(messages)
        messages.append({"role": "user", "content": update.message.text})
        await context.bot.send_chat_action(chat_id, ChatAction.TYPING)
        try:
            # Anthropic klienti sinxron — botni bloklamaslik uchun alohida oqimda
            reply = await asyncio.to_thread(ask, client, messages)
        except anthropic.APIError as e:
            logging.exception("Claude API xatosi")
            del messages[start_len:]
            reply = error_text(e)
        trim(messages)

    reply = reply or "(bo'sh javob)"
    for i in range(0, len(reply), TELEGRAM_LIMIT):
        await update.message.reply_text(reply[i : i + TELEGRAM_LIMIT])


def main() -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        raise SystemExit("TELEGRAM_BOT_TOKEN o'rnatilmagan (@BotFather dan oling).")
    app = Application.builder().token(token).concurrent_updates(True).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("reset", reset))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_message))
    logging.info("Bot ishga tushdi...")
    app.run_polling()


if __name__ == "__main__":
    main()

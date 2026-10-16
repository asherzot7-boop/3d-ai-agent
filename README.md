# 3d-ai-agent
3D AI Agent с чатом и Three.js визуализацией

## Oddiy Claude AI agent (1-qadam)

Terminalda ishlaydigan, Claude API asosidagi oddiy agent. U siz bilan suhbatlashadi
va kerak bo'lganda vositalardan (tools) o'zi foydalanadi:

| Vosita | Nima qiladi |
|---|---|
| `calculator` | Matematik ifodani hisoblaydi |
| `current_time` | Hozirgi sana va vaqt |
| `save_note` | Eslatmani `notes.txt` ga yozadi |
| `read_notes` | Saqlangan eslatmalarni o'qiydi |

### Ishga tushirish

1. API kalit oling: https://platform.claude.com → **API Keys**
2. O'rnating va ishga tushiring:

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY="sk-ant-..."   # Windows: set ANTHROPIC_API_KEY=sk-ant-...
python agent.py
```

### Misol

```
Siz: 245 * 17 qancha? Natijani eslatma qilib saqla.
  🔧 vosita: calculator
  🔧 vosita: save_note
Agent: 245 × 17 = 4165. Natijani eslatmaga saqladim.
```

## Telegram bot

Xuddi shu agent Telegramda ham ishlaydi (`telegram_bot.py`). Har bir chat o'z
suhbat tarixiga ega.

Bot sizning kompyuteringizda ishlaydi — kompyuter yoqiq va skript ochiq turganda
bot javob beradi.

1. [Python](https://www.python.org/downloads/) o'rnating (Windows'da o'rnatishda
   **"Add python.exe to PATH"** belgisini qo'ying).
2. Telegramda **@BotFather** → `/token` → botingiz tokenini nusxalang.
3. **`start_bot.bat`** faylini ikki marta bosing (Mac/Linux: `./start_bot.sh`).
   Birinchi marta u `.env` faylini yaratib, Notepad'da ochadi.
4. `.env` ga kalitlarni yozing va saqlang:

```
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_ALLOWED_USERS=
```

5. `start_bot.bat` ni yana ishga tushiring. Botga `/start` yozing — u Telegram ID
   raqamingizni ko'rsatadi.
6. **Muhim:** shu ID ni `.env` dagi `TELEGRAM_ALLOWED_USERS=` ga yozing va botni
   qayta ishga tushiring — aks holda istalgan odam botga yozib, API hisobingizni
   sarflashi mumkin.

Botni to'xtatish: oynani yoping yoki `Ctrl+C` bosing.

Buyruqlar: `/start` — salomlashish, `/reset` — suhbatni tozalash.

> `.env` faylida maxfiy kalitlar bor — uni hech kimga yubormang (u git'ga qo'shilmaydi).
> Eslatmalar (`notes.txt`) hamma foydalanuvchilar uchun umumiy.

### Yangi vosita qo'shish

`agent.py` ichida `@beta_tool` bilan funksiya yozing va uni `TOOLS` ro'yxatiga qo'shing.
Docstring — Claude vositani qachon ishlatishni shundan biladi:

```python
@beta_tool
def get_weather(city: str) -> str:
    """Shahar ob-havosini qaytaradi.

    Args:
        city: Shahar nomi, masalan "Toshkent".
    """
    return "Toshkentda +22°C, quyoshli"
```

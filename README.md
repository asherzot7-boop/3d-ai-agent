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

1. Telegramda **@BotFather** ga yozing → `/newbot` (yoki mavjud botingiz uchun
   `/token`) → bot tokenini nusxalang.
2. Ishga tushiring:

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY="sk-ant-..."
export TELEGRAM_BOT_TOKEN="123456:ABC..."
python telegram_bot.py
```

3. Botga `/start` yozing — u sizning Telegram ID raqamingizni ko'rsatadi.
4. **Muhim:** botni faqat o'zingiz ishlatishingiz uchun ID ni qo'shing va qayta
   ishga tushiring (aks holda istalgan odam yozib, API hisobingizni sarflashi mumkin):

```bash
export TELEGRAM_ALLOWED_USERS="123456789"   # bir nechta: "111,222"
```

Buyruqlar: `/start` — salomlashish, `/reset` — suhbatni tozalash.

> Eslatmalar (`notes.txt`) hamma foydalanuvchilar uchun umumiy.

Bot doimiy ishlashi uchun uni server yoki VPS'da ishga tushiring
(masalan, `nohup python telegram_bot.py &` yoki systemd xizmati).

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

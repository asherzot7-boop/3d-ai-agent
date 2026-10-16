"""Oddiy Claude AI agent (terminalda ishlaydi).

Ishga tushirish:
    pip install -r requirements.txt
    export ANTHROPIC_API_KEY="sk-ant-..."
    python agent.py
"""

import ast
import operator
from datetime import datetime
from pathlib import Path

import anthropic
from anthropic import beta_tool

MODEL = "claude-opus-5-5"
NOTES_FILE = Path(__file__).with_name("notes.txt")

SYSTEM_PROMPT = (
    "Sen foydali va do'stona yordamchi agentsan. Foydalanuvchi qaysi tilda "
    "yozsa, o'sha tilda javob ber. Kerak bo'lganda vositalardan (tools) foydalan."
)


# ---------- Vositalar (tools) ----------
# Har bir funksiya @beta_tool bilan belgilanadi; SDK uning sxemasini
# docstring va turlardan avtomatik yaratadi.

_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
    ast.USub: operator.neg,
}


def _eval(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.left), _eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.operand))
    raise ValueError("Faqat oddiy arifmetika ruxsat etilgan")


@beta_tool
def calculator(expression: str) -> str:
    """Matematik ifodani hisoblaydi.

    Args:
        expression: Arifmetik ifoda, masalan "(12 + 8) * 3 / 2".
    """
    try:
        return str(_eval(ast.parse(expression, mode="eval").body))
    except Exception as e:
        return f"Xato: {e}"


@beta_tool
def current_time() -> str:
    """Hozirgi sana va vaqtni qaytaradi."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


@beta_tool
def save_note(text: str) -> str:
    """Eslatmani notes.txt fayliga saqlaydi.

    Args:
        text: Saqlanadigan eslatma matni.
    """
    with NOTES_FILE.open("a", encoding="utf-8") as f:
        f.write(f"[{datetime.now():%Y-%m-%d %H:%M}] {text}\n")
    return "Saqlandi."


@beta_tool
def read_notes() -> str:
    """Saqlangan barcha eslatmalarni o'qiydi."""
    if not NOTES_FILE.exists():
        return "Hali eslatma yo'q."
    return NOTES_FILE.read_text(encoding="utf-8")


TOOLS = [calculator, current_time, save_note, read_notes]


# ---------- Agent sikli ----------

def ask(client: anthropic.Anthropic, messages: list) -> None:
    """Bitta savolga javob beradi; tool chaqiruvlarini SDK o'zi bajaradi."""
    runner = client.beta.messages.tool_runner(
        model=MODEL,
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        output_config={"effort": "low"},  # oddiy suhbat uchun tez va arzon
        # Xavfsizlik filtri rad etsa, boshqa modelga avtomatik o'tadi
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        tools=TOOLS,
        messages=messages,
    )
    for message in runner:
        # Suhbat tarixini saqlab boramiz (keyingi savollar uchun)
        messages.append({"role": "assistant", "content": message.content})
        tool_response = runner.generate_tool_call_response()
        if tool_response is not None:
            names = [b.name for b in message.content if b.type == "tool_use"]
            print(f"  🔧 vosita: {', '.join(names)}")
            messages.append(tool_response)
        if message.stop_reason == "refusal":
            print("Agent: (so'rov rad etildi)")
            continue
        for block in message.content:
            if block.type == "text" and block.text.strip():
                print(f"Agent: {block.text}")


def main() -> None:
    client = anthropic.Anthropic()  # ANTHROPIC_API_KEY ni o'zi o'qiydi
    messages: list = []
    print("Claude agent tayyor! Chiqish uchun 'exit' yozing.\n")
    while True:
        try:
            user_input = input("Siz: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if user_input.lower() in {"exit", "quit", "chiqish"}:
            break
        if not user_input:
            continue
        start = len(messages)
        messages.append({"role": "user", "content": user_input})
        try:
            ask(client, messages)
        except anthropic.AuthenticationError:
            print("Xato: ANTHROPIC_API_KEY noto'g'ri yoki o'rnatilmagan.")
            del messages[start:]
        except anthropic.RateLimitError:
            print("Xato: limitga yetildi, birozdan keyin urinib ko'ring.")
            del messages[start:]
        except anthropic.APIConnectionError:
            print("Xato: internetga ulanib bo'lmadi.")
            del messages[start:]
        except anthropic.APIStatusError as e:
            print(f"API xatosi ({e.status_code}): {e.message}")
            del messages[start:]
        print()
    print("Xayr!")


if __name__ == "__main__":
    main()

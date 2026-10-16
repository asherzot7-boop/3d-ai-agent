'use strict';
// Malohat in Telegram: long-polling bot (no webhook or public URL needed).
const HISTORY = new Map(); // chat id -> last messages

function startTelegram(token, ai) {
  const base = `https://api.telegram.org/bot${token}/`;
  let offset = 0;
  const tg = async (method, body) => {
    const r = await fetch(base + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!j.ok) throw new Error(method + ': ' + j.description);
    return j.result;
  };
  async function handle(msg) {
    const chat = msg.chat.id, text = (msg.text || '').trim();
    if (!text) return;
    if (text === '/start') {
      HISTORY.delete(chat);
      return tg('sendMessage', { chat_id: chat, text: 'Assalomu alaykum! Men Malohat, Immunolab maslahatchisiman. Narxlar, tahlillarga tayyorgarlik va emlash haqida so‘rang.\n\nЗдравствуйте! Я Малохат, консультант Immunolab. Спросите о ценах, подготовке к анализам и вакцинации.' });
    }
    const h = HISTORY.get(chat) || [];
    h.push({ role: 'user', content: text.slice(0, 1500) });
    await tg('sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => {});
    let answer;
    try { answer = await ai.malohat(h); } catch (e) { answer = 'Извините, сейчас не могу ответить. Позвоните, пожалуйста, в регистратуру.'; console.error('telegram ai:', e.message); }
    h.push({ role: 'assistant', content: answer });
    HISTORY.set(chat, h.slice(-10));
    await tg('sendMessage', { chat_id: chat, text: answer });
  }
  (async function loop() {
    console.log('Telegram: Малохат запущена');
    for (;;) {
      try {
        const updates = await tg('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] });
        for (const u of updates) { offset = u.update_id + 1; if (u.message) handle(u.message).catch(e => console.error('telegram:', e.message)); }
      } catch (e) { console.error('telegram poll:', e.message); await new Promise(r => setTimeout(r, 5000)); }
    }
  })();
}
module.exports = { startTelegram };

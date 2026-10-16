'use strict';
// Claude for the staff app (agents, scanner, dialogue trainer) and for Malohat, the client consultant.
let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk'); } catch (e) { /* npm install not run yet: AI stays off */ }

const MAX_TURNS = 40;

class Ai {
  constructor({ catalog, site }) {
    this.catalog = catalog;
    this.site = site || {};
    this.model = process.env.AI_MODEL || 'claude-opus-5-5';
    this.effort = process.env.AI_EFFORT || 'medium';
    this.client = Anthropic && process.env.ANTHROPIC_API_KEY ? new (Anthropic.default || Anthropic)() : null;
    // server-side refusal fallback: supported on the current Opus / Fable / Sonnet 5.5 models
    this.fallbacks = process.env.AI_FALLBACKS ? process.env.AI_FALLBACKS === '1' : /opus-5|fable-5|sonnet-5-5/.test(this.model);
  }
  get enabled() { return !!this.client; }

  async create({ system, messages, maxTokens, effort }) {
    const req = {
      model: this.model,
      max_tokens: Math.min(Number(maxTokens) || 4000, 16000),
      messages,
      output_config: { effort: effort || this.effort },
    };
    if (system) req.system = system;
    let r;
    if (this.fallbacks) r = await this.client.beta.messages.create({ ...req, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    else r = await this.client.messages.create(req);
    if (r.stop_reason === 'refusal') return 'Извините, на этот вопрос я ответить не могу.';
    return r.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  }

  // body: {messages, system?, images?: [dataURL], json?: bool, maxTokens?}
  async complete(body) {
    const messages = normalize(body.messages);
    if (!messages.length) throw Object.assign(new Error('Пустой запрос'), { status: 400 });
    const images = (Array.isArray(body.images) ? body.images : []).slice(0, 4).map(imageBlock).filter(Boolean);
    if (images.length) {
      const last = messages[messages.length - 1];
      last.content = [...images, { type: 'text', text: textOf(last.content) }];
    }
    let system = typeof body.system === 'string' ? body.system : '';
    if (body.json) system = (system ? system + '\n\n' : '') + 'Верни ответ строго в виде одного JSON-значения, без пояснений и без ```.';
    const text = await this.create({ system, messages, maxTokens: body.maxTokens });
    if (!body.json) return { text };
    const json = parseJson(text);
    if (json === undefined) throw Object.assign(new Error('ИИ вернул не JSON'), { status: 502, code: 'bad_json' });
    return { json };
  }

  malohatSystem(lang) {
    const s = this.site;
    const items = this.catalog().map(i => `- ${i.name}${i.prep ? ' (' + i.prep + ')' : ''}: ${Number(i.price).toLocaleString('ru-RU')} сум${i.time ? ', готовность: ' + i.time : ''}`).join('\n');
    return [
      'Ты Малохат, вежливый консультант медицинского центра Immunolab (Наманган, Узбекистан): лаборатория, клиника, вакцинация.',
      `Отвечай на языке клиента (${lang || 'определи по сообщению'}: русский, узбекский или английский), коротко и тепло, 2–6 предложений.`,
      'Говори только о центре: цены, подготовка к анализам, вакцинация, как записаться, где находимся, часы работы.',
      'Не ставь диагнозы и не назначай лечение. При тревожных симптомах советуй срочно обратиться к врачу или вызвать скорую (103).',
      'Если не знаешь ответа или цены нет в прайсе — честно скажи и предложи позвонить в регистратуру. Не выдумывай цены.',
      `Часы работы: ${s.hours || 'пн–сб 8:00–17:00'}. Адрес: ${s.address || 'уточняйте по телефону'}. Телефон: ${s.phone || 'уточняется'}.`,
      s.telegram ? `Telegram: ${s.telegram}.` : '',
      'Услуги: лабораторные анализы (забор крови, ПЦР, выезд лаборанта на дом), приём невролога и педиатра, процедурный кабинет, вакцинация детей и взрослых.',
      'Оплата: наличные, Humo, Uzcard, QR-код.',
      'Прайс вакцинации (сум):\n' + items,
    ].filter(Boolean).join('\n');
  }

  async malohat(raw, lang) {
    const messages = normalize(raw).slice(-10).map(m => ({ role: m.role, content: textOf(m.content).slice(0, 1500) }));
    if (!messages.length) throw Object.assign(new Error('Пустое сообщение'), { status: 400 });
    return this.create({ system: this.malohatSystem(lang), messages, maxTokens: 1200, effort: process.env.MALOHAT_EFFORT || 'low' });
  }
}

function textOf(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(b => (typeof b === 'string' ? b : b && b.text) || '').join('\n');
  return String(c == null ? '' : c);
}
// user/assistant only, starting with user, same-role turns merged
function normalize(list) {
  if (typeof list === 'string') list = [{ role: 'user', content: list }];
  const out = [];
  for (const m of (Array.isArray(list) ? list : []).slice(-MAX_TURNS)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const t = textOf(m.content);
    if (!t.trim()) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) prev.content += '\n\n' + t; else out.push({ role: m.role, content: t });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}
function imageBlock(url) {
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(url || ''));
  return m ? { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } } : null;
}
function parseJson(text) {
  const t = String(text).replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try { return JSON.parse(t); } catch (e) {}
  const a = t.search(/[[{]/), b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return undefined;
}

module.exports = { Ai, normalize, parseJson, imageBlock };

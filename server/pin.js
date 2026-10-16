// Set a staff PIN code:  npm run pin -- "Каримова Гулчирой" 4821
// List who has one:      npm run pin
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadEnv } = require('./env');

const ROOT = path.resolve(__dirname, '..');
loadEnv(path.join(ROOT, '.env'));
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'storage');
const FILE = path.join(DATA_DIR, 'pins.json');
const people = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'guides.json'), 'utf8')).guides;
let pins = {};
try { pins = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}

const [key, pin] = process.argv.slice(2);
if (!key) {
  for (const p of people) console.log((pins[p.key] ? '✔ ' : '  ') + p.key + ' — ' + p.role);
  console.log('\nЗадать PIN: npm run pin -- "<имя из списка>" <PIN из 4–8 цифр>');
  process.exit(0);
}
const p = people.find(x => x.key === key);
if (!p) { console.error('Нет такого сотрудника: ' + key); process.exit(1); }
if (pin === '--remove') delete pins[key];
else if (!/^\d{4,8}$/.test(pin || '')) { console.error('PIN — от 4 до 8 цифр'); process.exit(1); }
else pins[key] = crypto.createHash('sha256').update(pin).digest('hex');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(FILE, JSON.stringify(pins, null, 1));
console.log(pin === '--remove' ? 'PIN удалён: ' + key : 'PIN сохранён: ' + key);

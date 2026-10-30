import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader: real environment variables always win.
export function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

export const ASPECTS = {
  '16:9': { w: 1920, h: 1080, runwayImage: '1920:1080', runwayVideo: '1280:720' },
  '9:16': { w: 1080, h: 1920, runwayImage: '1080:1920', runwayVideo: '720:1280' },
  '1:1': { w: 1080, h: 1080, runwayImage: '1024:1024', runwayVideo: '960:960' },
};

export function projectDir(arg) {
  if (!arg) throw new Error('Loyiha papkasini ko\'rsating, masalan: projects/namuna-qahvaxona');
  const dir = path.resolve(arg);
  if (!fs.existsSync(path.join(dir, 'storyboard.json')))
    throw new Error(`${dir}/storyboard.json topilmadi`);
  return dir;
}

export function loadStoryboard(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'storyboard.json'), 'utf8'));
}

export const sceneName = i => `scene-${String(i + 1).padStart(2, '0')}`;

export function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '', err = '';
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (err += d));
    p.on('error', reject);
    p.on('close', code =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} ${code} bilan tugadi:\n${err.slice(-2000)}`)));
  });
}

export const ffmpeg = (args, opts) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], opts);

export async function duration(file) {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return parseFloat(out);
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Yuklab bo'lmadi (${res.status}): ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} o'rnatilmagan. video-office/.env fayliga qo'shing yoki --provider mock ishlating.`);
  return v;
}

export const log = (...a) => console.log('›', ...a);

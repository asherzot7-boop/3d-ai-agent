// visual_prompt per scene → clips/scene-NN.mp4
// Runway: text → keyframe image (gen4_image) → image-to-video (gen4_turbo).
// Providers:
//   free   — Flux keyframe (Pollinations, no key) + Ken Burns camera motion. Costs nothing.
//   runway — text → keyframe (gen4_image) → image-to-video (gen4_turbo). Paid.
//   mock   — placeholder cards, offline.
// A scene can skip the image step by giving its own "image" (local path; runway also takes https URL).
// A clip already present in clips/ (e.g. downloaded from Kling/Hailuo free credits) is kept as is.
// Usage: node tools/gen-clip.mjs <project> [--provider free|runway|mock] [--scene N] [--force]
import fs from 'node:fs';
import path from 'node:path';
import {
  ASPECTS, download, duration, ffmpeg, loadEnv, loadStoryboard, log, parseArgs, projectDir,
  requireEnv, sceneName, sleep,
} from '../lib/util.mjs';

const RUNWAY = 'https://api.dev.runwayml.com/v1';

async function runway(endpoint, body) {
  const headers = {
    Authorization: `Bearer ${requireEnv('RUNWAY_API_KEY')}`,
    'X-Runway-Version': '2024-11-06',
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${RUNWAY}/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Runway ${endpoint} ${res.status}: ${await res.text()}`);
  const { id } = await res.json();
  for (let waited = 0; waited < 15 * 60_000; waited += 5000) {
    await sleep(5000);
    const t = await (await fetch(`${RUNWAY}/tasks/${id}`, { headers })).json();
    if (t.status === 'SUCCEEDED') return t.output[0];
    if (t.status === 'FAILED' || t.status === 'CANCELLED')
      throw new Error(`Runway vazifasi ${t.status}: ${t.failure || ''} ${t.failureCode || ''}`);
  }
  throw new Error(`Runway vazifasi ${id} 15 daqiqada tugamadi`);
}

function imageInput(image, dir) {
  if (/^https?:\/\//.test(image)) return image;
  const file = path.resolve(dir, image);
  const ext = path.extname(file).slice(1).replace('jpg', 'jpeg');
  return `data:image/${ext};base64,${fs.readFileSync(file).toString('base64')}`;
}

async function runwayClip(scene, ratio, seconds, dir, dest) {
  const style = scene.style ? `, ${scene.style}` : '';
  const image = scene.image
    ? imageInput(scene.image, dir)
    : await runway('text_to_image', {
      model: process.env.RUNWAY_IMAGE_MODEL || 'gen4_image',
      promptText: (scene.visual_prompt + style).slice(0, 1000),
      ratio: ratio.runwayImage,
    });
  const url = await runway('image_to_video', {
    model: process.env.RUNWAY_VIDEO_MODEL || 'gen4_turbo',
    promptImage: image,
    promptText: (scene.motion_prompt || scene.visual_prompt).slice(0, 1000),
    ratio: ratio.runwayVideo,
    duration: seconds,
  });
  await download(url, dest);
}

// Free: Flux keyframe from Pollinations (no key) → cinematic Ken Burns motion with ffmpeg.
async function pollinationsImage(scene, i, ratio, dest) {
  const prompt = [scene.visual_prompt, scene.style, 'highly detailed, sharp focus, professional photography']
    .filter(Boolean).join(', ');
  const params = new URLSearchParams({
    width: ratio.w, height: ratio.h, model: process.env.POLLINATIONS_MODEL || 'flux',
    nologo: 'true', enhance: 'true', seed: String(scene.seed ?? 1000 + i),
  });
  const headers = process.env.POLLINATIONS_TOKEN ? { Authorization: `Bearer ${process.env.POLLINATIONS_TOKEN}` } : {};
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 1500))}?${params}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (e) {
      if (attempt >= 4) throw new Error(`Pollinations rasm bermadi: ${e.message}`);
      log(`  rasm qayta so'ralmoqda (${attempt}/3): ${e.message}`);
      await sleep(15_000 * attempt); // free tier is rate-limited
    }
  }
}

// Picks a camera move from motion_prompt keywords, otherwise cycles through moves.
const MOVES = ['in', 'right', 'out', 'left', 'up'];
function pickMove(scene, i) {
  const m = (scene.motion_prompt || '').toLowerCase();
  if (/pull[- ]?back|zoom[- ]?out|reveal/.test(m)) return 'out';
  if (/push[- ]?in|zoom[- ]?in|close/.test(m)) return 'in';
  if (/left/.test(m)) return 'left';
  if (/right|slide|pan/.test(m)) return 'right';
  if (/up|rise|tilt/.test(m)) return 'up';
  return MOVES[i % MOVES.length];
}

export async function kenBurns(image, move, ratio, seconds, dest) {
  const fps = 30, frames = Math.round(seconds * fps), { w, h } = ratio;
  const p = `(on/${frames})`; // 0 → 1 progress
  const ease = `(0.5-0.5*cos(PI*${p}))`; // smooth start and stop
  const z = { in: `1+0.18*${ease}`, out: `1.18-0.18*${ease}` }[move] || '1.12';
  const cx = 'iw/2-(iw/zoom/2)', cy = 'ih/2-(ih/zoom/2)';
  const x = { left: `(iw-iw/zoom)*(1-${ease})`, right: `(iw-iw/zoom)*${ease}` }[move] || cx;
  const y = move === 'up' ? `(ih-ih/zoom)*(1-${ease})` : cy;
  // Upscale 3x before zoompan so the sub-pixel motion stays smooth instead of jittering.
  await ffmpeg([
    '-loop', '1', '-i', image,
    '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},scale=${w * 3}:${h * 3}:flags=lanczos,` +
      `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps},` +
      `eq=contrast=1.04:saturation=1.08,vignette=PI/6,format=yuv420p`,
    '-frames:v', String(frames), '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', dest,
  ]);
}

async function freeClip(scene, i, ratio, seconds, dir, dest) {
  let image = scene.image && path.resolve(dir, scene.image);
  if (!image) {
    fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
    image = path.join(dir, 'images', `${sceneName(i)}.jpg`);
    if (!fs.existsSync(image)) await pollinationsImage(scene, i, ratio, image);
  }
  await kenBurns(image, pickMove(scene, i), ratio, seconds, dest);
}

// Offline stand-in: coloured card with the scene's prompt, so the whole pipeline can be tested free.
const COLORS = ['0x1f3a5f', '0x5f1f3a', '0x1f5f3a', '0x5f4a1f', '0x3a1f5f', '0x1f5a5f'];
async function mockClip(scene, i, ratio, seconds, dest) {
  const txt = dest.replace(/\.mp4$/, '.txt');
  const wrapped = scene.visual_prompt.replace(/(.{1,42})(\s|$)/g, '$1\n').trim();
  fs.writeFileSync(txt, `SAHNA ${i + 1}\n\n${wrapped}`);
  const fontsize = Math.round(ratio.w / 36);
  await ffmpeg([
    '-f', 'lavfi', '-i', `color=c=${COLORS[i % COLORS.length]}:s=${ratio.w}x${ratio.h}:r=30:d=${seconds}`,
    '-vf', `drawtext=textfile='${txt}':fontcolor=white:fontsize=${fontsize}:line_spacing=12:` +
      `x=(w-text_w)/2:y=(h-text_h)/2`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', dest,
  ]);
  fs.rmSync(txt);
}

export async function genClips(dir, { provider = 'free', scene, force } = {}) {
  const sb = loadStoryboard(dir);
  const ratio = ASPECTS[sb.aspect];
  fs.mkdirSync(path.join(dir, 'clips'), { recursive: true });
  for (const [i, s] of sb.scenes.entries()) {
    if (scene && Number(scene) !== i + 1) continue;
    const dest = path.join(dir, 'clips', `${sceneName(i)}.mp4`);
    if (fs.existsSync(dest) && !force) { log(`${sceneName(i)}: klip bor, o'tkazildi`); continue; }
    // Clip must cover the narration; Runway only renders 5s or 10s clips.
    const voice = path.join(dir, 'audio', `${sceneName(i)}.mp3`);
    const need = Math.max(s.duration || 5, fs.existsSync(voice) ? (await duration(voice)) + 0.5 : 0);
    const seconds = provider === 'free' ? Math.ceil(need) : need > 5 ? 10 : 5;
    log(`${sceneName(i)}: klip yaratilmoqda (${provider}, ${seconds}s)`);
    if (provider === 'mock') await mockClip(s, i, ratio, seconds, dest);
    else if (provider === 'free') await freeClip(s, i, ratio, seconds, dir, dest);
    else await runwayClip(s, ratio, seconds, dir, dest);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  const a = parseArgs();
  await genClips(projectDir(a._[0]), a);
}

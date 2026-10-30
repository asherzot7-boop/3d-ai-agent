// visual_prompt per scene → clips/scene-NN.mp4
// Runway: text → keyframe image (gen4_image) → image-to-video (gen4_turbo).
// A scene can skip the image step by giving its own "image" (local path or https URL).
// Usage: node tools/gen-clip.mjs <project> [--provider runway|mock] [--scene N] [--force]
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

export async function genClips(dir, { provider = 'runway', scene, force } = {}) {
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
    const seconds = need > 5 ? 10 : 5;
    log(`${sceneName(i)}: klip yaratilmoqda (${provider}, ${seconds}s)`);
    if (provider === 'mock') await mockClip(s, i, ratio, seconds, dest);
    else await runwayClip(s, ratio, seconds, dir, dest);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  const a = parseArgs();
  await genClips(projectDir(a._[0]), a);
}

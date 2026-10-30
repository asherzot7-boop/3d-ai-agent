// Narration per scene → audio/scene-NN.mp3
// Usage: node tools/gen-voice.mjs <project> [--provider elevenlabs|mock] [--scene N] [--force]
import fs from 'node:fs';
import path from 'node:path';
import {
  ffmpeg, loadEnv, loadStoryboard, log, parseArgs, projectDir, requireEnv, sceneName,
} from '../lib/util.mjs';

async function elevenlabs(text, dest, voiceId) {
  const key = requireEnv('ELEVENLABS_API_KEY');
  const voice = voiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

// Offline stand-in: silence whose length approximates speaking time (~2.5 words/s).
async function mock(text, dest) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const secs = Math.max(1, words / 2.5).toFixed(2);
  await ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', secs, '-q:a', '4', dest]);
}

export async function genVoice(dir, { provider = 'elevenlabs', scene, force } = {}) {
  const sb = loadStoryboard(dir);
  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
  for (const [i, s] of sb.scenes.entries()) {
    if (scene && Number(scene) !== i + 1) continue;
    const dest = path.join(dir, 'audio', `${sceneName(i)}.mp3`);
    if (!s.narration?.trim()) { fs.rmSync(dest, { force: true }); continue; }
    if (fs.existsSync(dest) && !force) { log(`${sceneName(i)}: ovoz bor, o'tkazildi`); continue; }
    log(`${sceneName(i)}: ovoz yozilmoqda (${provider})`);
    if (provider === 'mock') await mock(s.narration, dest);
    else await elevenlabs(s.narration, dest, sb.voice_id);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  const a = parseArgs();
  await genVoice(projectDir(a._[0]), a);
}

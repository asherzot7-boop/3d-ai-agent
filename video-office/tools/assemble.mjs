// clips + audio → final.mp4 (with burned-in subtitles, optional background music, loudness normalised)
// Usage: node tools/assemble.mjs <project>
import fs from 'node:fs';
import path from 'node:path';
import {
  ASPECTS, duration, ffmpeg, loadStoryboard, log, parseArgs, projectDir, sceneName,
} from '../lib/util.mjs';

const srtTime = t => {
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

// Split narration into ~8-word captions spread proportionally over the spoken time.
function captions(text, start, spoken) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; i += 8) {
    const chunk = words.slice(i, i + 8);
    const a = start + (i / words.length) * spoken;
    const b = start + (Math.min(i + 8, words.length) / words.length) * spoken;
    out.push({ a, b, text: chunk.join(' ') });
  }
  return out;
}

export async function assemble(dir) {
  const sb = loadStoryboard(dir);
  const { w, h } = ASPECTS[sb.aspect];
  const build = path.join(dir, 'build');
  fs.mkdirSync(build, { recursive: true });

  const segments = [];
  const subs = [];
  let t = 0;
  for (const [i, s] of sb.scenes.entries()) {
    const name = sceneName(i);
    const clip = path.join(dir, 'clips', `${name}.mp4`);
    const voice = path.join(dir, 'audio', `${name}.mp3`);
    if (!fs.existsSync(clip)) throw new Error(`${name}: klip yo'q (${clip})`);
    const hasVoice = fs.existsSync(voice);
    const spoken = hasVoice ? await duration(voice) : 0;
    const len = Math.max(s.duration || 0, hasVoice ? spoken + 0.4 : 5);

    const seg = path.join(build, `${name}.mp4`);
    log(`${name}: ${len.toFixed(1)}s segment`);
    await ffmpeg([
      '-i', clip,
      ...(hasVoice ? ['-i', voice] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo']),
      '-filter_complex',
      `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=30,setsar=1,` +
        `tpad=stop_mode=clone:stop_duration=${Math.ceil(len)},trim=duration=${len},setpts=PTS-STARTPTS[v];` +
        `[1:a]aresample=44100,aformat=channel_layouts=stereo,apad,atrim=duration=${len}[a]`,
      '-map', '[v]', '-map', '[a]', '-t', String(len),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', seg,
    ]);
    segments.push(seg);
    if (hasVoice) subs.push(...captions(s.narration, t, spoken));
    t += len;
  }

  fs.writeFileSync(path.join(build, 'list.txt'), segments.map(f => `file '${f}'`).join('\n'));
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'joined.mp4'], { cwd: build });

  fs.writeFileSync(
    path.join(build, 'subs.srt'),
    subs.map((c, k) => `${k + 1}\n${srtTime(c.a)} --> ${srtTime(c.b)}\n${c.text}\n`).join('\n'),
  );
  const vertical = sb.aspect === '9:16';
  const vf = sb.subtitles === false || subs.length === 0 ? 'null'
    : `subtitles=subs.srt:force_style='FontName=DejaVu Sans,FontSize=${vertical ? 11 : 16},Bold=1,` +
      `Outline=2,Shadow=0,MarginV=${vertical ? 60 : 30}'`;

  const music = sb.music && path.resolve(dir, sb.music);
  const musicArgs = music && fs.existsSync(music) ? ['-stream_loop', '-1', '-i', music] : [];
  const fadeAt = Math.max(0, t - 1.5).toFixed(2);
  const af = musicArgs.length
    ? `[1:a]volume=${sb.music_volume ?? 0.15},afade=t=out:st=${fadeAt}:d=1.5[m];` +
      `[0:a][m]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5[a]`
    : '[0:a]loudnorm=I=-14:TP=-1.5[a]';

  const out = path.join(dir, 'final.mp4');
  await ffmpeg([
    '-i', 'joined.mp4', ...musicArgs,
    '-filter_complex', `[0:v]${vf}[v];${af}`,
    '-map', '[v]', '-map', '[a]', '-t', String(t),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-movflags', '+faststart', out,
  ], { cwd: build });
  log(`Tayyor: ${out} (${t.toFixed(1)}s)`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await assemble(projectDir(parseArgs()._[0]));
}

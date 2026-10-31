// Runs every production step for one project: validate → voice → clips → assemble.
// Usage: node pipeline.mjs <project> [--provider free|paid|mock] [--force]
//   --provider free   (default) Edge neural voice + Flux images with Ken Burns motion. $0.
//   --provider paid   ElevenLabs voice + Runway Gen-4 video (API keys required)
//   --provider mock   offline: silent voice + placeholder cards (for testing)
//   --force           regenerate voice and clips even if they already exist
import { genClips } from './tools/gen-clip.mjs';
import { genVoice } from './tools/gen-voice.mjs';
import { assemble } from './tools/assemble.mjs';
import { validate } from './tools/validate.mjs';
import { loadEnv, loadStoryboard, log, parseArgs, projectDir } from './lib/util.mjs';

loadEnv();
const a = parseArgs();
const dir = projectDir(a._[0]);
const provider = a.provider || 'free';
const VOICE = { free: 'edge', paid: 'elevenlabs', mock: 'mock' };
const CLIPS = { free: 'free', paid: 'runway', mock: 'mock' };
if (!VOICE[provider]) throw new Error(`--provider free | paid | mock bo'lishi kerak`);

const errors = validate(loadStoryboard(dir));
if (errors.length) {
  console.error('Storyboard xatolari:\n- ' + errors.join('\n- '));
  process.exit(1);
}

log('1/3 Ovoz');
await genVoice(dir, { provider: VOICE[provider], force: a.force });
log('2/3 Video kliplar');
await genClips(dir, { provider: CLIPS[provider], force: a.force });
log('3/3 Montaj');
await assemble(dir);

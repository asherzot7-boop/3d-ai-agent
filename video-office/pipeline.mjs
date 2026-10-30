// Runs every production step for one project: validate → voice → clips → assemble.
// Usage: node pipeline.mjs <project> [--provider mock] [--force]
//   --provider mock   no API calls, no cost: silent voice + placeholder cards (for testing)
//   --force           regenerate voice and clips even if they already exist
import { genClips } from './tools/gen-clip.mjs';
import { genVoice } from './tools/gen-voice.mjs';
import { assemble } from './tools/assemble.mjs';
import { validate } from './tools/validate.mjs';
import { loadEnv, loadStoryboard, log, parseArgs, projectDir } from './lib/util.mjs';

loadEnv();
const a = parseArgs();
const dir = projectDir(a._[0]);
const mock = a.provider === 'mock';

const errors = validate(loadStoryboard(dir));
if (errors.length) {
  console.error('Storyboard xatolari:\n- ' + errors.join('\n- '));
  process.exit(1);
}

log('1/3 Ovoz');
await genVoice(dir, { provider: mock ? 'mock' : 'elevenlabs', force: a.force });
log('2/3 Video kliplar');
await genClips(dir, { provider: mock ? 'mock' : 'runway', force: a.force });
log('3/3 Montaj');
await assemble(dir);

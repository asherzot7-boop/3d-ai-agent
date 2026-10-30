// Checks storyboard.json before any paid API call is made.
import { ASPECTS, loadStoryboard, parseArgs, projectDir } from '../lib/util.mjs';

export function validate(sb) {
  const errors = [];
  if (!sb.title) errors.push('title yo\'q');
  if (!ASPECTS[sb.aspect]) errors.push(`aspect ${Object.keys(ASPECTS).join(' | ')} bo'lishi kerak`);
  if (!Array.isArray(sb.scenes) || sb.scenes.length === 0) errors.push('scenes bo\'sh');
  (sb.scenes || []).forEach((s, i) => {
    const n = `scenes[${i}]`;
    if (!s.visual_prompt || s.visual_prompt.length < 20) errors.push(`${n}.visual_prompt juda qisqa`);
    if (s.visual_prompt?.length > 1000) errors.push(`${n}.visual_prompt 1000 belgidan oshmasin`);
    if (typeof s.narration !== 'string') errors.push(`${n}.narration yo'q (ovozsiz sahna uchun "" yozing)`);
    if (s.duration !== undefined && !(s.duration >= 2 && s.duration <= 10))
      errors.push(`${n}.duration 2–10 soniya oralig'ida bo'lsin`);
  });
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = projectDir(parseArgs()._[0]);
  const errors = validate(loadStoryboard(dir));
  if (errors.length) {
    console.error('Storyboard xatolari:\n- ' + errors.join('\n- '));
    process.exit(1);
  }
  console.log('storyboard.json to\'g\'ri ✓');
}

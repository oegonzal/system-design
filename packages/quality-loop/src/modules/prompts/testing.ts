/**
 * A prompt library on disk, of the suite's own: two prompts at the root, one
 * in a subdirectory, a file that is not a prompt, and a directory whose name
 * ends in `.md` — the walk must find the first three and mistake neither of
 * the last two for a document. Pure helpers only — no vitest imports.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const seedPromptLibrary = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'sysdesign-quality-loop-prompts-'));
  writeFileSync(join(dir, 'zebra.md'), '\n# Stripe the zebra\n\nBody.\n');
  writeFileSync(join(dir, 'apple.md'), 'No heading here, just a goal.\n');
  writeFileSync(join(dir, 'notes.txt'), '# Not a prompt\n');
  mkdirSync(join(dir, 'agentic'));
  writeFileSync(join(dir, 'agentic', 'nested.md'), '# Nested one\n\nBody.\n');
  mkdirSync(join(dir, 'trap.md'));
  return dir;
};

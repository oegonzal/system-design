import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The scoring path must decide on STRUCTURE, never on prose.
 *
 * A score that depends on whether a sentence happens to contain "search" is
 * hostage to wording: rewording a requirement silently switches a rule off,
 * and free text appended by prompt enrichment switches one on. Every such gate
 * now reads `facts.functionalCapabilities`, a closed vocabulary declared beside
 * the sentence by the bank that writes it.
 *
 * `functionalText` still exists — LLM passes serialize it so a critic reads
 * what the author read — but a scoring predicate may never touch it. This is
 * the gate that keeps it that way.
 */
const REPO = join(__dirname, '..');
const SCORING_ROOTS = [
  'packages/eval-worker/src/engine/rules',
  'packages/eval-worker/src/engine/passes/expectations',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!path.endsWith('.ts') || path.endsWith('.spec.ts')) return [];
    return [path];
  });
}

describe('grounded scoring', () => {
  const files = SCORING_ROOTS.flatMap((root) => sourceFiles(join(REPO, root)));

  it('finds the scoring sources it is meant to guard', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('no rule or expectation reads the prompt as prose', () => {
    const offenders = files.filter((path) => readFileSync(path, 'utf8').includes('functionalText'));
    expect(offenders.map((path) => path.slice(REPO.length + 1))).toEqual([]);
  });

  it('applicability gates branch on the typed capability vocabulary instead', () => {
    const gated = files.filter((path) =>
      readFileSync(path, 'utf8').includes('functionalCapabilities'),
    );
    // The five probes that used to grep prose; if this drops, a gate was lost.
    expect(gated.length).toBeGreaterThanOrEqual(4);
  });
});

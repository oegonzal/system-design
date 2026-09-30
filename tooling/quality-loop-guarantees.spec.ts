import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The quality loop's structural guarantees, pinned at the source level.
 *
 * The doctrine's strongest rule is that a model may produce evidence and
 * recommendations while the system owns validation, thresholds, routing and
 * the final decision. The package's types make most of that impossible; this
 * gate keeps the few places a refactor could quietly undo it under watch.
 */
const REPO = join(__dirname, '..');
const CORE = join(REPO, 'packages/quality-loop/src/core');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!path.endsWith('.ts') || path.endsWith('.spec.ts')) return [];
    return [path];
  });
}

const relative = (path: string): string => path.slice(REPO.length + 1);
const read = (path: string): string => readFileSync(path, 'utf8');

describe('quality-loop guarantees', () => {
  const files = sourceFiles(CORE);

  it('finds the core it is meant to guard', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it('no schema a model answers carries a number', () => {
    const modelFacing = files.filter((path) => /\/core\/(schemas\.ts|stages\/)/.test(path));
    expect(modelFacing.length).toBeGreaterThan(4);
    const offenders = modelFacing.filter((path) =>
      /z\.(number|int|coerce|float)\b/.test(read(path)),
    );
    expect(offenders.map(relative)).toEqual([]);
  });

  it('the normalizer, every controller and the reconcile never read prose, the goal or the advisory verdict', () => {
    const guarded = files.filter(
      (path) =>
        /\/core\/(evidence\/normalize|outputs\/reconcile|loop\/rubric|controllers\/[^/]+)\.ts$/.test(
          path,
        ) && !path.endsWith('.spec.ts'),
    );
    // the normaliser, the reconcile, the rubric check, then the controller library: context, composer, gates, floor, index
    expect(guarded).toHaveLength(8);
    const offenders = guarded.filter((path) =>
      /\bgoal\b|rationale|statement|advisoryVerdict|render\(|\.message\b|\.note\b/.test(read(path)),
    );
    expect(offenders.map(relative)).toEqual([]);
  });

  it('the core has no clock, randomness or filesystem of its own', () => {
    const offenders = files.filter((path) =>
      /Date\.now|Math\.random|node:fs|process\.env/.test(read(path)),
    );
    expect(offenders.map(relative)).toEqual([]);
  });

  it('the goal reaches the model through the prompting module only', () => {
    const readers = files.filter(
      (path) => /goalSection\(/.test(read(path)) && !path.endsWith('prompting.ts'),
    );
    expect(readers.map(relative).sort()).toEqual(
      [
        'packages/quality-loop/src/core/stages/derive-criteria.ts',
        'packages/quality-loop/src/core/stages/llm-critic.ts',
        'packages/quality-loop/src/core/stages/llm-evaluator.ts',
        'packages/quality-loop/src/core/stages/llm-producer.ts',
      ].sort(),
    );
  });
});

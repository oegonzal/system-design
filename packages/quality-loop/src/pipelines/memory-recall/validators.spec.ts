import { describe, expect, it } from 'vitest';

import type { TaskContract } from '../../core/contracts';
import { contractOf } from '../../core/testing';
import { MEMORY_RECALL } from './definition';
import { renderGoal } from './input';
import type { MemoryPack } from './output';
import { samplePack, sampleQuery } from './testing';
import { limitsValidator, referencesValidator } from './validators';

const contract = (goal = renderGoal(sampleQuery())): TaskContract<MemoryPack> =>
  contractOf(MEMORY_RECALL.task, goal);

const messages = (artifact: MemoryPack, goal?: string) => ({
  references: referencesValidator.validate(artifact, contract(goal)).problems.map((p) => p.message),
  limits: limitsValidator.validate(artifact, contract(goal)).problems.map((p) => p.message),
});

describe('the memory-recall validators', () => {
  it('[QL-3] a pack with one verdict per listed candidate passes both', () => {
    expect(messages(samplePack())).toEqual({ references: [], limits: [] });
    expect(referencesValidator.gate).toBe('block');
    expect(limitsValidator.gate).toBe('block');
  });

  it('[QL-3] an alias that was never recalled, or judged twice, blocks', () => {
    const unknown = samplePack({ dropped: [{ chunk: 'm9', reason: 'made up' }] });
    expect(messages(unknown).references).toEqual(['m9 is not a listed candidate']);
    const twice = samplePack({
      dropped: [
        { chunk: 'm1', reason: 'also dropped' },
        { chunk: 'm3', reason: 'unrelated' },
      ],
    });
    expect(messages(twice).references).toEqual(['m1 is given more than one verdict']);
    expect(referencesValidator.validate(twice, contract()).problems[0].locationRefs).toEqual([
      'm1',
    ]);
  });

  it('[QL-3] a candidate left without a verdict, or a pack over its limit, blocks', () => {
    const silent = samplePack({ dropped: [] });
    expect(messages(silent).limits).toEqual(['m3 has no verdict']);
    const over = samplePack({
      kept: [
        ...samplePack().kept,
        { chunk: 'm3', serves: 'nothing', cites: [], insight: 'dedupe by event id', caveat: null },
      ],
      dropped: [],
    });
    expect(messages(over).limits).toEqual(['3 chunks kept; the limit is 2']);
  });

  it('[QL-55] a kept chunk cites only the defects the query listed, each once', () => {
    const focused = renderGoal(sampleQuery({ focus: ['the read path has one store behind it'] }));
    const [first, second] = samplePack().kept;
    const citing = (cites: string[]) => samplePack({ kept: [{ ...first, cites }, second] });
    expect(messages(citing(['d1']), focused).references).toEqual([]);
    expect(messages(citing(['d2']), focused).references).toEqual([
      'm1 cites d2, which is not a listed defect',
    ]);
    expect(messages(citing(['d1', 'd1']), focused).references).toEqual([
      'm1 cites d1 more than once',
    ]);
    // A query focused on nothing lists no defect to cite.
    expect(messages(citing(['d1'])).references).toEqual([
      'm1 cites d1, which is not a listed defect',
    ]);
  });

  it("[QL-55] a label of the query or of the curator's rubric in a kept chunk's words blocks, located at the chunk; a candidate alias or a lookalike does not", () => {
    const goal = renderGoal(
      sampleQuery({ focus: ['one store'], known: ['add a cache in front of the store'] }),
    );
    const [first, second] = samplePack().kept;
    const pack = samplePack({
      kept: [
        { ...first, serves: 'd1/c2 — the read path', caveat: 'k1 already holds it; see p1' },
        { ...second, insight: 'like m1, holds p99 under 50 ms' },
      ],
    });
    const criteria = [{ id: 'c2', kind: 'need', statement: 'serve the list when the POS is down' }];
    const report = referencesValidator.validate(
      pack,
      contractOf(MEMORY_RECALL.task, goal, criteria),
    );
    expect(report.problems.map((p) => [p.message, p.locationRefs])).toEqual([
      [
        "m1's serves names d1, c2: the reader of the pack never sees the query's labels — say the need in words, and cite a listed defect in cites",
        ['m1'],
      ],
      [
        "m1's caveat names k1, p1: the reader of the pack never sees the query's labels — say the need in words, and cite a listed defect in cites",
        ['m1'],
      ],
    ]);
  });

  it('[QL-3] a goal without an index blocks once; an ill-formed artifact is left to the schema validator', () => {
    const plain = 'Just a prompt, no candidates.';
    expect(messages(samplePack(), plain)).toEqual({
      references: ['the goal carries no memory-recall index'],
      limits: [],
    });
    const broken = { summary: 'x' } as unknown as MemoryPack;
    expect(messages(broken)).toEqual({ references: [], limits: [] });
  });
});

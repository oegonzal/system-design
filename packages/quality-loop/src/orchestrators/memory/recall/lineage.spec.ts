import type { AdoptedIterationRef } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { linkLabel, MAX_LINEAGE_DEPTH, resolveLineage } from './lineage';

/** A lookup over recorded adoptions, counting the runs it was asked about. */
const recorded = (adoptions: Record<string, AdoptedIterationRef | null>) => {
  const asked: string[] = [];
  const lookup = (runId: string) => {
    asked.push(runId);
    return Promise.resolve(adoptions[runId] ?? null);
  };
  return { asked, lookup };
};

describe('the chain an adopted answer descends from', () => {
  it('[QL-51] walks from the base through what each run adopted, one recorded run read per link', async () => {
    const { asked, lookup } = recorded({
      coach: { runId: 'grade', iteration: 1 },
      grade: null,
    });
    const chain = await resolveLineage(
      { runId: 'sibling', iteration: 2 },
      { runId: 'coach', iteration: 3 },
      lookup,
    );
    expect(chain.map(linkLabel)).toEqual(['sibling@2', 'coach@3', 'grade@1']);
    expect(asked).toEqual(['coach', 'grade']);
  });

  it('[QL-51] a base that adopted nothing is the whole chain, and nothing is read', async () => {
    const { asked, lookup } = recorded({});
    expect(await resolveLineage({ runId: 'grade', iteration: 1 }, null, lookup)).toEqual([
      { runId: 'grade', iteration: 1 },
    ]);
    expect(asked).toEqual([]);
  });

  it('[QL-51] stops at a run already walked and at the depth, so a loop in the records never hangs a recall', async () => {
    const looped = recorded({ a: { runId: 'b', iteration: 1 }, b: { runId: 'a', iteration: 1 } });
    const loop = await resolveLineage(
      { runId: 'a', iteration: 2 },
      { runId: 'b', iteration: 1 },
      looped.lookup,
    );
    expect(loop.map(linkLabel)).toEqual(['a@2', 'b@1']);

    const long = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `r${index}`,
        { runId: `r${index + 1}`, iteration: 1 },
      ]),
    );
    const deep = await resolveLineage(
      { runId: 'base', iteration: 1 },
      { runId: 'r0', iteration: 1 },
      recorded(long).lookup,
    );
    expect(deep).toHaveLength(MAX_LINEAGE_DEPTH);
  });
});

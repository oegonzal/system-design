import { DEFAULT_BEHAVIORS } from '../kinds/behaviors';
import { failingEmbedder, tableEmbedder } from '../testing/fakes';
import { InMemoryVectorIndex } from '../testing/in-memory-vector-index';
import { spaceUnderTest } from '../testing/space-under-test';
import { remember } from '../write/write';
import { sweep } from './sweep';

const TENANT = { tenant: 't1' };
const SOURCE = { source: 'agent', sourceRunId: 'run-1' };
const fact = (subject: string) => ({
  register: 'facts',
  scope: TENANT,
  candidate: { subject, predicate: 'language', value: 'TypeScript', validFrom: null },
  provenance: SOURCE,
  metadata: {},
});

describe('the sweep', () => {
  it('[AGM-9] expires a short-term note once its time to live has passed, by the clock it is handed', async () => {
    const { ctx, clock, records } = spaceUnderTest();
    await remember(ctx, {
      register: 'notes',
      scope: TENANT,
      candidate: { key: 'k', value: 'v' },
      provenance: SOURCE,
      metadata: {},
    });
    clock.advance(599_000);
    expect((await sweep(ctx.ports, DEFAULT_BEHAVIORS)).expired).toBe(0);
    clock.advance(2_000);
    expect((await sweep(ctx.ports, DEFAULT_BEHAVIORS)).expired).toBe(1);
    expect(records.all().map((row) => row.status)).toEqual(['expired']);
  });

  it('[AGM-9] removes the points of records that closed, and projects what a failed write left behind', async () => {
    const { ctx, records, index } = spaceUnderTest({ embedder: failingEmbedder('spec-model', 4) });
    const { record } = await remember(ctx, fact('acme'));
    expect(index.ids()).toEqual([]);
    const working = {
      ...ctx.ports,
      embedder: tableEmbedder({ model: 'spec-model', dimensions: 4 }),
    };
    expect(await sweep(working, DEFAULT_BEHAVIORS)).toMatchObject({ projected: 1, failed: null });
    expect(index.ids()).toEqual([record.id]);

    await records.close(record.id, {
      status: 'invalidated',
      validTo: new Date(),
      closedAt: new Date(),
      reason: 'spec',
    });
    expect(await sweep(working, DEFAULT_BEHAVIORS)).toMatchObject({ unprojected: 1, projected: 0 });
    expect(index.ids()).toEqual([]);
  });

  it('[AGM-9] fills a new collection when the embedding model changes', async () => {
    const { ctx, index } = spaceUnderTest();
    await remember(ctx, fact('acme'));
    await remember(ctx, fact('globex'));
    expect(index.ids()).toHaveLength(2);
    const next = new InMemoryVectorIndex('spec__next-model');
    const moved = {
      ...ctx.ports,
      index: next,
      embedder: tableEmbedder({ model: 'next-model', dimensions: 8 }),
    };
    expect(await sweep(moved, DEFAULT_BEHAVIORS)).toMatchObject({ projected: 2 });
    expect(next.ids()).toHaveLength(2);
  });
});

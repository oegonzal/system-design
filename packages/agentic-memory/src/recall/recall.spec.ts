import type { VectorIndex } from '../ports';
import { disabledEmbedder, failingEmbedder, tableEmbedder } from '../testing/fakes';
import { spaceUnderTest } from '../testing/space-under-test';
import { remember } from '../write/write';
import { recall } from './recall';

const TENANT = { tenant: 't1' };
const SOURCE = { source: 'agent', sourceRunId: 'run-1' };
const STATED = 'acme — language: TypeScript';
const ASKED = 'what does acme write its code in';

const fact = (subject: string, value: string, scope: Record<string, string> = TENANT) => ({
  register: 'facts',
  scope,
  candidate: { subject, predicate: 'language', value, validFrom: null },
  provenance: SOURCE,
  metadata: {},
});

const ask = (fields: Partial<Parameters<typeof recall>[1]>) => ({
  scope: TENANT,
  registers: null,
  key: null,
  text: null,
  since: null,
  until: null,
  where: {},
  ...fields,
});

/** The stated fact and a question that paraphrases it, placed close; anything else lands far away. */
const embedder = () =>
  tableEmbedder({
    model: 'spec-model',
    dimensions: 4,
    table: { [STATED]: [1, 0, 0, 0], [ASKED]: [0.9, 0.1, 0, 0] },
  });

describe('recall', () => {
  it('[AGM-6] answers a key on the exact route alone, without one embedding call', async () => {
    const tableau = embedder();
    const { ctx } = spaceUnderTest({ embedder: tableau });
    await remember(ctx, fact('acme', 'TypeScript'));
    const calls = tableau.calls.length;
    const result = await recall(ctx, ask({ key: 'acme' }));
    expect(result.items.map((item) => item.record.text)).toEqual([STATED]);
    expect(result.items[0]?.routes).toEqual(['exact']);
    expect(result.routes.map((route) => route.route)).toEqual(['exact']);
    expect(tableau.calls.length).toBe(calls);
  });

  it('[AGM-6] finds a paraphrase by meaning, and merges it with an exact hit on one record', async () => {
    const { ctx } = spaceUnderTest({ embedder: embedder() });
    await remember(ctx, fact('acme', 'TypeScript'));
    const byMeaning = await recall(ctx, ask({ text: ASKED }));
    expect(byMeaning.items[0]?.record.text).toBe(STATED);
    expect(byMeaning.items[0]?.factors.similarity).toBeGreaterThan(0.9);
    const both = await recall(ctx, ask({ text: ASKED, key: 'acme' }));
    expect(both.items).toHaveLength(1);
    expect(both.items[0]?.routes).toEqual(['exact', 'semantic']);
  });

  it('[AGM-6] filters every route by the time range, and runs the temporal route when it is all a request names', async () => {
    const { ctx, clock } = spaceUnderTest({ embedder: embedder() });
    await remember(ctx, fact('acme', 'TypeScript'));
    clock.advance(86_400_000);
    await remember(ctx, fact('globex', 'Rust'));
    const since = new Date(clock().getTime() - 1).toISOString();
    expect((await recall(ctx, ask({ since }))).items.map((item) => item.record.text)).toEqual([
      'globex — language: Rust',
    ]);
    expect((await recall(ctx, ask({ since }))).routes.map((route) => route.route)).toEqual([
      'temporal',
    ]);
    expect((await recall(ctx, ask({ key: 'acme', since }))).items).toEqual([]);
  });

  it('[AGM-5] drops and counts an index hit Postgres no longer holds current', async () => {
    const { ctx, records } = spaceUnderTest({ embedder: embedder() });
    const { record } = await remember(ctx, fact('acme', 'TypeScript'));
    // Closed behind the index's back: the point is still there.
    await records.close(record.id, {
      status: 'invalidated',
      validTo: new Date(),
      closedAt: new Date(),
      reason: 'spec',
    });
    const result = await recall(ctx, ask({ text: ASKED }));
    expect(result.items).toEqual([]);
    expect(result.routes).toEqual([
      {
        route: 'semantic',
        registers: ['episodes', 'facts', 'playbooks'],
        hits: 1,
        dropped: 1,
        skipped: null,
      },
    ]);
  });

  it('[AGM-5] finds a record whose projection failed on the exact and temporal routes', async () => {
    const { ctx } = spaceUnderTest({ embedder: failingEmbedder('spec-model', 4) });
    await remember(ctx, fact('acme', 'TypeScript'));
    expect((await recall(ctx, ask({ key: 'acme' }))).items).toHaveLength(1);
    expect((await recall(ctx, ask({ since: '2000-01-01T00:00:00.000Z' }))).items).toHaveLength(1);
  });

  it('[AGM-6] says why a semantic route could not run', async () => {
    const skipOf = async (
      options: Parameters<typeof spaceUnderTest>[0],
      registers: string[] | null = null,
    ) => {
      const { ctx } = spaceUnderTest(options);
      const result = await recall(ctx, ask({ text: ASKED, registers }));
      return result.routes[0]?.skipped;
    };
    expect(await skipOf({}, ['relations'])).toBe('no_projected_register');
    expect(await skipOf({ embedder: disabledEmbedder() })).toBe('embedder_disabled');
    expect(await skipOf({ embedder: failingEmbedder('spec-model', 4) })).toBe('embedding_failed');

    const { ctx, warnings } = spaceUnderTest({ embedder: embedder() });
    const refusing: VectorIndex = {
      collection: 'spec__spec-model',
      upsert: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      search: () => Promise.reject(new Error('index down')),
    };
    const broken = { ...ctx, ports: { ...ctx.ports, index: refusing } };
    expect((await recall(broken, ask({ text: ASKED }))).routes[0]?.skipped).toBe('index_failed');
    expect(warnings).toEqual(['recall: the index refused a search: index down']);
  });

  it('[AGM-7] shows a narrower request the broader records, and a sibling nothing of another’s', async () => {
    const { ctx } = spaceUnderTest({ embedder: embedder() });
    await remember(ctx, fact('acme', 'TypeScript'));
    await remember(ctx, fact('globex', 'Rust', { tenant: 't1', user: 'u1' }));
    const texts = async (scope: Record<string, string>, key: string) =>
      (await recall(ctx, ask({ scope, key }))).items.map((item) => item.record.text);
    expect(await texts({ tenant: 't1', user: 'u1' }, 'acme')).toEqual([STATED]);
    expect(await texts({ tenant: 't1', user: 'u1' }, 'globex')).toEqual([
      'globex — language: Rust',
    ]);
    expect(await texts({ tenant: 't1', user: 'u2' }, 'globex')).toEqual([]);
    expect(await texts({ tenant: 't1' }, 'globex')).toEqual([]);
    expect(await texts({ tenant: 't2' }, 'acme')).toEqual([]);
  });
});

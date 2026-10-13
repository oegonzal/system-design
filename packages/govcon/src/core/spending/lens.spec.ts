import { z } from 'zod';

import { failure } from '../testing';
import { SnapshotCache, type LensLoad, type LensSpec } from './lens';
import { InMemorySnapshotStore } from './testing';

const T0 = new Date('2026-06-15T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const bodySchema = z.strictObject({ value: z.number() });
type Body = z.output<typeof bodySchema>;

const ok = (value: number, requests = 1): LensLoad<Body> => ({
  kind: 'ok',
  body: { value },
  asOf: '2026-06-14',
  requests,
});

/** A lens that answers the scripted replies in order, repeating the last, and remembers every query. */
function lensOf(replies: readonly LensLoad<Body>[]) {
  const queries: { id: string }[] = [];
  const spec: LensSpec<{ id: string }, Body> = {
    lens: 'pulse',
    source: 'usaspending',
    schema: bodySchema,
    disclosures: ['one declared fact'],
    async load(query) {
      queries.push(query);
      const reply = replies[Math.min(queries.length - 1, replies.length - 1)];
      if (!reply) throw new Error('no reply');
      return reply;
    },
  };
  return { spec, queries };
}

function harness(replies: readonly LensLoad<Body>[], ttlMs = 24 * HOUR) {
  const store = new InMemorySnapshotStore();
  const warnings: string[] = [];
  let now = T0;
  const cache = new SnapshotCache(
    store,
    ttlMs,
    () => now,
    (message) => warnings.push(message),
  );
  const lens = lensOf(replies);
  return {
    store,
    warnings,
    lens,
    read: (id = 'a') => cache.read(lens.spec, { id }),
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe('the snapshot cache', () => {
  it('[GOV-20] answers from a snapshot inside the TTL, refetches past it and upserts the row, and refuses a stored payload the schema rejects', async () => {
    const { store, lens, read, advance } = harness([ok(1), ok(2), ok(3)]);
    const first = await read();
    expect(first).toMatchObject({
      kind: 'ok',
      body: { value: 1 },
      provenance: {
        source: 'usaspending',
        servedFrom: 'source',
        fetchedAt: T0.toISOString(),
        asOf: '2026-06-14',
        requests: 1,
        disclosures: ['one declared fact'],
      },
    });
    expect(store.rows.size).toBe(1);

    advance(HOUR);
    expect(await read()).toMatchObject({
      kind: 'ok',
      body: { value: 1 },
      provenance: { servedFrom: 'snapshot', fetchedAt: T0.toISOString() },
    });
    expect(lens.queries).toHaveLength(1);

    expect(await read('b')).toMatchObject({
      body: { value: 2 },
      provenance: { servedFrom: 'source' },
    });
    expect(store.rows.size).toBe(2);

    advance(24 * HOUR);
    expect(await read()).toMatchObject({
      body: { value: 3 },
      provenance: { servedFrom: 'source' },
    });
    expect(store.rows.size).toBe(2);
    expect(
      [...store.rows.values()].find(
        (row) =>
          row.payload && 'value' in (row.payload as object) && (row.payload as Body).value === 3,
      ),
    ).toBeDefined();

    for (const row of store.rows.values()) row.payload = { nope: true };
    expect(await read()).toMatchObject({
      body: { value: 3 },
      provenance: { servedFrom: 'source' },
    });
    expect(lens.queries).toHaveLength(4);
  });

  it('[GOV-20] serves the stale row as stale when the refresh fails, answers the failure when there is no row, and never serves a missing answer stale', async () => {
    const refused = failure('rate-limited', 429, 'rate limited');
    const { read, advance, warnings } = harness([ok(1), refused]);
    await read();
    advance(25 * HOUR);
    const stale = await read();
    expect(stale).toMatchObject({
      kind: 'ok',
      body: { value: 1 },
      provenance: { servedFrom: 'stale', fetchedAt: T0.toISOString() },
    });
    expect(warnings[0]).toContain('rate-limited');

    const empty = harness([refused]);
    expect(await empty.read()).toEqual(refused);

    const gone = harness([ok(1), { kind: 'missing', what: 'agency', id: '999' }]);
    await gone.read();
    gone.advance(25 * HOUR);
    expect(await gone.read()).toEqual({ kind: 'missing', what: 'agency', id: '999' });

    const uncached = harness([ok(1), ok(2)], 0);
    await uncached.read();
    expect(await uncached.read()).toMatchObject({ body: { value: 2 } });
  });

  it('[GOV-2] [GOV-20] a store that cannot be read or written falls through with a warning', async () => {
    const { store, read, warnings, lens } = harness([ok(1)]);
    store.failing = new Error('down');
    expect(await read()).toMatchObject({ kind: 'ok', provenance: { servedFrom: 'source' } });
    expect(lens.queries).toHaveLength(1);
    expect(warnings).toEqual([
      'pulse: snapshot not read: down',
      'pulse: snapshot not written: down',
    ]);
  });
});

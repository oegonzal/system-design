import { DOCUMENT_MEMORY_STEP_REASONS, REGISTER_MEMORY_STEP_REASONS } from '@sysdesign/contracts';

import {
  LOOP_STORE,
  manifestEntry,
  MEMORY_URL,
  NORTH,
  settledOutcome,
  SPACE_ID,
  SPACE_STORE,
} from '../test/fakes';
import { outcomeOf } from './ingest-report';
import { STORE_STEP_REASONS, type ManifestEntry, type ManifestStep } from './ports';
import {
  covers,
  entryOf,
  HOLDS_NO_FACTS,
  leftFactsOut,
  sameStore,
  statusOf,
  throughStore,
  unstoredBy,
  whyNotStored,
} from './record';

/** A step as the manifest summarizes one, complete and clean unless the overrides say otherwise. */
const step = (overrides: Partial<ManifestStep> = {}): ManifestStep => ({
  status: 'complete',
  reason: null,
  note: null,
  counts: {},
  ...overrides,
});
const skipped = step({ status: 'skipped', reason: 'upstream-skipped', note: 'digest' });

describe('statusOf', () => {
  it('[ING-1] is earned by the store step, not read off the run: complete only when the facts were stored', () => {
    expect(statusOf(settledOutcome())).toBe('complete');
    // The loop's runner marks an orchestration complete whenever no step failed — each of these stored nothing.
    expect(
      statusOf(
        settledOutcome({
          steps: {
            digest: step({ status: 'skipped', reason: 'embeddings-disabled' }),
            store: skipped,
          },
        }),
      ),
    ).toBe('unstored');
    expect(
      statusOf(
        settledOutcome({ steps: { digest: step({ reason: 'not-accepted' }), store: skipped } }),
      ),
    ).toBe('unstored');
    expect(
      statusOf(
        settledOutcome({
          steps: {
            digest: step(),
            store: step({ status: 'skipped', reason: 'store-unavailable', note: 'down' }),
          },
        }),
      ),
    ).toBe('unstored');
    expect(statusOf(settledOutcome({ steps: { digest: null, store: null } }))).toBe('unstored');
    expect(statusOf(settledOutcome({ status: 'failed', error: 'threw' }))).toBe('failed');
  });
});

describe('unstoredBy', () => {
  const steps = (
    digest: ManifestEntry['steps']['digest'],
    store: ManifestEntry['steps']['store'],
  ): ManifestEntry['steps'] => ({ digest, store });
  const ok = step();

  it('names the first step that skipped, failed or completed with a reason, with its note; null when every step completed cleanly', () => {
    expect(unstoredBy(steps(ok, ok))).toBeNull();
    expect(
      unstoredBy(
        steps(
          step({ status: 'skipped', reason: 'embeddings-disabled', note: 'no provider' }),
          skipped,
        ),
      ),
    ).toBe('digest skipped: embeddings-disabled — no provider');
    expect(
      unstoredBy(
        steps(step({ reason: 'not-accepted', counts: { memories: 3, kept: 0 } }), skipped),
      ),
    ).toBe('digest complete: not-accepted');
    expect(
      unstoredBy(steps(ok, step({ status: 'skipped', reason: 'store-unavailable', note: 'down' }))),
    ).toBe('store skipped: store-unavailable — down');
    expect(unstoredBy(steps(ok, null))).toBe('store was not reported');
  });

  it('whyNotStored reads the failure for a failed or refused record and the steps for an unstored one, nothing for the rest', () => {
    const unstored = steps(ok, step({ status: 'skipped', reason: 'store-unavailable' }));
    expect(whyNotStored({ status: 'unstored', error: null, steps: unstored })).toBe(
      'store skipped: store-unavailable',
    );
    expect(whyNotStored({ status: 'failed', error: 'threw', steps: steps(null, null) })).toBe(
      'threw',
    );
    expect(
      whyNotStored({ status: 'refused', error: '400: no index', steps: steps(null, null) }),
    ).toBe('400: no index');
    expect(whyNotStored({ status: 'complete', error: null, steps: steps(ok, ok) })).toBeNull();
    expect(whyNotStored({ status: null, error: null, steps: steps(null, null) })).toBeNull();
  });
});

describe('covers', () => {
  /** A posting settled with nothing stored, the step that stopped it giving this reason. */
  const unstored = (reason: string, overrides: Partial<ManifestEntry> = {}): ManifestEntry =>
    manifestEntry({
      status: 'unstored',
      steps: { digest: step({ reason, counts: { memories: 0, kept: 0 } }), store: skipped },
      ...overrides,
    });

  it('[ING-1] [ING-4] classifies every reason either digesting orchestrator declares and every one the store step gives, and only those', () => {
    expect(Object.keys(HOLDS_NO_FACTS).sort()).toEqual(
      [
        ...new Set([
          ...DOCUMENT_MEMORY_STEP_REASONS,
          ...REGISTER_MEMORY_STEP_REASONS,
          ...STORE_STEP_REASONS,
        ]),
      ].sort(),
    );
    // Only a digest's verdict that the chunk holds no fact covers it; the store step's own reasons never do.
    expect(Object.entries(HOLDS_NO_FACTS).filter(([, holdsNone]) => holdsNone)).toEqual([
      ['no-memories', true],
    ]);
  });

  it('[ING-1] holds a stored posting covering, and an unstored one only where its reason says the chunk holds no fact to store — never once a retraction marks it', () => {
    expect(covers(manifestEntry())).toBe(true);
    for (const reason of Object.keys(HOLDS_NO_FACTS) as (keyof typeof HOLDS_NO_FACTS)[]) {
      expect(covers(unstored(reason)), reason).toBe(HOLDS_NO_FACTS[reason]);
    }
    // A reason nobody declares — the runner's own, a newer loop's — reads as facts missing.
    expect(covers(unstored('pipeline-unavailable'))).toBe(false);
    // The store step's own reason decides when the digest completed cleanly.
    expect(
      covers(
        manifestEntry({
          status: 'unstored',
          steps: {
            digest: step({ counts: { memories: 2 } }),
            store: step({ status: 'skipped', reason: 'store-unavailable' }),
          },
        }),
      ),
    ).toBe(false);
    const marked = { retractedAt: '2026-10-14T08:00:00.000Z', retractedPoints: 0 };
    expect(covers(manifestEntry(marked))).toBe(false);
    expect(covers(unstored('no-memories', marked))).toBe(false);
    expect(covers(manifestEntry({ status: 'failed' }))).toBe(false);
  });

  it('[ING-3] [ING-4] holds a stored posting whose step gave a reason as one that left facts of its chunk out of the store: it covers nothing, reads unstored, and says why', () => {
    const note = '1 withheld: bound to a unit of work, in a document that names none';
    const partial = manifestEntry({
      steps: {
        digest: step({ reason: 'unit-unnamed', note, counts: { memories: 2, kept: 1 } }),
        store: step({ counts: { chunks: 1 } }),
      },
    });
    expect([leftFactsOut(partial), covers(partial), outcomeOf(partial)]).toEqual([
      true,
      false,
      'unstored',
    ]);
    expect(whyNotStored(partial)).toBe(`digest complete: unit-unnamed — ${note}`);
    // A space posting applied with a memory the runtime refused: the store step says so, and the chunk is not covered.
    const refused = manifestEntry({
      sink: 'space',
      host: MEMORY_URL,
      spaceId: SPACE_ID,
      recordIds: ['r-1'],
      steps: {
        digest: step({ counts: { memories: 2, endorsed: 2, withheld: 0 } }),
        store: step({
          reason: 'items-refused',
          note: 'm2: candidate.invalid',
          counts: { items: 2, inserted: 1, refused: 1 },
        }),
      },
    });
    expect([leftFactsOut(refused), covers(refused), outcomeOf(refused)]).toEqual([
      true,
      false,
      'unstored',
    ]);
    expect([leftFactsOut(manifestEntry()), outcomeOf(manifestEntry())]).toEqual([false, 'posted']);
    expect(leftFactsOut(unstored('unit-unnamed'))).toBe(false);
  });
});

describe('entryOf', () => {
  it('[ING-4] records where a posting went and the records it left, and reads a posting without an outcome as one with nothing reported', () => {
    const outcome = settledOutcome({ recordIds: ['r-1', 'r-2'], digestRunId: 'rd-1' });
    const entry = entryOf({
      identity: manifestEntry(),
      origin: { sink: 'space', host: MEMORY_URL, spaceId: SPACE_ID, scope: NORTH },
      orchestrationRunId: outcome.orchestrationRunId,
      outcome,
      status: statusOf(outcome),
      error: null,
      ingestedAt: '2026-10-02T12:00:00.000Z',
      retractedAt: null,
      retractedPoints: null,
    });
    expect(entry).toMatchObject({
      sink: 'space',
      host: MEMORY_URL,
      spaceId: SPACE_ID,
      scope: NORTH,
      digestRunId: 'rd-1',
      recordIds: ['r-1', 'r-2'],
      status: 'complete',
      steps: outcome.steps,
    });
    const unsettled = entryOf({
      identity: manifestEntry(),
      origin: { sink: 'loop', host: 'http://loop.test', spaceId: null, scope: null },
      orchestrationRunId: null,
      outcome: null,
      status: 'refused',
      error: '400: no index',
      ingestedAt: '2026-10-02T12:00:00.000Z',
      retractedAt: null,
      retractedPoints: null,
    });
    expect(unsettled).toMatchObject({
      digestRunId: null,
      recordIds: [],
      steps: { digest: null, store: null },
      error: '400: no index',
    });
  });

  it('[ING-4] throughStore keeps the postings made through one store alone: the loop whatever host, a space under one scope — another tenant’s, another space’s and a posting that recorded no scope are other stores’', () => {
    const space = (chunkHash: string, overrides: Partial<ManifestEntry> = {}) =>
      manifestEntry({
        chunkHash,
        sink: 'space',
        host: MEMORY_URL,
        spaceId: SPACE_ID,
        scope: NORTH,
        ...overrides,
      });
    const entries = [
      manifestEntry({ chunkHash: 'l1' }),
      manifestEntry({ chunkHash: 'l2', host: 'http://other-loop.test' }),
      space('s1'),
      space('s2', { scope: { tenant: 'south' } }),
      space('s3', { spaceId: '11111111-1111-4111-8111-111111111111' }),
      space('s4', { scope: null }),
    ];
    expect(throughStore(entries, LOOP_STORE).map((entry) => entry.chunkHash)).toEqual(['l1', 'l2']);
    expect(throughStore(entries, SPACE_STORE).map((entry) => entry.chunkHash)).toEqual(['s1']);
    expect(
      throughStore(entries, { ...SPACE_STORE, scope: { tenant: 'south' } }).map(
        (entry) => entry.chunkHash,
      ),
    ).toEqual(['s2']);
    // The same keys to the same values is the same scope, whatever order they were written in.
    expect(
      sameStore(space('s5', { scope: { tenant: 'north', project: 'p' } }), {
        ...SPACE_STORE,
        scope: { project: 'p', tenant: 'north' },
      }),
    ).toBe(true);
    expect(sameStore(space('s6', { scope: { tenant: 'north', project: 'p' } }), SPACE_STORE)).toBe(
      false,
    );
  });
});

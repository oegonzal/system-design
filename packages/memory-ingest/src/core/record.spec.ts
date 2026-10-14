import { DOCUMENT_MEMORY_STEP_REASONS } from '@sysdesign/contracts';

import { manifestEntry, settledOrchestration, stepOf } from '../test/fakes';
import { outcomeOf } from './ingest-report';
import type { ManifestEntry } from './ports';
import { covers, HOLDS_NO_FACTS, leftFactsOut, statusOf, unstoredBy, whyNotStored } from './record';

describe('statusOf', () => {
  it('[ING-1] is earned by the store step, not read off the orchestration: complete only when the facts were stored', () => {
    expect(statusOf(settledOrchestration())).toBe('complete');
    // The runner marks an orchestration complete whenever no step failed — each of these stored nothing.
    const skipped = stepOf({ status: 'skipped', reason: 'upstream-skipped', note: 'digest' });
    expect(
      statusOf(
        settledOrchestration({
          steps: {
            digest: stepOf({ status: 'skipped', reason: 'embeddings-disabled' }),
            store: skipped,
          },
        }),
      ),
    ).toBe('unstored');
    expect(
      statusOf(
        settledOrchestration({
          steps: { digest: stepOf({ reason: 'not-accepted' }), store: skipped },
        }),
      ),
    ).toBe('unstored');
    expect(
      statusOf(
        settledOrchestration({
          steps: {
            digest: stepOf(),
            store: stepOf({ status: 'skipped', reason: 'store-unavailable', note: 'down' }),
          },
        }),
      ),
    ).toBe('unstored');
    expect(statusOf(settledOrchestration({ steps: {} }))).toBe('unstored');
    expect(
      statusOf(
        settledOrchestration({
          status: 'failed',
          error: { name: 'Error', message: 'threw', stack: null },
        }),
      ),
    ).toBe('failed');
  });
});

describe('unstoredBy', () => {
  const steps = (
    digest: ManifestEntry['steps']['digest'],
    store: ManifestEntry['steps']['store'],
  ): ManifestEntry['steps'] => ({ digest, store });
  const ok = { status: 'complete' as const, reason: null, note: null, counts: {} };

  it('names the first step that skipped, failed or completed with a reason, with its note; null when every step completed cleanly', () => {
    expect(unstoredBy(steps(ok, ok))).toBeNull();
    expect(
      unstoredBy(
        steps(
          { status: 'skipped', reason: 'embeddings-disabled', note: 'no provider', counts: {} },
          { status: 'skipped', reason: 'upstream-skipped', note: 'digest', counts: {} },
        ),
      ),
    ).toBe('digest skipped: embeddings-disabled — no provider');
    expect(
      unstoredBy(
        steps(
          { ...ok, reason: 'not-accepted', counts: { memories: 3, kept: 0 } },
          { status: 'skipped', reason: 'upstream-skipped', note: 'digest', counts: {} },
        ),
      ),
    ).toBe('digest complete: not-accepted');
    expect(
      unstoredBy(
        steps(ok, { status: 'skipped', reason: 'store-unavailable', note: 'down', counts: {} }),
      ),
    ).toBe('store skipped: store-unavailable — down');
    expect(unstoredBy(steps(ok, null))).toBe('store was not reported');
  });

  it('whyNotStored reads the failure for a failed or refused record and the steps for an unstored one, nothing for the rest', () => {
    const unstored = steps(ok, {
      status: 'skipped',
      reason: 'store-unavailable',
      note: null,
      counts: {},
    });
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
  /** A posting the loop settled with nothing stored, the step that stopped it giving this reason. */
  const unstored = (reason: string, overrides: Partial<ManifestEntry> = {}): ManifestEntry =>
    manifestEntry({
      status: 'unstored',
      steps: {
        digest: { status: 'complete', reason, note: null, counts: { memories: 0, kept: 0 } },
        store: { status: 'skipped', reason: 'upstream-skipped', note: 'digest', counts: {} },
      },
      ...overrides,
    });

  it('[ING-1] classifies every reason the orchestrator declares, and only those', () => {
    expect(Object.keys(HOLDS_NO_FACTS).sort()).toEqual([...DOCUMENT_MEMORY_STEP_REASONS].sort());
  });

  it('[ING-1] holds a stored posting covering, and an unstored one only where its reason says the chunk holds no fact to store — never once a retraction marks it', () => {
    expect(covers(manifestEntry())).toBe(true);
    for (const reason of DOCUMENT_MEMORY_STEP_REASONS) {
      expect(covers(unstored(reason)), reason).toBe(HOLDS_NO_FACTS[reason]);
    }
    expect(covers(unstored('no-memories'))).toBe(true);
    // A reason the orchestrator does not declare — the runner's own, a newer loop's — reads as facts missing.
    expect(covers(unstored('pipeline-unavailable'))).toBe(false);
    // The store step's own reason decides when the digest completed cleanly.
    expect(
      covers(
        manifestEntry({
          status: 'unstored',
          steps: {
            digest: { status: 'complete', reason: null, note: null, counts: { memories: 2 } },
            store: { status: 'skipped', reason: 'store-unavailable', note: null, counts: {} },
          },
        }),
      ),
    ).toBe(false);
    const marked = { retractedAt: '2026-10-14T08:00:00.000Z', retractedPoints: 0 };
    expect(covers(manifestEntry(marked))).toBe(false);
    expect(covers(unstored('no-memories', marked))).toBe(false);
    expect(covers(manifestEntry({ status: 'failed' }))).toBe(false);
  });

  it('[ING-3] holds a stored posting whose digest gave a reason as one that left facts of its chunk out of the store: it covers nothing, reads unstored, and says why', () => {
    const note = '1 withheld: bound to a unit of work, in a document that names none';
    const partial = manifestEntry({
      steps: {
        digest: {
          status: 'complete',
          reason: 'unit-unnamed',
          note,
          counts: { memories: 2, kept: 1, 'unit-unnamed': 1 },
        },
        store: { status: 'complete', reason: null, note: null, counts: { chunks: 1 } },
      },
    });
    expect([leftFactsOut(partial), covers(partial), outcomeOf(partial)]).toEqual([
      true,
      false,
      'unstored',
    ]);
    expect(whyNotStored(partial)).toBe(`digest complete: unit-unnamed — ${note}`);
    expect([leftFactsOut(manifestEntry()), outcomeOf(manifestEntry())]).toEqual([false, 'posted']);
    expect(leftFactsOut(unstored('unit-unnamed'))).toBe(false);
  });
});

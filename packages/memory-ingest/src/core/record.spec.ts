import { settledOrchestration, stepOf } from '../test/fakes';
import type { ManifestEntry } from './ports';
import { statusOf, unstoredBy, whyNotStored } from './record';

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

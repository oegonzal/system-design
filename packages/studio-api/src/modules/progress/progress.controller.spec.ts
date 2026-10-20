import type { CriterionEvidence, GetProgressResponse } from '@sysdesign/contracts';
import { CANVAS_CRITERION_KINDS } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { call, useHarness } from '../../test/harness';
import { sessionsApi, submission } from '../../test/sessions';

const verdict = (
  criterionId: string,
  kind: string,
  result: CriterionEvidence['result'],
): CriterionEvidence => ({
  criterionId,
  kind,
  result,
  hits: 2,
  confidence: 'high',
  locationRefs: [],
});

describe('GET /api/progress', () => {
  const h = useHarness();

  it('[EVAL-5] with nothing graded, every declared kind is there with zeros, and no session counts', async () => {
    const { status, body } = await call<GetProgressResponse>(`${h.url}/progress`);
    expect(status).toBe(200);
    expect(body.data.sessions).toBe(0);
    expect(body.data.competencies.map((competency) => competency.kind)).toEqual([
      ...CANVAS_CRITERION_KINDS,
    ]);
    expect(body.data.competencies.every((competency) => competency.assessed === 0)).toBe(true);
  });

  it('[EVAL-5] counts the loop’s verdicts on the author’s revisions, whether or not the grade was read back, and nothing for a run the loop never recorded', async () => {
    const { startSession, submit } = sessionsApi(h);
    const first = await startSession();
    await submit(first.sessionId, submission());
    h.loop.complete('fake-run-1', [
      {
        overall: 60,
        criteria: [
          verdict('c1', 'functional', 'pass'),
          verdict('c2', 'functional', 'fail'),
          verdict('c3', 'tradeoff', 'partial'),
          verdict('c4', 'scale', 'unassessed'),
        ],
      },
    ]);
    // A second session whose grade broke before an iteration was recorded.
    const second = await startSession();
    await submit(second.sessionId, submission());
    h.loop.fail('fake-run-2', 'the model went away');

    const { body } = await call<GetProgressResponse>(`${h.url}/progress`);
    expect(body.data.sessions).toBe(1);
    const byKind = Object.fromEntries(
      body.data.competencies.map((competency) => [competency.kind, competency]),
    );
    expect(byKind['functional']).toMatchObject({
      assessed: 2,
      passed: 1,
      partial: 0,
      failed: 1,
      recent: [0.5],
    });
    expect(byKind['functional']?.lastPractisedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(byKind['tradeoff']).toMatchObject({ assessed: 1, partial: 1, recent: [0] });
    expect(byKind['scale']).toMatchObject({ assessed: 0, lastPractisedAt: null, recent: [] });
  });
});

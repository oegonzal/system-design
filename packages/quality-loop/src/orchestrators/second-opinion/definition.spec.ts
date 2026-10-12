import type { QualityRunDto, StartOrchestrationRequest } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import type { RunInput } from '../../core/loop/run-pipeline';
import { confirmed, decision, ledger, runRecord, traceOf } from '../../core/testing';
import { validateOrchestrator } from '../runner/definition';
import { openRecord } from '../runner/record';
import { runOrchestration } from '../runner/run-orchestration';
import { orchestrationDeps, performed, summaryOf } from '../runner/testing';
import { PANEL_REPORTS } from '../panel/steps';
import { SECOND_OPINION } from './definition';

const ARTIFACT = { text: 'the answer', parts: ['one'] };

/** A judged run over the artifact given, confirming the finding keys given. */
const judged = (runId: string, artifact: unknown, findings: string[], overall = 80) =>
  runRecord(
    runId,
    traceOf({
      artifact,
      decision: decision({ scores: { dimensions: {}, overall } }),
      ledger: ledger({
        findings: findings.map((key) => confirmed({ key, type: key.split('|')[0] })),
      }),
    }),
  );

/** The first call produces the artifact; every later call judges whatever it was handed. */
function deps(firstFindings: string[], panelFindings: string[][]) {
  const asked: RunInput[] = [];
  const harness = orchestrationDeps<unknown>(undefined, (request, onOpened) => {
    asked.push({
      goal: request.goal,
      output: request.output,
      maxIterations: request.maxIterations,
    });
    const call = asked.length;
    const run =
      call === 1
        ? judged('first', ARTIFACT, firstFindings, 82)
        : judged(`p-${call - 1}`, request.output, panelFindings[call - 2] ?? [], 76);
    onOpened?.(run);
    return Promise.resolve(run);
  });
  return { harness, asked };
}

const request: StartOrchestrationRequest = { pipeline: 'tiny', goal: 'g', samples: 2 };

describe('the second-opinion orchestrator', () => {
  it('[QL-19] is valid data: a first opinion, a panel over the same pipeline, a reconcile over both', () => {
    expect(() => validateOrchestrator(SECOND_OPINION as never)).not.toThrow();
    expect(SECOND_OPINION.takesTarget).toBe(true);
    expect(SECOND_OPINION.steps.map((step) => step.id)).toEqual(['first', 'panel', 'reconcile']);
    expect(
      SECOND_OPINION.refuse?.({ pipeline: 'experience-digest', goal: 'g' }, [
        summaryOf('experience-digest', 80, 'composed'),
      ]),
    ).toMatch(/not a target/);
  });

  it('[QL-19] hands the first artifact to every panel sample, judge-only, and reconciles the first opinion with them', async () => {
    const { harness, asked } = deps(['gap|x', 'leak|z'], [['gap|x'], ['gap|x', 'leak|z']]);
    const record = await performed(SECOND_OPINION, request, harness);

    expect(asked).toEqual([
      { goal: 'g', output: undefined, maxIterations: undefined },
      { goal: 'g', output: ARTIFACT, maxIterations: 1 },
      { goal: 'g', output: ARTIFACT, maxIterations: 1 },
    ]);
    expect(record.status).toBe('complete');
    expect(record.steps['first']).toMatchObject({
      status: 'complete',
      runIds: ['first'],
      counts: { iterations: 1, overall: 82 },
    });
    expect(record.steps['panel']).toMatchObject({
      status: 'complete',
      runIds: ['p-1', 'p-2'],
      counts: { lenses: 1, samples: 2, completed: 2, failed: 0 },
    });
    expect(record.steps['reconcile']).toMatchObject({
      status: 'complete',
      counts: { runs: 3, decisions: 1, contestedTypes: 1, contestedFindings: 1, overallRange: 6 },
    });
    expect(record.steps['reconcile'].report).toMatchObject({
      alignment: 'provided',
      unanimous: { findingTypes: ['gap'], findings: ['gap|x'] },
      contested: { findings: [{ key: 'leak|z', type: 'leak', seenBy: [0, 2] }] },
    });
  });

  it('[QL-19] a first opinion with no artifact skips the panel, and the reconcile with it', async () => {
    const { harness } = deps([], []);
    harness.execute = (_, onOpened) => {
      const run = runRecord('first', { ...traceOf(), iterations: [], bestIteration: 0 });
      onOpened?.(run);
      return Promise.resolve(run);
    };
    const record = await performed(SECOND_OPINION, request, harness);
    expect(record.steps['panel']).toMatchObject({
      status: 'skipped',
      reason: 'no-artifact',
      note: 'first',
    });
    expect(record.steps['reconcile']).toMatchObject({
      status: 'skipped',
      reason: 'upstream-skipped',
      note: 'panel',
    });
  });

  it('[QL-19] a provided run stands in for the first opinion, and its artifact is what the panel judges', async () => {
    const { harness, asked } = deps([], [['gap|x'], ['gap|x']]);
    const provided: QualityRunDto = judged('given', ARTIFACT, ['gap|x', 'leak|z'], 82);
    const record = openRecord(SECOND_OPINION, request, provided, {}, 1, () => 'now');
    expect(record.steps['first']).toMatchObject({
      status: 'skipped',
      reason: 'provided-run',
      runIds: ['given'],
    });
    // The stand-in counts as a call the fake never sees: shift its script by one.
    harness.execute = (req, onOpened) => {
      asked.push({ goal: req.goal, output: req.output, maxIterations: req.maxIterations });
      const run = judged(`p-${asked.length}`, req.output, ['gap|x'], 76);
      onOpened?.(run);
      return Promise.resolve(run);
    };
    await runOrchestration(SECOND_OPINION, record, request, provided, harness);
    expect(asked.map((input) => input.output)).toEqual([ARTIFACT, ARTIFACT]);
    expect(record.steps['panel']).toMatchObject({ status: 'complete', runIds: ['p-1', 'p-2'] });
    expect(record.steps['reconcile'].report).toMatchObject({
      runs: 3,
      contested: { findings: [{ key: 'leak|z', type: 'leak', seenBy: [0] }] },
    });
  });

  it('[QL-67] declares an empty context and the panel report both panel orchestrators share', () => {
    expect(Object.keys(SECOND_OPINION.reports)).toEqual(['reconcile']);
    expect(SECOND_OPINION.reports.reconcile).toBe(PANEL_REPORTS.reconcile);
    expect(SECOND_OPINION.contextSchema.safeParse({}).success).toBe(true);
  });
});

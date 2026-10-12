import type { StartOrchestrationRequest } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { decision, runRecord, traceOf } from '../../core/testing';
import { validateOrchestrator } from '../runner/definition';
import { orchestrationDeps, performed, summaryOf } from '../runner/testing';
import { CALIBRATION } from './definition';

/** Every sample answers with a judged run whose overall climbs by five. */
function harness() {
  const asked: { pipeline: string; goal: string }[] = [];
  const deps = orchestrationDeps<unknown>(undefined, (request, onOpened) => {
    asked.push({ pipeline: request.pipeline, goal: request.goal });
    const overall = 70 + asked.length * 5;
    const run = runRecord(
      `r-${asked.length}`,
      traceOf({ decision: decision({ scores: { dimensions: { a: overall }, overall } }) }),
      { pipeline: request.pipeline },
    );
    onOpened?.(run);
    return Promise.resolve(run);
  });
  return { deps, asked };
}

const perform = async (request: StartOrchestrationRequest) => {
  const { deps, asked } = harness();
  const record = await performed(CALIBRATION, request, deps);
  return { record, asked };
};

describe('the calibration orchestrator', () => {
  it('[QL-19] is valid data: a panel over the request’s pipeline, then a reconcile', () => {
    expect(() => validateOrchestrator(CALIBRATION as never)).not.toThrow();
    expect(CALIBRATION.takesTarget).toBe(true);
    expect(CALIBRATION.steps.map((step) => step.id)).toEqual(['panel', 'reconcile']);
    const registry = [summaryOf('tiny'), summaryOf('memory-recall', 80, 'composed')];
    expect(CALIBRATION.refuse?.({ pipeline: 'memory-recall', goal: 'g' }, registry)).toMatch(
      /not a target/,
    );
    expect(CALIBRATION.refuse?.({ pipeline: 'tiny', goal: 'g' }, registry)).toBeNull();
  });

  it('[QL-19] runs the goal `samples` times through the named pipeline and reports the spread, naming every child', async () => {
    const { record, asked } = await perform({ pipeline: 'tiny', goal: 'g', samples: 3 });
    expect(asked).toEqual([
      { pipeline: 'tiny', goal: 'g' },
      { pipeline: 'tiny', goal: 'g' },
      { pipeline: 'tiny', goal: 'g' },
    ]);
    expect(record.status).toBe('complete');
    expect(record.request.samples).toBe(3);
    expect(record.steps['panel']).toMatchObject({
      status: 'complete',
      reason: null,
      runIds: ['r-1', 'r-2', 'r-3'],
      counts: { lenses: 1, samples: 3, completed: 3, failed: 0 },
    });
    expect(record.steps['reconcile']).toMatchObject({
      status: 'complete',
      runIds: [],
      counts: { runs: 3, decisions: 1, contestedTypes: 0, contestedFindings: 0, overallRange: 10 },
    });
    expect(record.steps['reconcile'].report).toMatchObject({
      alignment: 'produced',
      runs: 3,
      overall: { n: 3, min: 75, max: 85, mean: 80, range: 10 },
      dimensions: { a: { n: 3, range: 10 } },
      contested: { decision: false, findingTypes: [], findings: [] },
    });
  });

  it('[QL-19] one sample is honest: the panel completes and the reconcile says it had too few runs', async () => {
    const { record } = await perform({ pipeline: 'tiny', goal: 'g', samples: 1 });
    expect(record.status).toBe('complete');
    expect(record.steps['panel']).toMatchObject({ status: 'complete', runIds: ['r-1'] });
    expect(record.steps['reconcile']).toMatchObject({
      status: 'skipped',
      reason: 'too-few-runs',
      counts: { runs: 1 },
      report: null,
    });
  });

  it('[QL-67] declares an empty context and the panel report both panel orchestrators share', () => {
    expect(Object.keys(CALIBRATION.reports)).toEqual(['reconcile']);
    expect(CALIBRATION.contextSchema.safeParse({}).success).toBe(true);
    expect(CALIBRATION.contextSchema.safeParse({ seen: true }).success).toBe(false);
  });
});

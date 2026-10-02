import { describe, expect, it } from 'vitest';

import {
  makeMemoryOrchestration,
  makeOrchestration,
  makeRunningOrchestration,
  makeTwoIterationRun,
  MEMORY_SOURCE_RUN_ID,
  ORCHESTRATION_CHILD_IDS,
} from '../../../testing/fixtures';
import { childrenToRead, dataFlow, flowTotals, MAX_CHILDREN_READ } from './data-flow';
import { deriveOrchestration } from './derive-orchestration';
import { reduceAll } from './reduce';
import { emptyState } from './state';

const flowOf = (record = makeOrchestration(), children = {}) =>
  dataFlow(reduceAll(emptyState(), deriveOrchestration(record)), children);

describe('an orchestration as a column of steps', () => {
  it('[QLU-12] lists the steps in declared order with what each published and opened', () => {
    const flow = flowOf();
    expect(flow.steps.map((step) => [step.stepId, step.order])).toEqual([
      ['panel', 0],
      ['reconcile', 1],
    ]);
    expect(flow.orchestrator).toBe('calibration');
    expect(flow.pipeline).toBe('system-design');
    expect(flow.steps[0].children.map((child) => child.runId)).toEqual(ORCHESTRATION_CHILD_IDS);
    // A step's report is what the steps after it could read.
    expect(flow.steps[0].published).toBeNull();
    expect(flow.steps[1].published).toMatchObject({ runs: 3, alignment: 'produced' });
  });

  it('[QLU-12] draws only the blocks the record names, and says the graph is partial', () => {
    // The orchestrator's own `needs` declaration is not published, so a skip
    // that names the step which blocked it is the one edge that can be proven.
    const blocked = makeOrchestration({
      status: 'failed',
      steps: {
        panel: {
          ...makeOrchestration().steps['panel'],
          status: 'failed',
          reason: 'run-failed',
          note: 'kaboom',
        },
        reconcile: {
          ...makeOrchestration().steps['reconcile'],
          status: 'skipped',
          reason: 'upstream-failed',
          note: 'panel',
          report: null,
        },
      },
    });
    const flow = flowOf(blocked);
    expect(flow.edges).toEqual([{ from: 'panel', to: 'reconcile', reason: 'upstream-failed' }]);
    expect(flow.steps[1].blockedBy).toBe('panel');
    expect(flow.steps[0].blocked).toEqual(['reconcile']);
    expect(flow.partial).toBe(true);

    // A note that is not a step id is not turned into an edge.
    expect(flowOf().edges).toEqual([]);
    expect(flowOf().steps[0].blockedBy).toBeNull();
  });

  it('[QLU-12] a step that never ran did not open the run it names — that run stood in', () => {
    // Where a provided run stands in for a step, the runner settles the step with
    // that run's id and never starts it, so the record stamps no start. Reading
    // the id as a child would say a skipped step opened a run, which is false.
    const flow = flowOf(makeMemoryOrchestration());
    const byId = Object.fromEntries(flow.steps.map((step) => [step.stepId, step]));
    expect(flow.steps.map((step) => [step.stepId, step.ran])).toEqual([
      ['recall', false],
      ['target', false],
      ['digest', true],
      ['store', true],
    ]);
    expect(byId['target'].children).toEqual([]);
    expect(byId['target'].standIns.map((child) => child.runId)).toEqual([MEMORY_SOURCE_RUN_ID]);
    // A step that did run owns the runs it names.
    expect(byId['digest'].standIns).toEqual([]);
    expect(byId['digest'].children).toHaveLength(1);
    expect(flowTotals(flow)).toMatchObject({ steps: 4, children: 1, standIns: 1, unread: 2 });
    // And a stand-in is never mistaken for a block: the reason is the
    // orchestrator's own, and only the runner's blocking reasons draw an edge.
    expect(flow.edges).toEqual([]);
  });

  it('[QLU-12] a run that stood in is still worth reading, so it is in the read list', () => {
    const flow = flowOf(makeMemoryOrchestration());
    expect(childrenToRead(flow, null)).toContain(MEMORY_SOURCE_RUN_ID);
    expect(childrenToRead(flow, MEMORY_SOURCE_RUN_ID)[0]).toBe(MEMORY_SOURCE_RUN_ID);
  });

  it('[QLU-12] a child not yet read is listed by id and said to be unread', () => {
    const run = makeTwoIterationRun();
    const flow = flowOf(makeOrchestration(), {
      [ORCHESTRATION_CHILD_IDS[0]]: { ...run, runId: ORCHESTRATION_CHILD_IDS[0] },
    });
    const [read, ...rest] = flow.steps[0].children;
    expect(read).toMatchObject({
      unread: false,
      pipeline: 'system-design',
      status: 'complete',
      finalDecision: 'accept',
      iterations: 2,
      overall: 100,
    });
    expect(rest.every((child) => child.unread)).toBe(true);
    expect(flowTotals(flow)).toMatchObject({ steps: 2, children: 3, standIns: 0, unread: 2 });
  });

  it('[QLU-12] a pending step is counted but publishes nothing', () => {
    const flow = flowOf(makeRunningOrchestration());
    expect(flowTotals(flow).byStatus).toEqual({
      pending: 1,
      running: 1,
      complete: 0,
      skipped: 0,
      failed: 0,
    });
    // The pending step is in the record's ledger, so it is shown — with no
    // children and nothing published.
    expect(flow.steps[1]).toMatchObject({ stepId: 'reconcile', children: [], published: null });
  });

  it('[QLU-12] the child read order puts the one being inspected first, and is bounded', () => {
    const flow = flowOf();
    expect(childrenToRead(flow, ORCHESTRATION_CHILD_IDS[2])).toEqual([
      ORCHESTRATION_CHILD_IDS[2],
      ORCHESTRATION_CHILD_IDS[0],
      ORCHESTRATION_CHILD_IDS[1],
    ]);
    // A run id that is not a child of this orchestration does not reorder anything.
    expect(childrenToRead(flow, 'somewhere-else')).toEqual([...ORCHESTRATION_CHILD_IDS]);
    expect(childrenToRead(flow, null, 2)).toHaveLength(2);
    expect(MAX_CHILDREN_READ).toBe(12);
  });

  it('[QLU-12] no orchestration is an empty column rather than a crash', () => {
    const flow = dataFlow(emptyState(), {});
    expect(flow.steps).toEqual([]);
    expect(flow.orchestrator).toBeNull();
    expect(flowTotals(flow)).toMatchObject({ steps: 0, children: 0, unread: 0 });
  });
});
